//! 律时 (LawTime) 共享库
//! 
//! 包含跨模块共享的类型、工具函数和配置

pub mod config;
pub mod error;
pub mod db;
pub mod storage;

/// 重新导出常用类型
pub use config::AppConfig;
pub use error::{AppError, AppResult};
