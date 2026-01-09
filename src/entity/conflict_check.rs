//! ConflictCheck Entity
//!
//! 利益冲突检查记录实体，与 Prisma `model ConflictCheck` 保持一致。

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "ConflictCheck")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,

    #[sea_orm(column_name = "caseId")]
    pub case_id: String,

    #[sea_orm(column_name = "checkResult")]
    pub check_result: String,

    #[sea_orm(column_name = "conflictsWith")]
    pub conflicts_with: Option<Json>,

    pub notes: Option<String>,

    #[sea_orm(column_name = "checkedById")]
    pub checked_by_id: String,

    #[sea_orm(column_name = "checkedAt")]
    pub checked_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

