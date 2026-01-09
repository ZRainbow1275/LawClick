//! CaseMember Entity
//!
//! 案件成员表实体，与 Prisma `model CaseMember`（lawclick-next/prisma/schema.prisma）保持一致。

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// 案件成员角色枚举（与 Prisma CaseRole 对应）
#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "CaseRole")]
pub enum CaseRole {
    #[sea_orm(string_value = "OWNER")]
    Owner,
    #[sea_orm(string_value = "HANDLER")]
    Handler,
    #[sea_orm(string_value = "MEMBER")]
    Member,
    #[sea_orm(string_value = "VIEWER")]
    Viewer,
}

/// 案件成员实体
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "CaseMember")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,

    #[sea_orm(column_name = "caseId")]
    pub case_id: String,

    #[sea_orm(column_name = "userId")]
    pub user_id: String,

    pub role: CaseRole,

    #[sea_orm(column_name = "joinedAt")]
    pub joined_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

