//! 错误处理模块

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use serde_json::Value as JsonValue;
use thiserror::Error;

/// 应用错误类型
#[derive(Error, Debug)]
pub enum AppError {
    #[error("未授权: {0}")]
    Unauthorized(String),
    
    #[error("禁止访问: {0}")]
    Forbidden(String),
    
    #[error("资源未找到: {0}")]
    NotFound(String),
    
    #[error("验证错误: {0}")]
    Validation(String),

    #[error("验证错误: {message}")]
    ValidationWithDetails { message: String, details: JsonValue },
    
    #[error("数据库错误: {0}")]
    Database(String),
    
    #[error("内部错误: {0}")]
    Internal(String),
}

/// 错误响应体
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<JsonValue>,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_type, message, details) = match &self {
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, "unauthorized", msg.clone(), None),
            AppError::Forbidden(msg) => (StatusCode::FORBIDDEN, "forbidden", msg.clone(), None),
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, "not_found", msg.clone(), None),
            AppError::Validation(msg) => (StatusCode::BAD_REQUEST, "validation", msg.clone(), None),
            AppError::ValidationWithDetails { message, details } => {
                (StatusCode::BAD_REQUEST, "validation", message.clone(), Some(details.clone()))
            }
            AppError::Database(msg) => (StatusCode::INTERNAL_SERVER_ERROR, "database", msg.clone(), None),
            AppError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, "internal", msg.clone(), None),
        };

        let body = Json(ErrorResponse {
            error: error_type.to_string(),
            message,
            details,
        });

        (status, body).into_response()
    }
}

/// 应用结果类型
pub type AppResult<T> = Result<T, AppError>;
