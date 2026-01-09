//! TimeLog Entity
//!
//! 工时记录实体，与 Prisma `model TimeLog`（lawclick-next/prisma/schema.prisma）保持一致。

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// 工时状态枚举（与 Prisma TimeLogStatus 对应）
#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "TimeLogStatus")]
pub enum TimeLogStatus {
    #[sea_orm(string_value = "RUNNING")]
    Running,
    #[sea_orm(string_value = "PAUSED")]
    Paused,
    #[sea_orm(string_value = "COMPLETED")]
    Completed,
    #[sea_orm(string_value = "APPROVED")]
    Approved,
    #[sea_orm(string_value = "BILLED")]
    Billed,
}

/// 工时记录实体
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "TimeLog")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,

    pub description: String,

    #[sea_orm(column_name = "startTime")]
    pub start_time: DateTimeUtc,

    #[sea_orm(column_name = "endTime")]
    pub end_time: Option<DateTimeUtc>,

    pub duration: i32,

    pub status: TimeLogStatus,

    #[sea_orm(column_name = "isBillable")]
    pub is_billable: bool,

    #[sea_orm(column_name = "billingRate")]
    pub billing_rate: Option<Decimal>,

    #[sea_orm(column_name = "billingAmount")]
    pub billing_amount: Option<Decimal>,

    #[sea_orm(column_name = "createdAt")]
    pub created_at: DateTimeUtc,

    #[sea_orm(column_name = "updatedAt")]
    pub updated_at: DateTimeUtc,

    #[sea_orm(column_name = "userId")]
    pub user_id: String,

    #[sea_orm(column_name = "caseId")]
    pub case_id: Option<String>,

    #[sea_orm(column_name = "taskId")]
    pub task_id: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

