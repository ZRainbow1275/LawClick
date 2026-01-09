//! 工时追踪路由模块（真实闭环）
//!
//! 对齐 Web 主线 `lawclick-next/src/actions/timelogs-crud.ts` 的核心行为：
//! - 开始计时：必须关联案件/任务；同一用户仅允许 1 个 RUNNING/PAUSED
//! - 暂停/恢复/停止：仅允许本人操作
//! - 计费：停止时快照费率并计算金额（秒→小时）
//! - 可见性：关联案件需满足案件可见性（originator/handler/members）

use axum::{
    extract::{Path, State},
    response::Json,
    routing::{get, post},
    Router,
};
use chrono::{DateTime, Utc};
use sea_orm::{ActiveEnum, ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;
use validator::Validate;

use crate::db::AppState;
use crate::entity::{task, time_log, user};
use crate::error::{AppError, AppResult};
use crate::security::case_access::require_case_access;
use crate::security::current_user::CurrentUser;
use crate::security::permissions::{require_permission, Permission};
use crate::security::validation::{require_non_empty, ValidatedJson};

#[derive(Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct StartTimerRequest {
    #[validate(custom(function = "crate::security::validation::validate_uuid_str"))]
    pub case_id: Option<String>,

    #[validate(custom(function = "crate::security::validation::validate_uuid_str"))]
    pub task_id: Option<String>,

    #[validate(length(min = 1, max = 5000, message = "description 长度不合法"))]
    pub description: String,

    pub is_billable: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartTimerResponse {
    pub time_log_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StopTimerResponse {
    pub duration: i32,
    pub billing_rate: Option<String>,
    pub billing_amount: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveTimerResponse {
    pub id: String,
    pub description: String,
    pub status: String,
    pub start_time: DateTime<Utc>,
    pub duration: i32,
    pub case_id: Option<String>,
    pub task_id: Option<String>,
}

async fn start_timer(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    ValidatedJson(payload): ValidatedJson<StartTimerRequest>,
) -> AppResult<Json<StartTimerResponse>> {
    let role = current_user.model.role.clone();
    require_permission(role.clone(), Permission::CaseView)?;

    let mut case_id = payload.case_id.clone();

    if case_id.is_none() && payload.task_id.is_some() {
        let task_id = payload.task_id.as_deref().unwrap_or_default();
        Uuid::parse_str(task_id).map_err(|_| AppError::Validation("task_id 无效".to_string()))?;

        let task_model = task::Entity::find_by_id(task_id)
            .one(&state.db)
            .await
            .map_err(|e| AppError::Database(format!("查询任务失败: {e}")))?
            .ok_or_else(|| AppError::NotFound("任务不存在".to_string()))?;

        case_id = Some(task_model.case_id);
    }

    let case_id = case_id.ok_or_else(|| AppError::Validation("计时必须关联案件/任务".to_string()))?;
    Uuid::parse_str(&case_id).map_err(|_| AppError::Validation("case_id 无效".to_string()))?;

    require_case_access(&state, &case_id, current_user.id(), role, Permission::CaseView).await?;

    // 同一用户只允许 1 个活动计时
    let active = time_log::Entity::find()
        .filter(time_log::Column::UserId.eq(current_user.id()))
        .filter(time_log::Column::Status.is_in(vec![time_log::TimeLogStatus::Running, time_log::TimeLogStatus::Paused]))
        .one(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询计时状态失败: {e}")))?;

    if active.is_some() {
        return Err(AppError::Validation("您有正在进行的计时，请先停止".to_string()));
    }

    let description = require_non_empty(&payload.description, "description", 5000)?;

    let active_model = time_log::ActiveModel {
        id: sea_orm::ActiveValue::Set(Uuid::new_v4().to_string()),
        user_id: sea_orm::ActiveValue::Set(current_user.id().to_string()),
        case_id: sea_orm::ActiveValue::Set(Some(case_id)),
        task_id: sea_orm::ActiveValue::Set(payload.task_id.clone()),
        description: sea_orm::ActiveValue::Set(description),
        is_billable: sea_orm::ActiveValue::Set(payload.is_billable.unwrap_or(true)),
        status: sea_orm::ActiveValue::Set(time_log::TimeLogStatus::Running),
        start_time: sea_orm::ActiveValue::Set(Utc::now()),
        duration: sea_orm::ActiveValue::Set(0),
        ..Default::default()
    };

    let inserted = active_model
        .insert(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("开始计时失败: {e}")))?;

    Ok(Json(StartTimerResponse { time_log_id: inserted.id }))
}

async fn stop_timer(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(time_log_id): Path<String>,
) -> AppResult<Json<StopTimerResponse>> {
    Uuid::parse_str(&time_log_id).map_err(|_| AppError::Validation("timeLogId 无效".to_string()))?;

    let time_log_model = time_log::Entity::find_by_id(&time_log_id)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询计时记录失败: {e}")))?
        .ok_or_else(|| AppError::NotFound("记录不存在".to_string()))?;

    if time_log_model.user_id != current_user.id() {
        return Err(AppError::Forbidden("无权操作".to_string()));
    }

    if !matches!(time_log_model.status, time_log::TimeLogStatus::Running | time_log::TimeLogStatus::Paused) {
        return Err(AppError::Validation("计时已停止".to_string()));
    }

    let now = Utc::now();
    let elapsed = if time_log_model.status == time_log::TimeLogStatus::Running {
        let diff = now.signed_duration_since(time_log_model.start_time).num_seconds();
        diff.max(0).min(i64::from(i32::MAX)) as i32
    } else {
        0
    };

    let duration = time_log_model.duration.saturating_add(elapsed);

    let user_model = user::Entity::find_by_id(current_user.id())
        .one(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询用户失败: {e}")))?
        .ok_or_else(|| AppError::NotFound("用户不存在".to_string()))?;

    let billing_rate = if time_log_model.is_billable {
        Some(time_log_model.billing_rate.clone().unwrap_or_else(|| user_model.hourly_rate.clone()))
    } else {
        None
    };

    let billing_amount = billing_rate.as_ref().map(|rate| {
        let seconds = sea_orm::prelude::Decimal::from(duration);
        rate * seconds / sea_orm::prelude::Decimal::from(3600)
    });

    let mut active: time_log::ActiveModel = time_log_model.into();
    active.end_time = sea_orm::ActiveValue::Set(Some(now));
    active.duration = sea_orm::ActiveValue::Set(duration);
    active.status = sea_orm::ActiveValue::Set(time_log::TimeLogStatus::Completed);
    active.billing_rate = sea_orm::ActiveValue::Set(billing_rate.clone());
    active.billing_amount = sea_orm::ActiveValue::Set(billing_amount.clone());
    active.updated_at = sea_orm::ActiveValue::Set(now);

    active
        .update(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("停止计时失败: {e}")))?;

    Ok(Json(StopTimerResponse {
        duration,
        billing_rate: billing_rate.map(|v| v.to_string()),
        billing_amount: billing_amount.map(|v| v.to_string()),
    }))
}

async fn pause_timer(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(time_log_id): Path<String>,
) -> AppResult<Json<()>> {
    Uuid::parse_str(&time_log_id).map_err(|_| AppError::Validation("timeLogId 无效".to_string()))?;

    let time_log_model = time_log::Entity::find_by_id(&time_log_id)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询计时记录失败: {e}")))?
        .ok_or_else(|| AppError::NotFound("记录不存在".to_string()))?;

    if time_log_model.user_id != current_user.id() {
        return Err(AppError::Forbidden("无权操作".to_string()));
    }

    if time_log_model.status != time_log::TimeLogStatus::Running {
        return Err(AppError::Validation("计时未在进行中".to_string()));
    }

    let now = Utc::now();
    let elapsed = now
        .signed_duration_since(time_log_model.start_time)
        .num_seconds()
        .max(0)
        .min(i64::from(i32::MAX)) as i32;

    let new_duration = time_log_model.duration.saturating_add(elapsed);

    let mut active: time_log::ActiveModel = time_log_model.into();
    active.duration = sea_orm::ActiveValue::Set(new_duration);
    active.status = sea_orm::ActiveValue::Set(time_log::TimeLogStatus::Paused);
    active.updated_at = sea_orm::ActiveValue::Set(now);

    active
        .update(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("暂停计时失败: {e}")))?;

    Ok(Json(()))
}

async fn resume_timer(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(time_log_id): Path<String>,
) -> AppResult<Json<()>> {
    Uuid::parse_str(&time_log_id).map_err(|_| AppError::Validation("timeLogId 无效".to_string()))?;

    let time_log_model = time_log::Entity::find_by_id(&time_log_id)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询计时记录失败: {e}")))?
        .ok_or_else(|| AppError::NotFound("记录不存在".to_string()))?;

    if time_log_model.user_id != current_user.id() {
        return Err(AppError::Forbidden("无权操作".to_string()));
    }

    if time_log_model.status != time_log::TimeLogStatus::Paused {
        return Err(AppError::Validation("计时未暂停".to_string()));
    }

    let now = Utc::now();
    let mut active: time_log::ActiveModel = time_log_model.into();
    active.start_time = sea_orm::ActiveValue::Set(now);
    active.status = sea_orm::ActiveValue::Set(time_log::TimeLogStatus::Running);
    active.updated_at = sea_orm::ActiveValue::Set(now);

    active
        .update(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("恢复计时失败: {e}")))?;

    Ok(Json(()))
}

async fn get_active_timer(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
) -> AppResult<Json<Option<ActiveTimerResponse>>> {
    let timer = time_log::Entity::find()
        .filter(time_log::Column::UserId.eq(current_user.id()))
        .filter(time_log::Column::Status.is_in(vec![time_log::TimeLogStatus::Running, time_log::TimeLogStatus::Paused]))
        .one(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询计时失败: {e}")))?;

    Ok(Json(timer.map(|t| ActiveTimerResponse {
        id: t.id,
        description: t.description,
        status: t.status.to_value(),
        start_time: t.start_time,
        duration: t.duration,
        case_id: t.case_id,
        task_id: t.task_id,
    })))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/start", post(start_timer))
        .route("/:id/stop", post(stop_timer))
        .route("/:id/pause", post(pause_timer))
        .route("/:id/resume", post(resume_timer))
        .route("/active", get(get_active_timer))
}
