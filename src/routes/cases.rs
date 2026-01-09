//! 案件管理路由模块
//! 
//! 实现案件 CRUD、搜索功能，连接真实数据库

use axum::{
    extract::{Path, Query, State},
    response::Json,
    routing::get,
    Router,
};
use chrono::Datelike;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use sea_orm::prelude::Decimal;
use std::sync::Arc;
use std::{collections::HashSet, str::FromStr};
use sea_orm::{
    ActiveEnum,
    ActiveModelTrait,
    ColumnTrait,
    Condition,
    ConnectionTrait,
    DatabaseBackend,
    EntityTrait,
    PaginatorTrait,
    QueryFilter,
    QueryOrder,
    QuerySelect,
    Statement,
    TransactionTrait,
};
use uuid::Uuid;
use validator::Validate;

use crate::db::AppState;
use crate::error::{AppError, AppResult};
use crate::entity::case::{self, CaseStatus};
use crate::entity::case_member;
use crate::entity::{chat_participant, chat_thread, conflict_check};
use crate::security::case_access::require_case_access;
use crate::security::current_user::CurrentUser;
use crate::security::permissions::{require_permission, Permission};
use crate::security::validation::{require_non_empty, ValidatedJson};

/// 案件响应
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseResponse {
    pub id: String,
    pub case_code: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub service_type: String,
    pub client_id: String,
    pub handler_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<case::Model> for CaseResponse {
    fn from(model: case::Model) -> Self {
        Self {
            id: model.id,
            case_code: model.case_code,
            title: model.title,
            description: model.description,
            status: model.status.to_value(),
            service_type: model.service_type.to_value(),
            client_id: model.client_id,
            handler_id: model.handler_id,
            created_at: model.created_at,
            updated_at: model.updated_at,
        }
    }
}

/// 案件列表查询参数
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CaseListQuery {
    /// 页码（从1开始）
    pub page: Option<u64>,
    /// 每页数量
    pub page_size: Option<u64>,
    /// 状态筛选
    pub status: Option<String>,
    /// 搜索关键词
    pub search: Option<String>,
}

/// 分页响应
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedResponse<T> {
    pub data: Vec<T>,
    pub total: u64,
    pub page: u64,
    pub page_size: u64,
    pub total_pages: u64,
}

// =============================================================================
// Create Case
// =============================================================================

#[derive(Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CreateCaseRequest {
    #[validate(length(min = 1, max = 200, message = "案件标题不能为空"))]
    pub title: String,

    #[validate(length(min = 1, max = 32, message = "serviceType 无效"))]
    pub service_type: String,

    #[validate(length(min = 1, max = 16, message = "billingMode 无效"))]
    pub billing_mode: String,

    #[validate(custom(function = "crate::security::validation::validate_uuid_str"))]
    pub client_id: String,

    #[validate(custom(function = "crate::security::validation::validate_uuid_str"))]
    pub originator_id: Option<String>,

    #[validate(custom(function = "crate::security::validation::validate_uuid_str"))]
    pub handler_id: Option<String>,

    #[validate(length(min = 1, max = 5000, message = "description 长度不合法"))]
    pub description: Option<String>,

    /// 合同金额（Decimal 字符串）
    pub contract_value: Option<String>,

    /// 额外成员（UUID 列表）
    pub member_ids: Option<Vec<String>>,

    /// 对方当事人（用于利益冲突检查）
    pub opposing_parties: Option<Vec<String>>,

    #[validate(custom(function = "crate::security::validation::validate_uuid_str"))]
    pub template_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictDetail {
    pub entity_type: String,
    pub entity_id: String,
    pub entity_name: String,
    pub reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictResult {
    pub has_conflict: bool,
    pub details: Vec<ConflictDetail>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCaseResponse {
    pub case_id: String,
    pub case_code: String,
    pub conflict_check: ConflictResult,
}

fn parse_service_type(value: &str) -> Option<case::ServiceType> {
    match value.trim().to_uppercase().as_str() {
        "LITIGATION" => Some(case::ServiceType::Litigation),
        "NON_LITIGATION" => Some(case::ServiceType::NonLitigation),
        "ADVISORY" => Some(case::ServiceType::Advisory),
        "ARBITRATION" => Some(case::ServiceType::Arbitration),
        _ => None,
    }
}

fn parse_billing_mode(value: &str) -> Option<case::BillingMode> {
    match value.trim().to_uppercase().as_str() {
        "HOURLY" => Some(case::BillingMode::Hourly),
        "FIXED" => Some(case::BillingMode::Fixed),
        "CAPPED" => Some(case::BillingMode::Capped),
        _ => None,
    }
}

fn service_type_code(service_type: &case::ServiceType) -> &'static str {
    match service_type {
        case::ServiceType::Litigation => "LT",
        case::ServiceType::NonLitigation => "NL",
        case::ServiceType::Advisory => "AD",
        case::ServiceType::Arbitration => "AR",
    }
}

async fn generate_case_code(txn: &sea_orm::DatabaseTransaction, service_type: &case::ServiceType) -> AppResult<String> {
    let year = Utc::now().year();
    let prefix = format!("LC-{year}-{}", service_type_code(service_type));
    let like = format!("{prefix}-%");

    let last = case::Entity::find()
        .filter(case::Column::CaseCode.like(like))
        .order_by_desc(case::Column::CaseCode)
        .one(txn)
        .await
        .map_err(|e| AppError::Database(format!("查询案号失败: {e}")))?;

    let mut next_num: i32 = 1;
    if let Some(last_case) = last {
        let last_num = last_case
            .case_code
            .split('-')
            .nth(3)
            .and_then(|s| s.parse::<i32>().ok())
            .unwrap_or(0);
        next_num = last_num.saturating_add(1);
    }

    Ok(format!("{prefix}-{:03}", next_num))
}

async fn check_conflict(
    txn: &sea_orm::DatabaseTransaction,
    opposing_parties: &[String],
) -> AppResult<ConflictResult> {
    let mut details: Vec<ConflictDetail> = Vec::new();

    for party_name in opposing_parties {
        let trimmed = party_name.trim();
        if trimmed.is_empty() {
            return Err(AppError::Validation("opposing_parties 包含空字符串".to_string()));
        }

        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            r#"SELECT id, name FROM "Contact" WHERE name ILIKE $1 LIMIT 1"#,
            vec![format!("%{trimmed}%").into()],
        );
        let row = txn
            .query_one(stmt)
            .await
            .map_err(|e| AppError::Database(format!("查询对方当事人失败: {e}")))?;

        let Some(row) = row else { continue };

        let contact_id: String = row
            .try_get("", "id")
            .map_err(|_| AppError::Database("解析 Contact.id 失败".to_string()))?;
        let contact_name: String = row
            .try_get("", "name")
            .map_err(|_| AppError::Database("解析 Contact.name 失败".to_string()))?;

        let has_active_case = case::Entity::find()
            .filter(case::Column::ClientId.eq(&contact_id))
            .filter(case::Column::Status.is_in(vec![CaseStatus::Intake, CaseStatus::Active]))
            .one(txn)
            .await
            .map_err(|e| AppError::Database(format!("查询冲突案件失败: {e}")))?
            .is_some();

        if has_active_case {
            details.push(ConflictDetail {
                entity_type: "CLIENT".to_string(),
                entity_id: contact_id,
                entity_name: contact_name,
                reason: format!("对方当事人\"{trimmed}\"是本所现有客户，存在利益冲突风险"),
            });
        }
    }

    Ok(ConflictResult {
        has_conflict: !details.is_empty(),
        details,
    })
}

/// 获取案件列表
/// 
/// GET /api/v1/cases
async fn list_cases(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Query(query): Query<CaseListQuery>,
) -> AppResult<Json<PaginatedResponse<CaseResponse>>> {
    let role = current_user.model.role.clone();
    require_permission(role.clone(), Permission::CaseView)?;

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).min(100);

    // 构建查询
    let mut select = case::Entity::find()
        .order_by_desc(case::Column::CreatedAt);

    // 可见性（Partner/Admin 视为全量；其它角色按 “originator/handler/members” 过滤）
    if !matches!(role, crate::entity::user::Role::Partner | crate::entity::user::Role::Admin) {
        let member_case_ids: Vec<String> = case_member::Entity::find()
            .filter(case_member::Column::UserId.eq(current_user.id()))
            .select_only()
            .column(case_member::Column::CaseId)
            .into_values::<String, case_member::Column>()
            .all(&state.db)
            .await
            .map_err(|e| AppError::Database(format!("查询案件成员失败: {}", e)))?;

        let mut visibility = Condition::any()
            .add(case::Column::OriginatorId.eq(current_user.id()))
            .add(case::Column::HandlerId.eq(current_user.id()));
        if !member_case_ids.is_empty() {
            visibility = visibility.add(case::Column::Id.is_in(member_case_ids));
        }

        select = select.filter(visibility);
    }

    // 状态筛选
    if let Some(status_str) = &query.status {
        let status = match status_str.to_uppercase().as_str() {
            "LEAD" => Some(CaseStatus::Lead),
            "INTAKE" => Some(CaseStatus::Intake),
            "ACTIVE" => Some(CaseStatus::Active),
            "SUSPENDED" => Some(CaseStatus::Suspended),
            "CLOSED" => Some(CaseStatus::Closed),
            "ARCHIVED" => Some(CaseStatus::Archived),
            _ => None,
        };
        if let Some(s) = status {
            select = select.filter(case::Column::Status.eq(s));
        }
    }

    // 搜索
    if let Some(search) = &query.search {
        let q = search.trim();
        if !q.is_empty() {
            select = select.filter(
                Condition::any()
                    .add(case::Column::Title.contains(q))
                    .add(case::Column::CaseCode.contains(q)),
            );
        }
    }

    // 分页
    let paginator = select.paginate(&state.db, page_size);
    let total = paginator.num_items().await
        .map_err(|e| AppError::Database(format!("计数失败: {}", e)))?;
    let total_pages = paginator.num_pages().await
        .map_err(|e| AppError::Database(format!("分页失败: {}", e)))?;

    let cases = paginator.fetch_page(page - 1).await
        .map_err(|e| AppError::Database(format!("查询失败: {}", e)))?;

    let data: Vec<CaseResponse> = cases.into_iter().map(CaseResponse::from).collect();

    Ok(Json(PaginatedResponse {
        data,
        total,
        page,
        page_size,
        total_pages,
    }))
}

/// 获取案件详情
/// 
/// GET /api/v1/cases/:id
async fn get_case(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(case_id): Path<String>,
) -> AppResult<Json<CaseResponse>> {
    Uuid::parse_str(&case_id).map_err(|_| AppError::Validation("案件ID 无效".to_string()))?;

    let role = current_user.model.role.clone();
    let case_model = require_case_access(&state, &case_id, current_user.id(), role, Permission::CaseView).await?;

    Ok(Json(CaseResponse::from(case_model)))
}

/// 创建案件
///
/// POST /api/v1/cases
async fn create_case(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    ValidatedJson(payload): ValidatedJson<CreateCaseRequest>,
) -> AppResult<Json<CreateCaseResponse>> {
    let role = current_user.model.role.clone();
    require_permission(role.clone(), Permission::CaseCreate)?;

    let service_type = parse_service_type(&payload.service_type).ok_or_else(|| AppError::Validation("serviceType 无效".to_string()))?;
    let billing_mode = parse_billing_mode(&payload.billing_mode).ok_or_else(|| AppError::Validation("billingMode 无效".to_string()))?;

    let handler_id = payload
        .handler_id
        .clone()
        .ok_or_else(|| AppError::Validation("必须指定 handler_id".to_string()))?;
    let originator_id = payload.originator_id.clone().unwrap_or_else(|| current_user.id().to_string());

    let title = require_non_empty(&payload.title, "title", 200)?;

    let description = payload.description.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()).map(|s| s.to_string());

    let contract_value = match payload.contract_value.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        None => None,
        Some(v) => Some(Decimal::from_str(v).map_err(|_| AppError::Validation("contractValue 无效".to_string()))?),
    };

    let member_ids = payload.member_ids.clone().unwrap_or_default();
    for id in &member_ids {
        Uuid::parse_str(id).map_err(|_| AppError::Validation("member_ids 包含无效 UUID".to_string()))?;
    }

    let opposing_parties = payload.opposing_parties.clone().unwrap_or_default();
    for name in &opposing_parties {
        if name.trim().is_empty() {
            return Err(AppError::Validation("opposing_parties 包含空字符串".to_string()));
        }
    }

    let initial_stage: Option<String> = match service_type {
        case::ServiceType::Litigation | case::ServiceType::Arbitration => Some("INTAKE_CONSULTATION".to_string()),
        case::ServiceType::NonLitigation => Some("DUE_DILIGENCE".to_string()),
        case::ServiceType::Advisory => None,
    };

    let result = state
        .db
        .transaction(|txn| {
            let client_id = payload.client_id.clone();
            let template_id = payload.template_id.clone();
            let member_ids = member_ids.clone();
            let opposing_parties = opposing_parties.clone();
            let claims_sub = current_user.id().to_string();
            let title = title.clone();
            let description = description.clone();
            let contract_value = contract_value.clone();
            let service_type = service_type.clone();
            let billing_mode = billing_mode.clone();
            let handler_id = handler_id.clone();
            let originator_id = originator_id.clone();
            let initial_stage = initial_stage.clone();

            Box::pin(async move {
                // 1) 校验客户存在（避免外键错误被吞成 500）
                let stmt = Statement::from_sql_and_values(
                    DatabaseBackend::Postgres,
                    r#"SELECT 1 FROM "Contact" WHERE id = $1 LIMIT 1"#,
                    vec![client_id.clone().into()],
                );
                let exists = txn
                    .query_one(stmt)
                    .await
                    .map_err(|e| AppError::Database(format!("查询客户失败: {e}")))?;
                if exists.is_none() {
                    return Err(AppError::NotFound("客户不存在".to_string()));
                }

                // 2) 生成案号
                let case_code = generate_case_code(txn, &service_type).await?;

                // 3) 创建案件
                let active_case = case::ActiveModel {
                    id: sea_orm::ActiveValue::Set(Uuid::new_v4().to_string()),
                    tenant_id: sea_orm::ActiveValue::Set("default-tenant".to_string()),
                    case_code: sea_orm::ActiveValue::Set(case_code.clone()),
                    title: sea_orm::ActiveValue::Set(title),
                    status: sea_orm::ActiveValue::Set(CaseStatus::Intake),
                    service_type: sea_orm::ActiveValue::Set(service_type),
                    billing_mode: sea_orm::ActiveValue::Set(billing_mode),
                    client_id: sea_orm::ActiveValue::Set(client_id),
                    originator_id: sea_orm::ActiveValue::Set(Some(originator_id)),
                    handler_id: sea_orm::ActiveValue::Set(Some(handler_id.clone())),
                    description: sea_orm::ActiveValue::Set(description),
                    contract_value: sea_orm::ActiveValue::Set(contract_value),
                    metadata: sea_orm::ActiveValue::Set(None),
                    current_stage: sea_orm::ActiveValue::Set(initial_stage),
                    template_id: sea_orm::ActiveValue::Set(template_id),
                    channel_id: sea_orm::ActiveValue::Set(None),
                    ..Default::default()
                };

                let new_case = active_case
                    .insert(txn)
                    .await
                    .map_err(|e| AppError::Database(format!("创建案件失败: {e}")))?;

                // 4) 添加承办律师为成员
                let handler_member = case_member::ActiveModel {
                    id: sea_orm::ActiveValue::Set(Uuid::new_v4().to_string()),
                    case_id: sea_orm::ActiveValue::Set(new_case.id.clone()),
                    user_id: sea_orm::ActiveValue::Set(handler_id.clone()),
                    role: sea_orm::ActiveValue::Set(case_member::CaseRole::Handler),
                    ..Default::default()
                };
                handler_member
                    .insert(txn)
                    .await
                    .map_err(|e| AppError::Database(format!("添加承办成员失败: {e}")))?;

                // 5) 添加其它成员
                let mut uniq_members: HashSet<String> = HashSet::new();
                for id in member_ids {
                    if id == handler_id {
                        continue;
                    }
                    uniq_members.insert(id);
                }

                for user_id in uniq_members.iter() {
                    let member = case_member::ActiveModel {
                        id: sea_orm::ActiveValue::Set(Uuid::new_v4().to_string()),
                        case_id: sea_orm::ActiveValue::Set(new_case.id.clone()),
                        user_id: sea_orm::ActiveValue::Set(user_id.clone()),
                        role: sea_orm::ActiveValue::Set(case_member::CaseRole::Member),
                        ..Default::default()
                    };
                    member
                        .insert(txn)
                        .await
                        .map_err(|e| AppError::Database(format!("添加案件成员失败: {e}")))?;
                }

                // 6) 利益冲突检查
                let conflict = if opposing_parties.is_empty() {
                    ConflictResult { has_conflict: false, details: vec![] }
                } else {
                    check_conflict(txn, &opposing_parties).await?
                };

                let conflicts_json = if conflict.details.is_empty() {
                    None
                } else {
                    Some(serde_json::to_value(&conflict.details).map_err(|_| AppError::Database("序列化 conflictsWith 失败".to_string()))?)
                };

                let conflict_record = conflict_check::ActiveModel {
                    id: sea_orm::ActiveValue::Set(Uuid::new_v4().to_string()),
                    case_id: sea_orm::ActiveValue::Set(new_case.id.clone()),
                    check_result: sea_orm::ActiveValue::Set(if conflict.has_conflict { "CONFLICT".to_string() } else { "CLEAR".to_string() }),
                    conflicts_with: sea_orm::ActiveValue::Set(conflicts_json),
                    notes: sea_orm::ActiveValue::Set(None),
                    checked_by_id: sea_orm::ActiveValue::Set(claims_sub.clone()),
                    checked_at: sea_orm::ActiveValue::Set(Utc::now()),
                };
                conflict_record
                    .insert(txn)
                    .await
                    .map_err(|e| AppError::Database(format!("写入冲突检查失败: {e}")))?;

                // 7) 自动创建案件群聊（ChatThread + Participants）
                let thread = chat_thread::ActiveModel {
                    id: sea_orm::ActiveValue::Set(Uuid::new_v4().to_string()),
                    key: sea_orm::ActiveValue::Set(format!("CASE:{}", new_case.id)),
                    thread_type: sea_orm::ActiveValue::Set(chat_thread::ChatThreadType::Case),
                    title: sea_orm::ActiveValue::Set(format!("案件群聊｜{}", new_case.case_code)),
                    case_id: sea_orm::ActiveValue::Set(Some(new_case.id.clone())),
                    created_by_id: sea_orm::ActiveValue::Set(claims_sub.clone()),
                    ..Default::default()
                };
                let thread = thread
                    .insert(txn)
                    .await
                    .map_err(|e| AppError::Database(format!("创建案件群聊失败: {e}")))?;

                let mut participants: HashSet<String> = HashSet::new();
                participants.insert(claims_sub.clone());
                if let Some(originator) = new_case.originator_id.clone() {
                    participants.insert(originator);
                }
                if let Some(handler) = new_case.handler_id.clone() {
                    participants.insert(handler);
                }
                for user_id in uniq_members.iter() {
                    participants.insert(user_id.clone());
                }

                for user_id in participants {
                    let participant = chat_participant::ActiveModel {
                        id: sea_orm::ActiveValue::Set(Uuid::new_v4().to_string()),
                        thread_id: sea_orm::ActiveValue::Set(thread.id.clone()),
                        user_id: sea_orm::ActiveValue::Set(user_id),
                        ..Default::default()
                    };
                    participant
                        .insert(txn)
                        .await
                        .map_err(|e| AppError::Database(format!("添加群聊成员失败: {e}")))?;
                }

                Ok(CreateCaseResponse {
                    case_id: new_case.id,
                    case_code: new_case.case_code,
                    conflict_check: conflict,
                })
            })
        })
        .await
        .map_err(|e| match e {
            sea_orm::TransactionError::Connection(db) => AppError::Database(format!("事务连接失败: {db}")),
            sea_orm::TransactionError::Transaction(app) => app,
        })?;

    Ok(Json(result))
}

/// 创建认证路由
pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list_cases).post(create_case))
        .route("/:id", get(get_case))
}
