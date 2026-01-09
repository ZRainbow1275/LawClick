//! ChatParticipant Entity
//!
//! 会话参与人实体，与 Prisma `model ChatParticipant` 保持一致。

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "ChatParticipant")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,

    #[sea_orm(column_name = "threadId")]
    pub thread_id: String,

    #[sea_orm(column_name = "userId")]
    pub user_id: String,

    #[sea_orm(column_name = "joinedAt")]
    pub joined_at: DateTimeUtc,

    #[sea_orm(column_name = "lastReadAt")]
    pub last_read_at: Option<DateTimeUtc>,

    pub muted: bool,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

