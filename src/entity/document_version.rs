//! DocumentVersion Entity
//!
//! 文档版本实体，与 Prisma `model DocumentVersion` 保持一致。

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "DocumentVersion")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,

    #[sea_orm(column_name = "documentId")]
    pub document_id: String,

    pub version: i32,

    #[sea_orm(column_name = "fileKey")]
    pub file_key: String,

    #[sea_orm(column_name = "fileType")]
    pub file_type: String,

    #[sea_orm(column_name = "fileSize")]
    pub file_size: i32,

    #[sea_orm(column_name = "uploaderId")]
    pub uploader_id: Option<String>,

    #[sea_orm(column_name = "createdAt")]
    pub created_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

