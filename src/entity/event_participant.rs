//! EventParticipant Entity
//!
//! 日程参与人实体，与 Prisma `model EventParticipant` 保持一致。

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// EventParticipantStatus（与 Prisma EventParticipantStatus 对应）
#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "EventParticipantStatus")]
pub enum EventParticipantStatus {
    #[sea_orm(string_value = "INVITED")]
    Invited,
    #[sea_orm(string_value = "ACCEPTED")]
    Accepted,
    #[sea_orm(string_value = "DECLINED")]
    Declined,
}

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "EventParticipant")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,

    #[sea_orm(column_name = "eventId")]
    pub event_id: String,

    #[sea_orm(column_name = "userId")]
    pub user_id: String,

    pub status: EventParticipantStatus,

    #[sea_orm(column_name = "createdAt")]
    pub created_at: DateTimeUtc,

    #[sea_orm(column_name = "updatedAt")]
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

