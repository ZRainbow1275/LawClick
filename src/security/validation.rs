//! 输入校验抽象（统一入口）
//!
//! 极限标准要求：所有输入必须经过严格的 Schema 校验，拒绝隐式信任。
//! Rust 侧使用 `validator`（derive）实现与 Zod/Pydantic 类似的 runtime 校验门禁。

use axum::extract::{FromRequest, Request};
use axum::Json;
use serde::de::DeserializeOwned;
use validator::Validate;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

/// JSON 解析 + validator 校验一体化 Extractor
pub struct ValidatedJson<T>(pub T);

impl<T> std::ops::Deref for ValidatedJson<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl<S, T> FromRequest<S> for ValidatedJson<T>
where
    S: Send + Sync,
    T: DeserializeOwned + Validate,
{
    type Rejection = AppError;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        let Json(value) = Json::<T>::from_request(req, state)
            .await
            .map_err(|e| AppError::Validation(format!("JSON 解析失败: {e}")))?;

        if let Err(errors) = value.validate() {
            let details = serde_json::to_value(&errors).unwrap_or_else(|_| serde_json::json!({ "error": "invalid" }));
            return Err(AppError::ValidationWithDetails {
                message: "输入校验失败".to_string(),
                details,
            });
        }

        Ok(Self(value))
    }
}

/// 便捷函数：要求字符串非空
pub fn require_non_empty(value: &str, field: &str, max_len: usize) -> AppResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation(format!("{field} 不能为空")));
    }
    if trimmed.len() > max_len {
        return Err(AppError::Validation(format!("{field} 长度不能超过 {max_len}")));
    }
    Ok(trimmed.to_string())
}

/// validator 自定义校验：UUID 字符串（禁止空字符串/脏数据）
pub fn validate_uuid_str(value: &str) -> Result<(), validator::ValidationError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(validator::ValidationError::new("uuid"));
    }
    if Uuid::parse_str(trimmed).is_err() {
        return Err(validator::ValidationError::new("uuid"));
    }
    Ok(())
}
