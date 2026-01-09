//! Notification Entity
//!
//! 通知实体，与 Prisma `model Notification` 保持一致。

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// NotificationType（与 Prisma NotificationType 对应）
#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "NotificationType")]
pub enum NotificationType {
    #[sea_orm(string_value = "SYSTEM")]
    System,
    #[sea_orm(string_value = "CHAT_MESSAGE")]
    ChatMessage,
    #[sea_orm(string_value = "CASE_ASSIGNED")]
    CaseAssigned,
    #[sea_orm(string_value = "CASE_MEMBER_ADDED")]
    CaseMemberAdded,
    #[sea_orm(string_value = "TASK_ASSIGNED")]
    TaskAssigned,
    #[sea_orm(string_value = "INVITE_RECEIVED")]
    InviteReceived,
    #[sea_orm(string_value = "INVITE_ACCEPTED")]
    InviteAccepted,
    #[sea_orm(string_value = "INVITE_REJECTED")]
    InviteRejected,
}

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "Notification")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,

    #[sea_orm(column_name = "userId")]
    pub user_id: String,

    #[sea_orm(column_name = "actorId")]
    pub actor_id: Option<String>,

    #[sea_orm(column_name = "type")]
    pub notification_type: NotificationType,

    pub title: String,
    pub content: Option<String>,

    #[sea_orm(column_name = "actionUrl")]
    pub action_url: Option<String>,

    pub metadata: Option<Json>,

    #[sea_orm(column_name = "readAt")]
    pub read_at: Option<DateTimeUtc>,

    #[sea_orm(column_name = "createdAt")]
    pub created_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

