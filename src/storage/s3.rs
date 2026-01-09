//! S3/MinIO StorageProvider（真实闭环）
//!
//! 设计目标：
//! - 严禁“默认值假成功”：缺配置直接启动失败（由 `AppConfig` 保证）。
//! - 与 Web 主线一致：force path-style；bucket 不存在时仅在明确不存在时创建。

use async_trait::async_trait;
use std::collections::HashMap;
use tokio::sync::OnceCell;

use s3::bucket::Bucket;
use s3::bucket_ops::BucketConfiguration;
use s3::creds::Credentials;
use s3::region::Region;

use crate::config::AppConfig;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone)]
pub struct StoredObject {
    pub bytes: Vec<u8>,
    pub content_type: Option<String>,
}

#[async_trait]
pub trait StorageProvider: Send + Sync {
    async fn ensure_bucket_exists(&self) -> AppResult<()>;
    async fn put_object(&self, key: &str, body: Vec<u8>, content_type: Option<&str>) -> AppResult<()>;
    async fn get_object(&self, key: &str) -> AppResult<StoredObject>;
    async fn delete_object(&self, key: &str) -> AppResult<()>;
}

pub struct S3StorageProvider {
    bucket_name: String,
    region: Region,
    credentials: Credentials,
    bucket: Box<Bucket>,
    ensured: OnceCell<()>,
}

impl S3StorageProvider {
    pub fn new(config: &AppConfig) -> AppResult<Self> {
        let region = Region::Custom {
            region: "us-east-1".to_string(),
            endpoint: config.s3_endpoint.clone(),
        };

        let credentials = Credentials::new(
            Some(&config.s3_access_key),
            Some(&config.s3_secret_key),
            None,
            None,
            None,
        )
        .map_err(|e| AppError::Internal(format!("S3 凭证无效: {e}")))?;

        let bucket = Bucket::new(&config.s3_bucket_name, region.clone(), credentials.clone())
            .map_err(|e| AppError::Internal(format!("S3 Bucket 初始化失败: {e}")))?
            .with_path_style();

        Ok(Self {
            bucket_name: config.s3_bucket_name.clone(),
            region,
            credentials,
            bucket,
            ensured: OnceCell::new(),
        })
    }

    fn normalize_path(key: &str) -> String {
        let trimmed = key.trim().trim_start_matches('/');
        format!("/{trimmed}")
    }

    fn header_map_get_case_insensitive(headers: &HashMap<String, String>, key: &str) -> Option<String> {
        let needle = key.to_ascii_lowercase();
        headers
            .iter()
            .find(|(k, _)| k.to_ascii_lowercase() == needle)
            .map(|(_, v)| v.clone())
    }
}

#[async_trait]
impl StorageProvider for S3StorageProvider {
    async fn ensure_bucket_exists(&self) -> AppResult<()> {
        self.ensured
            .get_or_try_init(|| async {
                let exists = self
                    .bucket
                    .exists()
                    .await
                    .map_err(|e| AppError::Internal(format!("S3 Bucket 探测失败: {e}")))?;
                if exists {
                    return Ok(());
                }

                let config = BucketConfiguration::default();
                let resp = Bucket::create_with_path_style(
                    &self.bucket_name,
                    self.region.clone(),
                    self.credentials.clone(),
                    config,
                )
                .await
                .map_err(|e| AppError::Internal(format!("创建 S3 Bucket 失败: {e}")))?;

                if resp.response_code >= 300 {
                    return Err(AppError::Internal(format!(
                        "创建 S3 Bucket 失败（HTTP {}）",
                        resp.response_code
                    )));
                }

                Ok(())
            })
            .await?;

        Ok(())
    }

    async fn put_object(&self, key: &str, body: Vec<u8>, content_type: Option<&str>) -> AppResult<()> {
        self.ensure_bucket_exists().await?;
        let path = Self::normalize_path(key);
        let ct = content_type.unwrap_or("application/octet-stream");
        let resp = self
            .bucket
            .put_object_with_content_type(path, &body, ct)
            .await
            .map_err(|e| AppError::Internal(format!("S3 上传失败: {e}")))?;

        if resp.status_code() >= 300 {
            return Err(AppError::Internal(format!("S3 上传失败（HTTP {}）", resp.status_code())));
        }

        Ok(())
    }

    async fn get_object(&self, key: &str) -> AppResult<StoredObject> {
        self.ensure_bucket_exists().await?;
        let path = Self::normalize_path(key);
        let resp = self
            .bucket
            .get_object(path)
            .await
            .map_err(|e| AppError::Internal(format!("S3 下载失败: {e}")))?;

        if resp.status_code() == 404 {
            return Err(AppError::NotFound("文件不存在".to_string()));
        }
        if resp.status_code() >= 300 {
            return Err(AppError::Internal(format!("S3 下载失败（HTTP {}）", resp.status_code())));
        }

        let content_type = Self::header_map_get_case_insensitive(&resp.headers(), "content-type");
        Ok(StoredObject {
            bytes: resp.to_vec(),
            content_type,
        })
    }

    async fn delete_object(&self, key: &str) -> AppResult<()> {
        self.ensure_bucket_exists().await?;
        let path = Self::normalize_path(key);
        let resp = self
            .bucket
            .delete_object(path)
            .await
            .map_err(|e| AppError::Internal(format!("S3 删除失败: {e}")))?;

        if resp.status_code() >= 300 && resp.status_code() != 404 {
            return Err(AppError::Internal(format!("S3 删除失败（HTTP {}）", resp.status_code())));
        }

        Ok(())
    }
}

