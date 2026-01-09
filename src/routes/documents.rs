//! 文档中心路由模块（真实闭环）
//!
//! 对齐 Web 主线 `lawclick-next/src/actions/documents.ts` 的核心行为：
//! - 上传：Multipart（file + fields）→ MinIO/S3 → 写 `Document/DocumentVersion`
//! - 下载：受控 API（后端鉴权 + 案件可见性）→ S3 GetObject
//! - 权限：`document:view` / `document:upload` + `case:view`

use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use chrono::{DateTime, SecondsFormat, Utc};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, QuerySelect, TransactionTrait,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::Arc;
use uuid::Uuid;

use crate::db::AppState;
use crate::entity::{case, case_member, document, document_version};
use crate::error::{AppError, AppResult};
use crate::security::case_access::require_case_access;
use crate::security::current_user::CurrentUser;
use crate::security::permissions::{require_permission, Permission};
use crate::security::validation::require_non_empty;

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DocumentListQuery {
    pub case_id: Option<String>,
    pub category: Option<String>,
    pub query: Option<String>,
    pub only_favorites: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentListItem {
    pub id: String,
    pub title: String,
    pub case_id: String,
    pub category: Option<String>,
    pub file_type: Option<String>,
    pub file_size: i32,
    pub version: i32,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentVersionItem {
    pub id: String,
    pub version: i32,
    pub file_key: String,
    pub file_type: String,
    pub file_size: i32,
    pub uploader_id: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentDetailResponse {
    pub id: String,
    pub title: String,
    pub case_id: String,
    pub category: Option<String>,
    pub notes: Option<String>,
    pub tags: Vec<String>,
    pub file_url: Option<String>,
    pub file_type: Option<String>,
    pub file_size: i32,
    pub version: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub versions: Vec<DocumentVersionItem>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DownloadQuery {
    pub version: Option<i32>,
}

fn sanitize_filename(filename: &str) -> String {
    filename
        .replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "-")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn build_object_key(case_id: &str, document_id: &str, version: i32, filename: &str) -> String {
    let safe = sanitize_filename(if filename.trim().is_empty() { "document" } else { filename });
    let ts = Utc::now()
        .to_rfc3339_opts(SecondsFormat::Millis, true)
        .replace([':', '.'], "-");
    format!("cases/{case_id}/documents/{document_id}/v{version}/{ts}-{safe}")
}

async fn get_accessible_case_ids(state: &AppState, user_id: &str) -> AppResult<HashSet<String>> {
    let member_case_ids: Vec<String> = case_member::Entity::find()
        .filter(case_member::Column::UserId.eq(user_id))
        .select_only()
        .column(case_member::Column::CaseId)
        .into_values::<String, case_member::Column>()
        .all(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询案件成员失败: {e}")))?;

    let direct_case_ids: Vec<String> = case::Entity::find()
        .filter(
            sea_orm::Condition::any()
                .add(case::Column::OriginatorId.eq(user_id))
                .add(case::Column::HandlerId.eq(user_id)),
        )
        .select_only()
        .column(case::Column::Id)
        .into_values::<String, case::Column>()
        .all(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询案件失败: {e}")))?;

    let mut set: HashSet<String> = HashSet::new();
    set.extend(member_case_ids);
    set.extend(direct_case_ids);
    Ok(set)
}

async fn list_documents(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Query(query): Query<DocumentListQuery>,
) -> AppResult<Json<Vec<DocumentListItem>>> {
    require_permission(current_user.model.role.clone(), Permission::DocumentView)?;

    let mut select = document::Entity::find().order_by_desc(document::Column::UpdatedAt);

    // case 维度过滤：有 caseId → 强校验案件可见性；无 caseId → 仅返回可见案件的文档
    if let Some(case_id) = query.case_id.as_deref().map(|v| v.trim()).filter(|v| !v.is_empty()) {
        Uuid::parse_str(case_id).map_err(|_| AppError::Validation("caseId 无效".to_string()))?;
        require_case_access(
            &state,
            case_id,
            current_user.id(),
            current_user.model.role.clone(),
            Permission::CaseView,
        )
        .await?;
        select = select.filter(document::Column::CaseId.eq(case_id));
    } else if matches!(current_user.model.role, crate::entity::user::Role::Partner | crate::entity::user::Role::Admin) {
        // 全量可见
    } else {
        let accessible = get_accessible_case_ids(&state, current_user.id()).await?;
        if accessible.is_empty() {
            return Ok(Json(vec![]));
        }
        select = select.filter(document::Column::CaseId.is_in(accessible.into_iter().collect::<Vec<_>>()));
    }

    if let Some(category) = query.category.as_deref().map(|v| v.trim()).filter(|v| !v.is_empty()) {
        if category.len() > 64 {
            return Err(AppError::Validation("category 长度不合法".to_string()));
        }
        select = select.filter(document::Column::Category.eq(category));
    }

    if query.only_favorites.unwrap_or(false) {
        select = select.filter(document::Column::IsFavorite.eq(true));
    }

    if let Some(q) = query.query.as_deref().map(|v| v.trim()).filter(|v| !v.is_empty()) {
        if q.len() > 200 {
            return Err(AppError::Validation("query 长度不合法".to_string()));
        }
        select = select.filter(document::Column::Title.contains(q));
    }

    let docs = select
        .all(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询文档失败: {e}")))?;

    Ok(Json(
        docs.into_iter()
            .map(|d| DocumentListItem {
                id: d.id,
                title: d.title,
                case_id: d.case_id,
                category: d.category,
                file_type: d.file_type,
                file_size: d.file_size,
                version: d.version,
                updated_at: d.updated_at,
            })
            .collect(),
    ))
}

async fn get_document(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(document_id): Path<String>,
) -> AppResult<Json<DocumentDetailResponse>> {
    Uuid::parse_str(&document_id).map_err(|_| AppError::Validation("documentId 无效".to_string()))?;
    require_permission(current_user.model.role.clone(), Permission::DocumentView)?;

    let doc = document::Entity::find_by_id(&document_id)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询文档失败: {e}")))?
        .ok_or_else(|| AppError::NotFound("文档不存在".to_string()))?;

    require_case_access(
        &state,
        &doc.case_id,
        current_user.id(),
        current_user.model.role.clone(),
        Permission::CaseView,
    )
    .await?;

    let versions = document_version::Entity::find()
        .filter(document_version::Column::DocumentId.eq(&document_id))
        .order_by_desc(document_version::Column::Version)
        .all(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询文档版本失败: {e}")))?;

    Ok(Json(DocumentDetailResponse {
        id: doc.id,
        title: doc.title,
        case_id: doc.case_id,
        category: doc.category,
        notes: doc.notes,
        tags: doc.tags,
        file_url: doc.file_url,
        file_type: doc.file_type,
        file_size: doc.file_size,
        version: doc.version,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        versions: versions
            .into_iter()
            .map(|v| DocumentVersionItem {
                id: v.id,
                version: v.version,
                file_key: v.file_key,
                file_type: v.file_type,
                file_size: v.file_size,
                uploader_id: v.uploader_id,
                created_at: v.created_at,
            })
            .collect(),
    }))
}

async fn download_document_file(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(document_id): Path<String>,
    Query(query): Query<DownloadQuery>,
) -> AppResult<Response> {
    Uuid::parse_str(&document_id).map_err(|_| AppError::Validation("documentId 无效".to_string()))?;
    require_permission(current_user.model.role.clone(), Permission::DocumentView)?;

    let doc = document::Entity::find_by_id(&document_id)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询文档失败: {e}")))?
        .ok_or_else(|| AppError::NotFound("文档不存在".to_string()))?;

    require_case_access(
        &state,
        &doc.case_id,
        current_user.id(),
        current_user.model.role.clone(),
        Permission::CaseView,
    )
    .await?;

    let mut file_key = doc.file_url.clone();
    let mut content_type = doc.file_type.clone();

    if let Some(version) = query.version {
        let v = document_version::Entity::find()
            .filter(document_version::Column::DocumentId.eq(&document_id))
            .filter(document_version::Column::Version.eq(version))
            .one(&state.db)
            .await
            .map_err(|e| AppError::Database(format!("查询文档版本失败: {e}")))?
            .ok_or_else(|| AppError::NotFound("文档版本不存在".to_string()))?;
        file_key = Some(v.file_key);
        content_type = Some(v.file_type);
    }

    let file_key = file_key.ok_or_else(|| AppError::NotFound("文档尚未上传文件".to_string()))?;
    let obj = state.storage.get_object(&file_key).await?;

    let mut headers = HeaderMap::new();
    let ct = obj
        .content_type
        .or(content_type)
        .unwrap_or_else(|| "application/octet-stream".to_string());
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_str(&ct).unwrap_or(HeaderValue::from_static("application/octet-stream")));
    headers.insert(header::CONTENT_LENGTH, HeaderValue::from_str(&obj.bytes.len().to_string()).unwrap_or(HeaderValue::from_static("0")));

    // 受控下载：默认 attachment
    let disposition = format!("attachment; filename=\"{}\"", sanitize_filename(&doc.title));
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&disposition).unwrap_or(HeaderValue::from_static("attachment")),
    );

    Ok((StatusCode::OK, headers, Body::from(obj.bytes)).into_response())
}

async fn upload_document(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    mut multipart: Multipart,
) -> AppResult<Json<serde_json::Value>> {
    require_permission(current_user.model.role.clone(), Permission::DocumentUpload)?;

    let mut file_bytes: Option<Vec<u8>> = None;
    let mut file_name: Option<String> = None;
    let mut file_type: Option<String> = None;

    let mut case_id: Option<String> = None;
    let mut document_id: Option<String> = None;
    let mut title_input: Option<String> = None;
    let mut category: Option<String> = None;
    let mut notes: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::Validation(format!("multipart 解析失败: {e}")))? {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" {
            file_name = field.file_name().map(|v| v.to_string());
            file_type = field.content_type().map(|v| v.to_string());
            let bytes = field
                .bytes()
                .await
                .map_err(|e| AppError::Validation(format!("读取文件失败: {e}")))?;
            file_bytes = Some(bytes.to_vec());
            continue;
        }

        let value = field
            .text()
            .await
            .map_err(|e| AppError::Validation(format!("读取字段失败: {e}")))?;
        let trimmed = value.trim().to_string();
        match name.as_str() {
            "caseId" => case_id = if trimmed.is_empty() { None } else { Some(trimmed) },
            "documentId" => document_id = if trimmed.is_empty() { None } else { Some(trimmed) },
            "title" => title_input = if trimmed.is_empty() { None } else { Some(trimmed) },
            "category" => category = if trimmed.is_empty() { None } else { Some(trimmed) },
            "notes" => notes = if trimmed.is_empty() { None } else { Some(trimmed) },
            _ => {}
        }
    }

    let bytes = file_bytes.ok_or_else(|| AppError::Validation("缺少文件".to_string()))?;
    let file_size_i32 = i32::try_from(bytes.len()).map_err(|_| AppError::Validation("文件过大".to_string()))?;
    let file_type = file_type.unwrap_or_else(|| "application/octet-stream".to_string());

    if let Some(doc_id) = document_id.as_deref() {
        Uuid::parse_str(doc_id).map_err(|_| AppError::Validation("documentId 无效".to_string()))?;

        let existing = document::Entity::find_by_id(doc_id)
            .one(&state.db)
            .await
            .map_err(|e| AppError::Database(format!("查询文档失败: {e}")))?
            .ok_or_else(|| AppError::NotFound("文档不存在".to_string()))?;

        require_case_access(
            &state,
            &existing.case_id,
            current_user.id(),
            current_user.model.role.clone(),
            Permission::CaseView,
        )
        .await?;

        let is_first_upload = existing.file_url.as_deref().map(|v| v.trim()).unwrap_or("").is_empty();
        let next_version = if is_first_upload { 1 } else { existing.version.saturating_add(1) };
        let title = title_input.clone().unwrap_or_else(|| existing.title.clone());

        let key = build_object_key(
            &existing.case_id,
            &existing.id,
            next_version,
            file_name.as_deref().unwrap_or(&title),
        );

        state.storage.put_object(&key, bytes, Some(&file_type)).await?;

        let now = Utc::now();
        state
            .db
            .transaction(|txn| {
                let uploader_id = Some(current_user.id().to_string());
                let key = key.clone();
                let file_type = file_type.clone();
                let title_input = title_input.clone();
                let category = category.clone();
                let notes = notes.clone();
                let existing = existing.clone();
                Box::pin(async move {
                    let existing_id = existing.id.clone();
                    let version_row = document_version::ActiveModel {
                        id: sea_orm::ActiveValue::Set(Uuid::new_v4().to_string()),
                        document_id: sea_orm::ActiveValue::Set(existing_id.clone()),
                        version: sea_orm::ActiveValue::Set(next_version),
                        file_key: sea_orm::ActiveValue::Set(key.clone()),
                        file_type: sea_orm::ActiveValue::Set(file_type.clone()),
                        file_size: sea_orm::ActiveValue::Set(file_size_i32),
                        uploader_id: sea_orm::ActiveValue::Set(uploader_id.clone()),
                        created_at: sea_orm::ActiveValue::Set(now),
                    };
                    version_row
                        .insert(txn)
                        .await
                        .map_err(|e| AppError::Database(format!("写入文档版本失败: {e}")))?;

                    let mut doc_active: document::ActiveModel = existing.into();
                    if let Some(title) = title_input.as_deref().map(|v| v.trim()).filter(|v| !v.is_empty()) {
                        doc_active.title = sea_orm::ActiveValue::Set(require_non_empty(title, "title", 200)?);
                    }
                    if let Some(cat) = category.as_deref().map(|v| v.trim()).filter(|v| !v.is_empty()) {
                        if cat.len() > 64 {
                            return Err(AppError::Validation("category 长度不合法".to_string()));
                        }
                        doc_active.category = sea_orm::ActiveValue::Set(Some(cat.to_string()));
                    }
                    if let Some(n) = notes.as_deref().map(|v| v.trim()).filter(|v| !v.is_empty()) {
                        if n.len() > 20_000 {
                            return Err(AppError::Validation("notes 长度不合法".to_string()));
                        }
                        doc_active.notes = sea_orm::ActiveValue::Set(Some(n.to_string()));
                    }
                    doc_active.file_url = sea_orm::ActiveValue::Set(Some(key));
                    doc_active.file_type = sea_orm::ActiveValue::Set(Some(file_type));
                    doc_active.file_size = sea_orm::ActiveValue::Set(file_size_i32);
                    doc_active.version = sea_orm::ActiveValue::Set(next_version);
                    doc_active.uploader_id = sea_orm::ActiveValue::Set(uploader_id);
                    doc_active.updated_at = sea_orm::ActiveValue::Set(now);

                    doc_active
                        .update(txn)
                        .await
                        .map_err(|e| AppError::Database(format!("更新文档失败: {e}")))?;

                    Ok(serde_json::json!({ "success": true, "documentId": existing_id }))
                })
            })
            .await
            .map_err(|e| match e {
                sea_orm::TransactionError::Connection(db) => AppError::Database(format!("事务连接失败: {db}")),
                sea_orm::TransactionError::Transaction(app) => app,
            })
            .map(Json)
    } else {
        let cid = case_id.ok_or_else(|| AppError::Validation("必须选择关联案件".to_string()))?;
        Uuid::parse_str(&cid).map_err(|_| AppError::Validation("caseId 无效".to_string()))?;

        require_case_access(
            &state,
            &cid,
            current_user.id(),
            current_user.model.role.clone(),
            Permission::CaseView,
        )
        .await?;

        let title = title_input
            .clone()
            .or_else(|| file_name.clone())
            .unwrap_or_else(|| "未命名文档".to_string());
        let title = require_non_empty(&title, "title", 200)?;

        if let Some(cat) = category.as_deref() {
            if cat.len() > 64 {
                return Err(AppError::Validation("category 长度不合法".to_string()));
            }
        }
        if let Some(n) = notes.as_deref() {
            if n.len() > 20_000 {
                return Err(AppError::Validation("notes 长度不合法".to_string()));
            }
        }

        let new_document_id = Uuid::new_v4().to_string();
        let version = 1;
        let key = build_object_key(&cid, &new_document_id, version, file_name.as_deref().unwrap_or(&title));

        state.storage.put_object(&key, bytes, Some(&file_type)).await?;

        let now = Utc::now();
        state
            .db
            .transaction(|txn| {
                let uploader_id = Some(current_user.id().to_string());
                let title = title.clone();
                let category = category.clone();
                let notes = notes.clone();
                let key = key.clone();
                let file_type = file_type.clone();
                let cid = cid.clone();
                let new_document_id = new_document_id.clone();
                Box::pin(async move {
                    let doc = document::ActiveModel {
                        id: sea_orm::ActiveValue::Set(new_document_id.clone()),
                        title: sea_orm::ActiveValue::Set(title),
                        file_url: sea_orm::ActiveValue::Set(Some(key.clone())),
                        file_type: sea_orm::ActiveValue::Set(Some(file_type.clone())),
                        file_size: sea_orm::ActiveValue::Set(file_size_i32),
                        version: sea_orm::ActiveValue::Set(version),
                        category: sea_orm::ActiveValue::Set(category),
                        tags: sea_orm::ActiveValue::Set(vec![]),
                        notes: sea_orm::ActiveValue::Set(notes),
                        uploader_id: sea_orm::ActiveValue::Set(uploader_id.clone()),
                        created_at: sea_orm::ActiveValue::Set(now),
                        updated_at: sea_orm::ActiveValue::Set(now),
                        case_id: sea_orm::ActiveValue::Set(cid),
                        ..Default::default()
                    };
                    doc.insert(txn)
                        .await
                        .map_err(|e| AppError::Database(format!("创建文档失败: {e}")))?;

                    let version_row = document_version::ActiveModel {
                        id: sea_orm::ActiveValue::Set(Uuid::new_v4().to_string()),
                        document_id: sea_orm::ActiveValue::Set(new_document_id.clone()),
                        version: sea_orm::ActiveValue::Set(version),
                        file_key: sea_orm::ActiveValue::Set(key),
                        file_type: sea_orm::ActiveValue::Set(file_type),
                        file_size: sea_orm::ActiveValue::Set(file_size_i32),
                        uploader_id: sea_orm::ActiveValue::Set(uploader_id),
                        created_at: sea_orm::ActiveValue::Set(now),
                    };
                    version_row
                        .insert(txn)
                        .await
                        .map_err(|e| AppError::Database(format!("写入文档版本失败: {e}")))?;

                    Ok(serde_json::json!({ "success": true, "documentId": new_document_id }))
                })
            })
            .await
            .map_err(|e| match e {
                sea_orm::TransactionError::Connection(db) => AppError::Database(format!("事务连接失败: {db}")),
                sea_orm::TransactionError::Transaction(app) => app,
            })
            .map(Json)
    }
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list_documents))
        .route("/upload", post(upload_document))
        .route("/:id", get(get_document))
        .route("/:id/file", get(download_document_file))
}
