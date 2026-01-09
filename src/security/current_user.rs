//! 当前用户提取（强制落库对齐）
//!
//! 目标：
//! - 以 DB 的 `User` 作为真源（role/isActive 等），避免信任 Token 内的陈旧字段。
//! - 与 Web 主线 `getSessionUserOrThrow()` 的做法一致：先认证，再查库得出最新用户信息。

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use sea_orm::EntityTrait;

use crate::entity::user;
use crate::error::AppError;
use crate::security::jwt::{AppStateArc, Claims};

#[derive(Debug, Clone)]
pub struct CurrentUser {
    pub model: user::Model,
}

impl CurrentUser {
    pub fn id(&self) -> &str {
        &self.model.id
    }
}

impl FromRequestParts<AppStateArc> for CurrentUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppStateArc) -> Result<Self, Self::Rejection> {
        let claims = Claims::from_request_parts(parts, state).await?;
        let user_model = user::Entity::find_by_id(&claims.sub)
            .one(&state.db)
            .await
            .map_err(|e| AppError::Database(format!("查询用户失败: {e}")))?
            .ok_or_else(|| AppError::Unauthorized("用户不存在或已失效".to_string()))?;

        if !user_model.is_active {
            return Err(AppError::Forbidden("账号已禁用".to_string()));
        }

        Ok(Self { model: user_model })
    }
}
