//! 应用配置模块（极限标准）
//!
//! - 严禁“未配置也能跑”的隐式默认值（尤其是 DB/密钥）。
//! - 所有关键配置必须显式由环境变量提供，避免生产误配置被掩盖。

use crate::error::{AppError, AppResult};

/// 应用配置
#[derive(Debug, Clone)]
pub struct AppConfig {
    /// 数据库连接 URL（与 `lawclick-next/` 共享 PostgreSQL）
    pub database_url: String,
    /// JWT 密钥（用于 Rust API 自身 Token）
    pub jwt_secret: String,
    /// NextAuth/Auth.js 密钥（用于解密 Web 主线 JWT/JWE）
    pub nextauth_secret: String,
    /// S3 Endpoint（MinIO/S3 兼容存储）
    pub s3_endpoint: String,
    /// S3 Access Key
    pub s3_access_key: String,
    /// S3 Secret Key
    pub s3_secret_key: String,
    /// S3 Bucket Name
    pub s3_bucket_name: String,
    /// 服务端口
    pub port: u16,
    /// CORS 是否允许任意 Origin（默认禁止；仅允许显式打开）
    pub cors_allow_any: bool,
    /// CORS 允许的 Origin 列表（逗号分隔）
    pub cors_allow_origins: Vec<String>,
    /// OpenAI API Key（未配置则 AI 接口显式失败）
    pub openai_api_key: Option<String>,
    /// OpenAI Base URL（可选；仅在配置 Key 时生效）
    pub openai_base_url: String,
    /// OpenAI 模型（可选；仅在配置 Key 时生效）
    pub openai_model: String,
}

fn env_required(name: &str) -> AppResult<String> {
    let value = std::env::var(name).map_err(|_| AppError::Internal(format!("缺少环境变量：{name}")))?;
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        return Err(AppError::Internal(format!("环境变量为空：{name}")));
    }
    Ok(trimmed)
}

fn env_required_fallback(primary: &str, secondary: &str) -> AppResult<String> {
    match env_required(primary) {
        Ok(v) => Ok(v),
        Err(_) => env_required(secondary).map_err(|_| {
            AppError::Internal(format!("缺少环境变量：{primary}（或回退 {secondary}）"))
        }),
    }
}

fn env_optional(name: &str) -> Option<String> {
    std::env::var(name).ok().map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

fn env_bool(name: &str) -> bool {
    env_optional(name)
        .map(|v| matches!(v.to_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(false)
}

fn env_u16(name: &str) -> Option<u16> {
    env_optional(name).and_then(|v| v.parse::<u16>().ok())
}

fn parse_csv_list(raw: Option<String>) -> Vec<String> {
    raw.unwrap_or_default()
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

impl AppConfig {
    /// 从环境变量加载配置（严格模式）
    pub fn from_env() -> AppResult<Self> {
        dotenvy::dotenv().ok();

        let database_url = env_required("DATABASE_URL")?;
        let jwt_secret = env_required("JWT_SECRET")?;
        if jwt_secret.len() < 32 {
            return Err(AppError::Internal("JWT_SECRET 长度必须 >= 32（避免弱密钥）".to_string()));
        }

        let nextauth_secret = env_required_fallback("NEXTAUTH_SECRET", "AUTH_SECRET")?;
        if nextauth_secret.len() < 32 {
            return Err(AppError::Internal(
                "NEXTAUTH_SECRET/AUTH_SECRET 长度必须 >= 32（避免弱密钥）".to_string(),
            ));
        }

        let s3_endpoint = env_required("S3_ENDPOINT")?;
        let s3_access_key = env_required("S3_ACCESS_KEY")?;
        let s3_secret_key = env_required("S3_SECRET_KEY")?;
        let s3_bucket_name = env_required("S3_BUCKET_NAME")?;

        let port = env_u16("PORT").unwrap_or(8080);

        let cors_allow_any = env_bool("CORS_ALLOW_ANY");
        let cors_allow_origins = parse_csv_list(env_optional("CORS_ALLOW_ORIGINS"));
        if cors_allow_any && !cors_allow_origins.is_empty() {
            return Err(AppError::Internal("CORS_ALLOW_ANY 与 CORS_ALLOW_ORIGINS 不可同时配置".to_string()));
        }

        let openai_api_key = env_optional("OPENAI_API_KEY");
        let openai_base_url = env_optional("OPENAI_BASE_URL").unwrap_or_else(|| "https://api.openai.com/v1".to_string());
        let openai_model = env_optional("OPENAI_MODEL").unwrap_or_else(|| "gpt-4o-mini".to_string());

        Ok(Self {
            database_url,
            jwt_secret,
            nextauth_secret,
            s3_endpoint,
            s3_access_key,
            s3_secret_key,
            s3_bucket_name,
            port,
            cors_allow_any,
            cors_allow_origins,
            openai_api_key,
            openai_base_url,
            openai_model,
        })
    }
}
