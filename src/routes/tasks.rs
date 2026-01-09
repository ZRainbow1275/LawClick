//! 任务协作路由模块（真实闭环）
//!
//! 对齐 Web 主线 `lawclick-next/src/actions/tasks-crud.ts` 的核心行为：
//! - 鉴权：JWT Claims
//! - 权限：`task:create` / `task:edit` + `case:view`
//! - 可见性：按案件可见性过滤（originator/handler/members）
//! - 持久化：真实写入 PostgreSQL（与 Prisma 同库）

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::get,
    Router,
};
use chrono::{DateTime, Utc};
use sea_orm::{ActiveEnum, ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;
use validator::Validate;

use crate::db::AppState;
use crate::entity::task;
use crate::error::{AppError, AppResult};
use crate::security::case_access::require_case_access;
use crate::security::current_user::CurrentUser;
use crate::security::permissions::{require_permission, Permission};
use crate::security::validation::{require_non_empty, ValidatedJson};

const TASK_POSITION_GAP: i32 = 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskResponse {
    pub id: String,
    pub case_id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: String,
    pub due_date: Option<DateTime<Utc>>,
    pub stage: Option<String>,
    pub swimlane: Option<String>,
    pub task_type: Option<String>,
    pub document_id: Option<String>,
    pub estimated_hours: Option<f64>,
    pub order: i32,
    pub assignee_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<task::Model> for TaskResponse {
    fn from(model: task::Model) -> Self {
        Self {
            id: model.id,
            case_id: model.case_id,
            title: model.title,
            description: model.description,
            status: model.status.to_value(),
            priority: model.priority.to_value(),
            due_date: model.due_date,
            stage: model.stage,
            swimlane: model.swimlane,
            task_type: model.task_type,
            document_id: model.document_id,
            estimated_hours: model.estimated_hours,
            order: model.order,
            assignee_id: model.assignee_id,
            created_at: model.created_at,
            updated_at: model.updated_at,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskListQuery {
    pub case_id: String,
}

#[derive(Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskRequest {
    #[validate(custom(function = "crate::security::validation::validate_uuid_str"))]
    pub case_id: String,

    #[validate(length(min = 1, max = 200, message = "任务标题不能为空"))]
    pub title: String,

    #[validate(length(min = 1, max = 5000, message = "任务描述长度不合法"))]
    pub description: Option<String>,

    pub status: Option<String>,
    pub priority: Option<String>,
    pub due_date: Option<DateTime<Utc>>,

    #[validate(custom(function = "crate::security::validation::validate_uuid_str"))]
    pub assignee_id: Option<String>,

    #[validate(length(min = 1, max = 64, message = "stage 长度不合法"))]
    pub stage: Option<String>,

    #[validate(length(min = 1, max = 64, message = "swimlane 长度不合法"))]
    pub swimlane: Option<String>,

    #[validate(length(min = 1, max = 64, message = "taskType 长度不合法"))]
    pub task_type: Option<String>,

    #[validate(custom(function = "crate::security::validation::validate_uuid_str"))]
    pub document_id: Option<String>,

    pub estimated_hours: Option<f64>,
}

#[derive(Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaskRequest {
    #[validate(length(min = 1, max = 200, message = "任务标题长度不合法"))]
    pub title: Option<String>,

    #[validate(length(min = 1, max = 5000, message = "任务描述长度不合法"))]
    pub description: Option<String>,

    pub status: Option<String>,
    pub priority: Option<String>,
    pub due_date: Option<DateTime<Utc>>,

    #[validate(custom(function = "crate::security::validation::validate_uuid_str"))]
    pub assignee_id: Option<String>,

    #[validate(length(min = 1, max = 64, message = "stage 长度不合法"))]
    pub stage: Option<String>,

    #[validate(length(min = 1, max = 64, message = "swimlane 长度不合法"))]
    pub swimlane: Option<String>,

    #[validate(length(min = 1, max = 64, message = "taskType 长度不合法"))]
    pub task_type: Option<String>,

    #[validate(custom(function = "crate::security::validation::validate_uuid_str"))]
    pub document_id: Option<String>,

    pub estimated_hours: Option<f64>,
    pub order: Option<i32>,
}

fn parse_task_status(raw: Option<&str>) -> AppResult<task::TaskStatus> {
    match raw.map(|s| s.trim()).filter(|s| !s.is_empty()) {
        None => Ok(task::TaskStatus::Todo),
        Some(v) => match v.to_uppercase().as_str() {
            "TODO" => Ok(task::TaskStatus::Todo),
            "IN_PROGRESS" => Ok(task::TaskStatus::InProgress),
            "REVIEW" => Ok(task::TaskStatus::Review),
            "DONE" => Ok(task::TaskStatus::Done),
            _ => Err(AppError::Validation("无效的任务状态".to_string())),
        },
    }
}

fn parse_task_priority(raw: Option<&str>) -> AppResult<task::TaskPriority> {
    match raw.map(|s| s.trim()).filter(|s| !s.is_empty()) {
        None => Ok(task::TaskPriority::P2Medium),
        Some(v) => match v.to_uppercase().as_str() {
            "P0_URGENT" => Ok(task::TaskPriority::P0Urgent),
            "P1_HIGH" => Ok(task::TaskPriority::P1High),
            "P2_MEDIUM" => Ok(task::TaskPriority::P2Medium),
            "P3_LOW" => Ok(task::TaskPriority::P3Low),
            _ => Err(AppError::Validation("无效的任务优先级".to_string())),
        },
    }
}

async fn list_case_tasks(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Query(query): Query<TaskListQuery>,
) -> AppResult<Json<Vec<TaskResponse>>> {
    Uuid::parse_str(&query.case_id).map_err(|_| AppError::Validation("case_id 无效".to_string()))?;

    let role = current_user.model.role.clone();
    // 读任务必须具备案件可见性
    require_case_access(&state, &query.case_id, current_user.id(), role, Permission::CaseView).await?;

    let tasks = task::Entity::find()
        .filter(task::Column::CaseId.eq(&query.case_id))
        .order_by_asc(task::Column::Order)
        .all(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询任务失败: {e}")))?;

    Ok(Json(tasks.into_iter().map(TaskResponse::from).collect()))
}

async fn get_task(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(task_id): Path<String>,
) -> AppResult<Json<TaskResponse>> {
    Uuid::parse_str(&task_id).map_err(|_| AppError::Validation("任务ID 无效".to_string()))?;

    let role = current_user.model.role.clone();
    require_permission(role.clone(), Permission::CaseView)?;

    let task_model = task::Entity::find_by_id(&task_id)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询任务失败: {e}")))?
        .ok_or_else(|| AppError::NotFound(format!("任务 {} 不存在", task_id)))?;

    require_case_access(&state, &task_model.case_id, current_user.id(), role, Permission::CaseView).await?;

    Ok(Json(TaskResponse::from(task_model)))
}

async fn create_task(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    ValidatedJson(payload): ValidatedJson<CreateTaskRequest>,
) -> AppResult<Json<TaskResponse>> {
    let role = current_user.model.role.clone();
    require_permission(role.clone(), Permission::TaskCreate)?;
    // 与主线一致：创建任务仍需具备案件可见性（case:view）
    require_case_access(&state, &payload.case_id, current_user.id(), role, Permission::CaseView).await?;

    let title = require_non_empty(&payload.title, "title", 200)?;
    let status = parse_task_status(payload.status.as_deref())?;
    let priority = parse_task_priority(payload.priority.as_deref())?;

    let swimlane = payload.swimlane.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()).map(|s| s.to_string());
    let stage = payload.stage.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()).map(|s| s.to_string());
    let task_type = payload.task_type.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()).map(|s| s.to_string());

    // 计算当前列/泳道最大 order
    let mut max_query = task::Entity::find()
        .filter(task::Column::CaseId.eq(&payload.case_id))
        .filter(task::Column::Status.eq(status.clone()));
    max_query = match swimlane.as_deref() {
        Some(v) => max_query.filter(task::Column::Swimlane.eq(v)),
        None => max_query.filter(task::Column::Swimlane.is_null()),
    };

    let max_order = max_query
        .order_by_desc(task::Column::Order)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询任务排序失败: {e}")))?
        .map(|t| t.order)
        .unwrap_or(0);

    let order = max_order.saturating_add(TASK_POSITION_GAP);

    let active = task::ActiveModel {
        id: sea_orm::ActiveValue::Set(Uuid::new_v4().to_string()),
        case_id: sea_orm::ActiveValue::Set(payload.case_id.clone()),
        title: sea_orm::ActiveValue::Set(title),
        description: sea_orm::ActiveValue::Set(payload.description),
        status: sea_orm::ActiveValue::Set(status),
        priority: sea_orm::ActiveValue::Set(priority),
        swimlane: sea_orm::ActiveValue::Set(swimlane),
        order: sea_orm::ActiveValue::Set(order),
        due_date: sea_orm::ActiveValue::Set(payload.due_date),
        stage: sea_orm::ActiveValue::Set(stage),
        task_type: sea_orm::ActiveValue::Set(task_type),
        document_id: sea_orm::ActiveValue::Set(payload.document_id),
        estimated_hours: sea_orm::ActiveValue::Set(payload.estimated_hours),
        assignee_id: sea_orm::ActiveValue::Set(payload.assignee_id),
        ..Default::default()
    };

    let inserted = active
        .insert(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("创建任务失败: {e}")))?;

    Ok(Json(TaskResponse::from(inserted)))
}

async fn update_task(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(task_id): Path<String>,
    ValidatedJson(payload): ValidatedJson<UpdateTaskRequest>,
) -> AppResult<Json<TaskResponse>> {
    Uuid::parse_str(&task_id).map_err(|_| AppError::Validation("任务ID 无效".to_string()))?;

    let role = current_user.model.role.clone();
    require_permission(role.clone(), Permission::TaskEdit)?;

    let existing = task::Entity::find_by_id(&task_id)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询任务失败: {e}")))?
        .ok_or_else(|| AppError::NotFound(format!("任务 {} 不存在", task_id)))?;

    require_case_access(&state, &existing.case_id, current_user.id(), role, Permission::CaseView).await?;

    let mut active: task::ActiveModel = existing.into();

    if let Some(title) = payload.title.as_deref() {
        active.title = sea_orm::ActiveValue::Set(require_non_empty(title, "title", 200)?);
    }

    if let Some(desc) = payload.description.as_deref() {
        active.description = sea_orm::ActiveValue::Set(Some(require_non_empty(desc, "description", 5000)?));
    }

    if let Some(status) = payload.status.as_deref() {
        active.status = sea_orm::ActiveValue::Set(parse_task_status(Some(status))?);
    }

    if let Some(priority) = payload.priority.as_deref() {
        active.priority = sea_orm::ActiveValue::Set(parse_task_priority(Some(priority))?);
    }

    if let Some(due_date) = payload.due_date {
        active.due_date = sea_orm::ActiveValue::Set(Some(due_date));
    }

    if let Some(assignee_id) = payload.assignee_id.as_deref() {
        active.assignee_id = sea_orm::ActiveValue::Set(Some(assignee_id.trim().to_string()));
    }

    if let Some(stage) = payload.stage.as_deref() {
        active.stage = sea_orm::ActiveValue::Set(Some(stage.trim().to_string()));
    }

    if let Some(swimlane) = payload.swimlane.as_deref() {
        active.swimlane = sea_orm::ActiveValue::Set(Some(swimlane.trim().to_string()));
    }

    if let Some(task_type) = payload.task_type.as_deref() {
        active.task_type = sea_orm::ActiveValue::Set(Some(task_type.trim().to_string()));
    }

    if let Some(document_id) = payload.document_id.as_deref() {
        active.document_id = sea_orm::ActiveValue::Set(Some(document_id.trim().to_string()));
    }

    if let Some(estimated_hours) = payload.estimated_hours {
        active.estimated_hours = sea_orm::ActiveValue::Set(Some(estimated_hours));
    }

    if let Some(order) = payload.order {
        active.order = sea_orm::ActiveValue::Set(order);
    }

    active.updated_at = sea_orm::ActiveValue::Set(Utc::now());

    let updated = active
        .update(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("更新任务失败: {e}")))?;

    Ok(Json(TaskResponse::from(updated)))
}

async fn delete_task(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(task_id): Path<String>,
) -> AppResult<StatusCode> {
    Uuid::parse_str(&task_id).map_err(|_| AppError::Validation("任务ID 无效".to_string()))?;

    let role = current_user.model.role.clone();
    require_permission(role.clone(), Permission::TaskDelete)?;

    let existing = task::Entity::find_by_id(&task_id)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询任务失败: {e}")))?
        .ok_or_else(|| AppError::NotFound(format!("任务 {} 不存在", task_id)))?;

    require_case_access(&state, &existing.case_id, current_user.id(), role, Permission::CaseView).await?;

    task::Entity::delete_by_id(&task_id)
        .exec(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("删除任务失败: {e}")))?;

    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list_case_tasks).post(create_task))
        .route("/:id", get(get_task).patch(update_task).delete(delete_task))
}
