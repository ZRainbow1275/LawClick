//! 通知中心路由模块（真实闭环）
//!
//! 对齐 Web 主线 `lawclick-next/src/actions/notification-actions.ts`：
//! - 列表：按 userId 查询通知 + 统计未读数
//! - 已读：仅允许本人标记 readAt
//! - 权限：`dashboard:view`

use axum::{
    extract::{Path, Query, State},
    response::Json,
    routing::{get, post},
    Router,
};
use chrono::{DateTime, Utc};
use sea_orm::prelude::Expr;
use sea_orm::{ActiveEnum, ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::db::AppState;
use crate::entity::notification;
use crate::error::{AppError, AppResult};
use crate::security::current_user::CurrentUser;
use crate::security::permissions::{require_permission, Permission};

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NotificationListQuery {
    pub page: Option<u64>,
    pub page_size: Option<u64>,
    pub unread_only: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationItem {
    pub id: String,
    pub r#type: String,
    pub title: String,
    pub content: Option<String>,
    pub action_url: Option<String>,
    pub actor_id: Option<String>,
    pub read_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationListResponse {
    pub items: Vec<NotificationItem>,
    pub unread_count: u64,
    pub page: u64,
    pub page_size: u64,
    pub total: u64,
}

async fn list_my_notifications(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Query(query): Query<NotificationListQuery>,
) -> AppResult<Json<NotificationListResponse>> {
    require_permission(current_user.model.role.clone(), Permission::DashboardView)?;

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).min(200);
    let unread_only = query.unread_only.unwrap_or(false);

    let mut where_cond = sea_orm::Condition::all().add(notification::Column::UserId.eq(current_user.id()));
    if unread_only {
        where_cond = where_cond.add(notification::Column::ReadAt.is_null());
    }

    let select = notification::Entity::find()
        .filter(where_cond)
        .order_by_desc(notification::Column::CreatedAt);

    let paginator = select.paginate(&state.db, page_size);
    let total = paginator
        .num_items()
        .await
        .map_err(|e| AppError::Database(format!("计数失败: {e}")))?;

    let rows = paginator
        .fetch_page(page - 1)
        .await
        .map_err(|e| AppError::Database(format!("查询通知失败: {e}")))?;

    let unread_count = notification::Entity::find()
        .filter(notification::Column::UserId.eq(current_user.id()))
        .filter(notification::Column::ReadAt.is_null())
        .count(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("统计未读失败: {e}")))?;

    Ok(Json(NotificationListResponse {
        items: rows
            .into_iter()
            .map(|n| NotificationItem {
                id: n.id,
                r#type: n.notification_type.to_value(),
                title: n.title,
                content: n.content,
                action_url: n.action_url,
                actor_id: n.actor_id,
                read_at: n.read_at,
                created_at: n.created_at,
            })
            .collect(),
        unread_count,
        page,
        page_size,
        total,
    }))
}

async fn mark_notification_read(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Path(notification_id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    require_permission(current_user.model.role.clone(), Permission::DashboardView)?;
    Uuid::parse_str(&notification_id).map_err(|_| AppError::Validation("notificationId 无效".to_string()))?;

    let now = Utc::now();
    let res = notification::Entity::update_many()
        .filter(notification::Column::Id.eq(&notification_id))
        .filter(notification::Column::UserId.eq(current_user.id()))
        .filter(notification::Column::ReadAt.is_null())
        .col_expr(notification::Column::ReadAt, Expr::value(now))
        .exec(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("更新通知失败: {e}")))?;

    Ok(Json(serde_json::json!({ "success": true, "updated": res.rows_affected })))
}

async fn mark_all_notifications_read(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
) -> AppResult<Json<serde_json::Value>> {
    require_permission(current_user.model.role.clone(), Permission::DashboardView)?;

    let now = Utc::now();
    let res = notification::Entity::update_many()
        .filter(notification::Column::UserId.eq(current_user.id()))
        .filter(notification::Column::ReadAt.is_null())
        .col_expr(notification::Column::ReadAt, Expr::value(now))
        .exec(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("更新通知失败: {e}")))?;

    Ok(Json(serde_json::json!({ "success": true, "updated": res.rows_affected })))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list_my_notifications))
        .route("/:id/read", post(mark_notification_read))
        .route("/read-all", post(mark_all_notifications_read))
}
