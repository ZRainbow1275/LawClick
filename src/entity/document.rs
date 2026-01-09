//! Document Entity
//!
//! 文档实体，与 Prisma `model Document`（lawclick-next/prisma/schema.prisma）保持一致。

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "Document")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,

    pub title: String,

    #[sea_orm(column_name = "fileUrl")]
    pub file_url: Option<String>,

    #[sea_orm(column_name = "fileType")]
    pub file_type: Option<String>,

    #[sea_orm(column_name = "fileSize")]
    pub file_size: i32,

    pub version: i32,

    pub stage: Option<String>,

    #[sea_orm(column_name = "documentType")]
    pub document_type: Option<String>,

    #[sea_orm(column_name = "isRequired")]
    pub is_required: bool,

    #[sea_orm(column_name = "isCompleted")]
    pub is_completed: bool,

    pub category: Option<String>,

    pub tags: Vec<String>,

    pub notes: Option<String>,

    pub summary: Option<String>,

    #[sea_orm(column_name = "isFavorite")]
    pub is_favorite: bool,

    #[sea_orm(column_name = "isConfidential")]
    pub is_confidential: bool,

    #[sea_orm(column_name = "uploaderId")]
    pub uploader_id: Option<String>,

    #[sea_orm(column_name = "createdAt")]
    pub created_at: DateTimeUtc,

    #[sea_orm(column_name = "updatedAt")]
    pub updated_at: DateTimeUtc,

    #[sea_orm(column_name = "caseId")]
    pub case_id: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

