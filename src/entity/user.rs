//! User Entity
//!
//! 用户表实体，与 Prisma `model User`（lawclick-next/prisma/schema.prisma）保持一致。

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// 用户角色枚举（与 Prisma Role 对应）
#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "Role")]
pub enum Role {
    #[sea_orm(string_value = "PARTNER")]
    Partner,
    #[sea_orm(string_value = "SENIOR_LAWYER")]
    SeniorLawyer,
    #[sea_orm(string_value = "LAWYER")]
    Lawyer,
    #[sea_orm(string_value = "TRAINEE")]
    Trainee,
    #[sea_orm(string_value = "ADMIN")]
    Admin,
    #[sea_orm(string_value = "HR")]
    Hr,
    #[sea_orm(string_value = "MARKETING")]
    Marketing,
    #[sea_orm(string_value = "LEGAL_SECRETARY")]
    LegalSecretary,
    #[sea_orm(string_value = "CLIENT")]
    Client,
    #[sea_orm(string_value = "FIRM_ENTITY")]
    FirmEntity,
}

impl Default for Role {
    fn default() -> Self {
        Self::Lawyer
    }
}

/// 用户状态枚举
#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "UserStatus")]
pub enum UserStatus {
    #[sea_orm(string_value = "AVAILABLE")]
    Available,
    #[sea_orm(string_value = "BUSY")]
    Busy,
    #[sea_orm(string_value = "FOCUS")]
    Focus,
    #[sea_orm(string_value = "MEETING")]
    Meeting,
    #[sea_orm(string_value = "AWAY")]
    Away,
    #[sea_orm(string_value = "OFFLINE")]
    Offline,
}

/// 用户实体
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "User")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    
    #[sea_orm(unique)]
    pub email: String,
    
    pub name: Option<String>,
    pub role: Role,

    #[sea_orm(column_name = "avatarUrl")]
    pub avatar_url: Option<String>,
    
    // 人事信息
    pub department: Option<String>,
    pub title: Option<String>,
    pub phone: Option<String>,

    #[sea_orm(column_name = "employeeNo")]
    pub employee_no: Option<String>,

    #[sea_orm(column_name = "joinDate")]
    pub join_date: Option<DateTimeUtc>,

    #[sea_orm(column_name = "leaveDate")]
    pub leave_date: Option<DateTimeUtc>,

    #[sea_orm(column_name = "isActive")]
    pub is_active: bool,
    
    // 工作状态
    pub status: UserStatus,

    #[sea_orm(column_name = "statusMessage")]
    pub status_message: Option<String>,

    #[sea_orm(column_name = "statusExpiry")]
    pub status_expiry: Option<DateTimeUtc>,

    #[sea_orm(column_name = "lastActiveAt")]
    pub last_active_at: Option<DateTimeUtc>,

    // 上级关系
    #[sea_orm(column_name = "supervisorId")]
    pub supervisor_id: Option<String>,
    
    // 费率
    #[sea_orm(column_name = "hourlyRate", column_type = "Decimal(Some((10, 2)))")]
    pub hourly_rate: Decimal,
    
    // 认证
    pub password: Option<String>,
    
    #[sea_orm(column_name = "createdAt")]
    pub created_at: DateTimeUtc,

    #[sea_orm(column_name = "updatedAt")]
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
