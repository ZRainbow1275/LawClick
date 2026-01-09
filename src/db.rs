//! 数据库连接模块
//! 
//! 使用 SeaORM 连接与 lawclick-next 共享的 PostgreSQL

use sea_orm::{Database, DatabaseConnection, DbErr, ConnectionTrait, Statement};
use std::sync::Arc;

use crate::config::AppConfig;
use crate::storage::s3::{S3StorageProvider, StorageProvider};

/// 应用状态（共享数据库连接）
#[derive(Clone)]
pub struct AppState {
    /// SeaORM 数据库连接
    pub db: DatabaseConnection,
    /// 应用配置（含密钥/外部服务配置）
    pub config: AppConfig,
    /// 对象存储（MinIO/S3）
    pub storage: Arc<dyn StorageProvider>,
}

impl AppState {
    /// 创建新的应用状态
    pub async fn new(config: AppConfig) -> Result<Self, DbErr> {
        let db = Database::connect(&config.database_url).await?;
        let storage = S3StorageProvider::new(&config)
            .map_err(|e| DbErr::Custom(format!("S3 初始化失败: {e}")))?;
        Ok(Self {
            db,
            config,
            storage: Arc::new(storage),
        })
    }
}

impl AppState {
    /// 测试数据库连接
    pub async fn ping(&self) -> Result<(), DbErr> {
        self.db.execute(Statement::from_string(
            sea_orm::DatabaseBackend::Postgres,
            "SELECT 1".to_string(),
        )).await?;
        Ok(())
    }
}
