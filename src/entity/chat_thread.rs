//! ChatThread Entity
//!
//! 会话线程实体，与 Prisma `model ChatThread` 保持一致。

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// 会话类型（与 Prisma ChatThreadType 对应）
#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "ChatThreadType")]
pub enum ChatThreadType {
    #[sea_orm(string_value = "TEAM")]
    Team,
    #[sea_orm(string_value = "CASE")]
    Case,
    #[sea_orm(string_value = "DIRECT")]
    Direct,
}

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "ChatThread")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,

    pub key: String,

    #[sea_orm(column_name = "type")]
    pub thread_type: ChatThreadType,

    pub title: String,

    #[sea_orm(column_name = "caseId")]
    pub case_id: Option<String>,

    #[sea_orm(column_name = "createdById")]
    pub created_by_id: String,

    #[sea_orm(column_name = "lastMessageAt")]
    pub last_message_at: Option<DateTimeUtc>,

    #[sea_orm(column_name = "createdAt")]
    pub created_at: DateTimeUtc,

    #[sea_orm(column_name = "updatedAt")]
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

