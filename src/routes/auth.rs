//! 认证路由模块
//! 
//! 实现 JWT 登录、刷新、登出等认证功能
//! 连接真实 PostgreSQL 数据库

use axum::{
    Router,
    routing::{get, post},
    extract::State,
    http::StatusCode,
    response::Json,
};
use serde::{Deserialize, Serialize};
use jsonwebtoken::{encode, decode, Header, Algorithm, Validation, EncodingKey, DecodingKey};
use chrono::{Utc, Duration};
use std::sync::Arc;
use sea_orm::{ActiveEnum, ColumnTrait, EntityTrait, QueryFilter};
use validator::Validate;

use crate::db::AppState;
use crate::error::{AppError, AppResult};
use crate::entity::user;
use crate::security::current_user::CurrentUser;
use crate::security::jwt::Claims;
use crate::security::password::verify_password;
use crate::security::validation::ValidatedJson;

/// 登录请求
#[derive(Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    #[validate(email(message = "邮箱格式不正确"))]
    pub email: String,
    #[validate(length(min = 6, max = 128, message = "密码长度不合法"))]
    pub password: String,
}

/// 登录响应
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: i64,
    pub user: UserInfo,
}

/// 用户信息
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    pub id: String,
    pub email: String,
    pub name: String,
    pub role: String,
    pub department: Option<String>,
    pub title: Option<String>,
}

/// 刷新 Token 请求
#[derive(Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct RefreshRequest {
    #[validate(length(min = 20, message = "refresh_token 无效"))]
    pub refresh_token: String,
}

/// 刷新 Token 响应
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshResponse {
    pub access_token: String,
    pub expires_in: i64,
}

/// JWT 过期时间（小时）
const JWT_EXPIRATION_HOURS: i64 = 24;

/// 用户登录
/// 
/// POST /api/v1/auth/login
async fn login(
    State(state): State<Arc<AppState>>,
    ValidatedJson(payload): ValidatedJson<LoginRequest>,
) -> AppResult<Json<LoginResponse>> {
    // 从数据库查询用户
    let user = user::Entity::find()
        .filter(user::Column::Email.eq(&payload.email))
        .one(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询失败: {}", e)))?
        .ok_or_else(|| AppError::Unauthorized("用户不存在或密码错误".to_string()))?;

    // 验证密码（与 Web 主线一致：password 为空的账号不允许走密码登录）
    let password_hash = user
        .password
        .as_deref()
        .ok_or_else(|| AppError::Unauthorized("用户不存在或密码错误".to_string()))?;
    verify_password(&payload.password, password_hash)?;

    // 检查用户是否激活
    if !user.is_active {
        return Err(AppError::Forbidden("账号已禁用".to_string()));
    }

    // 生成 JWT Token
    let now = Utc::now();
    let expiration = now + Duration::hours(JWT_EXPIRATION_HOURS);
    
    let role_str = user.role.to_value();
    let user_name = user.name.clone().unwrap_or_else(|| "用户".to_string());
    
    let claims = Claims {
        sub: user.id.clone(),
        email: user.email.clone(),
        role: role_str.clone(),
        name: user_name.clone(),
        exp: expiration.timestamp() as usize,
        iat: now.timestamp() as usize,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.config.jwt_secret.as_bytes()),
    ).map_err(|e| AppError::Internal(format!("Token 生成失败: {}", e)))?;

    tracing::info!("用户 {} 登录成功", payload.email);

    Ok(Json(LoginResponse {
        access_token: token,
        token_type: "Bearer".to_string(),
        expires_in: JWT_EXPIRATION_HOURS * 3600,
        user: UserInfo {
            id: user.id,
            email: user.email,
            name: user_name,
            role: role_str,
            department: user.department,
            title: user.title,
        },
    }))
}

/// 刷新 Token
/// 
/// POST /api/v1/auth/refresh
async fn refresh_token(
    State(state): State<Arc<AppState>>,
    ValidatedJson(payload): ValidatedJson<RefreshRequest>,
) -> AppResult<Json<RefreshResponse>> {
    // 解码并验证旧 Token
    let token_data = decode::<Claims>(
        &payload.refresh_token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    ).map_err(|e| AppError::Unauthorized(format!("无效的 Token: {}", e)))?;

    let old_claims = token_data.claims;

    // 生成新 Token
    let now = Utc::now();
    let expiration = now + Duration::hours(JWT_EXPIRATION_HOURS);
    
    let new_claims = Claims {
        sub: old_claims.sub,
        email: old_claims.email,
        role: old_claims.role,
        name: old_claims.name,
        exp: expiration.timestamp() as usize,
        iat: now.timestamp() as usize,
    };

    let new_token = encode(
        &Header::default(),
        &new_claims,
        &EncodingKey::from_secret(state.config.jwt_secret.as_bytes()),
    ).map_err(|e| AppError::Internal(format!("Token 刷新失败: {}", e)))?;

    Ok(Json(RefreshResponse {
        access_token: new_token,
        expires_in: JWT_EXPIRATION_HOURS * 3600,
    }))
}

/// 获取当前用户信息
/// 
/// GET /api/v1/auth/me
async fn get_current_user(
    current_user: CurrentUser,
) -> AppResult<Json<UserInfo>> {
    let user = current_user.model;
    let role_str = user.role.to_value();

    Ok(Json(UserInfo {
        id: user.id,
        email: user.email,
        name: user.name.unwrap_or_else(|| "用户".to_string()),
        role: role_str,
        department: user.department,
        title: user.title,
    }))
}

/// 用户登出
/// 
/// POST /api/v1/auth/logout
async fn logout() -> StatusCode {
    // JWT 是无状态的，登出只需客户端删除 Token
    StatusCode::NO_CONTENT
}

/// 创建认证路由
pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/login", post(login))
        .route("/refresh", post(refresh_token))
        .route("/logout", post(logout))
        .route("/me", get(get_current_user))
}
