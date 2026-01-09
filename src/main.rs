//! 律时 (LawTime) API Gateway
//! 
//! 基于 Axum 0.8 的高性能 API 网关服务
//! 连接与 lawclick-next 共享的 PostgreSQL 数据库

use axum::{
    Router,
    routing::get,
    response::Json,
    extract::State,
};
use serde::Serialize;
use std::net::SocketAddr;
use std::sync::Arc;
use tower::ServiceBuilder;
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod db;
mod entity;
mod error;
mod routes;
mod security;
mod storage;

pub use config::AppConfig;
pub use db::AppState;

/// 健康检查响应
#[derive(Serialize)]
struct HealthResponse {
    status: String,
    version: String,
    service: String,
    database: String,
}

/// 健康检查端点
async fn health_check(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    // 检查数据库连接
    let db_status = if state.db.ping().await.is_ok() {
        "connected"
    } else {
        "disconnected"
    };
    
    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        service: "lawtime-api".to_string(),
        database: db_status.to_string(),
    })
}

/// API 根信息
#[derive(Serialize)]
struct ApiInfo {
    name: String,
    version: String,
    description: String,
    endpoints: Vec<String>,
}

async fn api_root() -> Json<ApiInfo> {
    Json(ApiInfo {
        name: "律时 API Gateway".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        description: "面向律师行业的智能化ERP系统 API".to_string(),
        endpoints: vec![
            "/api/v1/auth".to_string(),
            "/api/v1/cases".to_string(),
            "/api/v1/users".to_string(),
            "/api/v1/tasks".to_string(),
            "/api/v1/timelogs".to_string(),
            "/api/v1/documents".to_string(),
            "/api/v1/events".to_string(),
            "/api/v1/notifications".to_string(),
        ],
    })
}

/// 创建应用路由
fn create_app(state: Arc<AppState>) -> Router {
    // CORS 配置（默认不放开；必须显式配置 allowlist 或 allow-any）
    let cors = if state.config.cors_allow_any {
        CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any)
    } else if !state.config.cors_allow_origins.is_empty() {
        let mut origins = Vec::with_capacity(state.config.cors_allow_origins.len());
        for origin in &state.config.cors_allow_origins {
            let header = origin
                .parse()
                .unwrap_or_else(|_| panic!("无效的 CORS origin: {origin}"));
            origins.push(header);
        }
        CorsLayer::new()
            .allow_origin(tower_http::cors::AllowOrigin::list(origins))
            .allow_methods(Any)
            .allow_headers(Any)
    } else {
        CorsLayer::new()
    };

    // 构建路由
    Router::new()
        // 健康检查
        .route("/health", get(health_check))
        // API 根
        .route("/api", get(api_root))
        .route("/api/v1", get(api_root))
        // 业务路由
        .nest("/api/v1/auth", routes::auth::router())
        .nest("/api/v1/cases", routes::cases::router())
        .nest("/api/v1/users", routes::users::router())
        .nest("/api/v1/tasks", routes::tasks::router())
        .nest("/api/v1/timelogs", routes::timelogs::router())
        .nest("/api/v1/documents", routes::documents::router())
        .nest("/api/v1/events", routes::events::router())
        .nest("/api/v1/notifications", routes::notifications::router())
        // 中间件
        .layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(cors)
        )
        .with_state(state)
}

#[tokio::main]
async fn main() {
    // 加载配置
    let config = match config::AppConfig::from_env() {
        Ok(cfg) => cfg,
        Err(e) => {
            eprintln!("配置错误: {e}");
            std::process::exit(1);
        }
    };
    let port = config.port;
    
    // 初始化日志
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "lawtime_erp=debug,tower_http=debug,sea_orm=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("🚀 律时 API Gateway 启动中...");
    tracing::info!("📦 数据库: [已配置]");

    // 连接数据库
    let state = match db::AppState::new(config).await {
        Ok(s) => {
            tracing::info!("✅ 数据库连接成功");
            Arc::new(s)
        }
        Err(e) => {
            tracing::error!("❌ 数据库连接失败: {}", e);
            std::process::exit(1);
        }
    };

    // 创建应用
    let app = create_app(state);

    // 绑定地址
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("🌐 API 服务: http://{}", addr);

    // 启动服务
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
