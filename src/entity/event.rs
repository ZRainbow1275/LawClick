//! Event Entity
//!
//! 日程事件实体，与 Prisma `model Event` 保持一致。

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// EventType（与 Prisma EventType 对应）
#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "EventType")]
pub enum EventType {
    #[sea_orm(string_value = "MEETING")]
    Meeting,
    #[sea_orm(string_value = "HEARING")]
    Hearing,
    #[sea_orm(string_value = "DEADLINE")]
    Deadline,
    #[sea_orm(string_value = "OTHER")]
    Other,
}

/// EventVisibility（与 Prisma EventVisibility 对应）
#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "EventVisibility")]
pub enum EventVisibility {
    #[sea_orm(string_value = "PRIVATE")]
    Private,
    #[sea_orm(string_value = "TEAM_BUSY")]
    TeamBusy,
    #[sea_orm(string_value = "TEAM_PUBLIC")]
    TeamPublic,
    #[sea_orm(string_value = "CASE_TEAM")]
    CaseTeam,
}

/// EventStatus（与 Prisma EventStatus 对应）
#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "EventStatus")]
pub enum EventStatus {
    #[sea_orm(string_value = "SCHEDULED")]
    Scheduled,
    #[sea_orm(string_value = "CANCELLED")]
    Cancelled,
}

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "Event")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,

    pub title: String,
    pub description: Option<String>,

    #[sea_orm(column_name = "type")]
    pub event_type: EventType,

    pub visibility: EventVisibility,
    pub status: EventStatus,

    #[sea_orm(column_name = "startTime")]
    pub start_time: DateTimeUtc,

    #[sea_orm(column_name = "endTime")]
    pub end_time: DateTimeUtc,

    pub location: Option<String>,

    #[sea_orm(column_name = "caseId")]
    pub case_id: Option<String>,

    #[sea_orm(column_name = "taskId")]
    pub task_id: Option<String>,

    #[sea_orm(column_name = "creatorId")]
    pub creator_id: String,

    #[sea_orm(column_name = "createdAt")]
    pub created_at: DateTimeUtc,

    #[sea_orm(column_name = "updatedAt")]
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

