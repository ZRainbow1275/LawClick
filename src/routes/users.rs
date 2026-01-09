//! 用户管理路由模块
//! 
//! 实现用户列表、详情功能，连接真实数据库

use axum::{
    Router,
    routing::get,
    extract::{Path, Query, State},
    response::Json,
};
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use std::sync::Arc;
use sea_orm::{ActiveEnum, ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder};
use uuid::Uuid;

use crate::db::AppState;
use crate::error::{AppError, AppResult};
use crate::entity::user;
use crate::security::current_user::CurrentUser;
use crate::security::permissions::{parse_role, require_permission, Permission};

/// 用户响应
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserResponse {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub role: String,
    pub department: Option<String>,
    pub title: Option<String>,
    pub phone: Option<String>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

impl From<user::Model> for UserResponse {
    fn from(model: user::Model) -> Self {
        Self {
            id: model.id,
            email: model.email,
            name: model.name,
            role: model.role.to_value(),
            department: model.department,
            title: model.title,
            phone: model.phone,
            is_active: model.is_active,
            created_at: model.created_at,
        }
    }
}

/// 用户列表查询参数
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UserListQuery {
    pub page: Option<u64>,
    pub page_size: Option<u64>,
    pub role: Option<String>,
}

/// 分页响应
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedUsers {
    pub data: Vec<UserResponse>,
    pub total: u64,
    pub page: u64,
    pub page_size: u64,
}

/// 获取用户列表
async fn list_users(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Query(query): Query<UserListQuery>,
) -> AppResult<Json<PaginatedUsers>> {
    require_permission(current_user.model.role.clone(), Permission::UserViewAll)?;

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).min(100);

    let mut select = user::Entity::find().order_by_asc(user::Column::Name);

    if let Some(role_filter) = query.role.as_deref().map(|v| v.trim()).filter(|v| !v.is_empty()) {
        let role_enum = parse_role(role_filter).ok_or_else(|| AppError::Validation("角色筛选值无效".to_string()))?;
        select = select.filter(user::Column::Role.eq(role_enum));
    }

    let paginator = select.paginate(&state.db, page_size);
    let total = paginator.num_items().await
        .map_err(|e| AppError::Database(format!("计数失败: {}", e)))?;

    let users = paginator.fetch_page(page - 1).await
        .map_err(|e| AppError::Database(format!("查询失败: {}", e)))?;

    let data: Vec<UserResponse> = users.into_iter().map(UserResponse::from).collect();

    Ok(Json(PaginatedUsers {
        data,
        total,
        page,
        page_size,
    }))
}

/// 获取用户详情
async fn get_user(
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<String>,
    current_user: CurrentUser,
) -> AppResult<Json<UserResponse>> {
    Uuid::parse_str(&user_id).map_err(|_| AppError::Validation("用户ID 无效".to_string()))?;

    if user_id != current_user.id() {
        require_permission(current_user.model.role.clone(), Permission::UserViewAll)?;
    }

    let user_model = user::Entity::find_by_id(&user_id)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询失败: {}", e)))?
        .ok_or_else(|| AppError::NotFound(format!("用户 {} 不存在", user_id)))?;

    Ok(Json(UserResponse::from(user_model)))
}

/// 创建用户路由
pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/", get(list_users))
        .route("/:id", get(get_user))
}
