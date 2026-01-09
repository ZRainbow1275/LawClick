//! Case Entity
//!
//! 案件表实体，与 Prisma `model Case`（lawclick-next/prisma/schema.prisma）保持一致。

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// 案件状态枚举（与 Prisma CaseStatus 对应）
#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "CaseStatus")]
pub enum CaseStatus {
    #[sea_orm(string_value = "LEAD")]
    Lead,
    #[sea_orm(string_value = "INTAKE")]
    Intake,
    #[sea_orm(string_value = "ACTIVE")]
    Active,
    #[sea_orm(string_value = "SUSPENDED")]
    Suspended,
    #[sea_orm(string_value = "CLOSED")]
    Closed,
    #[sea_orm(string_value = "ARCHIVED")]
    Archived,
}

/// 服务类型枚举（与 Prisma ServiceType 对应）
#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "ServiceType")]
pub enum ServiceType {
    #[sea_orm(string_value = "LITIGATION")]
    Litigation,
    #[sea_orm(string_value = "NON_LITIGATION")]
    NonLitigation,
    #[sea_orm(string_value = "ADVISORY")]
    Advisory,
    #[sea_orm(string_value = "ARBITRATION")]
    Arbitration,
}

/// 计费模式枚举（与 Prisma BillingMode 对应）
#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "BillingMode")]
pub enum BillingMode {
    #[sea_orm(string_value = "HOURLY")]
    Hourly,
    #[sea_orm(string_value = "FIXED")]
    Fixed,
    #[sea_orm(string_value = "CAPPED")]
    Capped,
}

/// 案件实体
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "Case")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,

    #[sea_orm(column_name = "tenantId")]
    pub tenant_id: String,

    #[sea_orm(unique, column_name = "caseCode")]
    pub case_code: String,

    pub title: String,
    pub status: CaseStatus,

    #[sea_orm(column_name = "serviceType")]
    pub service_type: ServiceType,

    #[sea_orm(column_name = "billingMode")]
    pub billing_mode: BillingMode,

    #[sea_orm(column_name = "clientId")]
    pub client_id: String,

    #[sea_orm(column_name = "originatorId")]
    pub originator_id: Option<String>,

    #[sea_orm(column_name = "handlerId")]
    pub handler_id: Option<String>,

    pub description: Option<String>,

    #[sea_orm(column_name = "contractValue", column_type = "Decimal(Some((65, 30)))")]
    pub contract_value: Option<Decimal>,

    pub metadata: Option<Json>,

    #[sea_orm(column_name = "currentStage")]
    pub current_stage: Option<String>,

    #[sea_orm(column_name = "templateId")]
    pub template_id: Option<String>,

    #[sea_orm(column_name = "channelId")]
    pub channel_id: Option<String>,

    #[sea_orm(column_name = "createdAt")]
    pub created_at: DateTimeUtc,

    #[sea_orm(column_name = "updatedAt")]
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}

