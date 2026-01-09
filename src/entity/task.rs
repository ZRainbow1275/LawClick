//! Task Entity
//!
//! 任务表实体，与 Prisma `model Task`（lawclick-next/prisma/schema.prisma）保持一致。

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// 任务状态枚举（与 Prisma TaskStatus 对应）
#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "TaskStatus")]
pub enum TaskStatus {
    #[sea_orm(string_value = "TODO")]
    Todo,
    #[sea_orm(string_value = "IN_PROGRESS")]
    InProgress,
    #[sea_orm(string_value = "REVIEW")]
    Review,
    #[sea_orm(string_value = "DONE")]
    Done,
}

/// 任务优先级枚举（与 Prisma TaskPriority 对应）
#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "TaskPriority")]
pub enum TaskPriority {
    #[sea_orm(string_value = "P0_URGENT")]
    P0Urgent,
    #[sea_orm(string_value = "P1_HIGH")]
    P1High,
    #[sea_orm(string_value = "P2_MEDIUM")]
    P2Medium,
    #[sea_orm(string_value = "P3_LOW")]
    P3Low,
}

/// 任务实体
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "Task")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,

    pub title: String,
    pub description: Option<String>,

    pub status: TaskStatus,
    pub priority: TaskPriority,

    pub swimlane: Option<String>,

    #[sea_orm(column_name = "order")]
    pub order: i32,

    pub checklist: Option<Json>,

    #[sea_orm(column_name = "dueDate")]
    pub due_date: Option<DateTimeUtc>,

    pub stage: Option<String>,

    #[sea_orm(column_name = "taskType")]
    pub task_type: Option<String>,

    #[sea_orm(column_name = "documentId")]
    pub document_id: Option<String>,

    #[sea_orm(column_name = "estimatedHours")]
    pub estimated_hours: Option<f64>,

    #[sea_orm(column_name = "createdAt")]
    pub created_at: DateTimeUtc,

    #[sea_orm(column_name = "updatedAt")]
    pub updated_at: DateTimeUtc,

    #[sea_orm(column_name = "caseId")]
    pub case_id: String,

    #[sea_orm(column_name = "assigneeId")]
    pub assignee_id: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

