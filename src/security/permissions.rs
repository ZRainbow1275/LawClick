//! 权限模型（Rust 侧）
//!
//! 目标：与 `lawclick-next/src/lib/permissions.ts` 的口径保持一致，
//! 避免出现“同库同用户，但 Rust/Next 权限行为不一致”的隐患。

use crate::entity::user::Role;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Permission {
    // Dashboard permissions
    DashboardView,
    DashboardEdit,
    // Case permissions
    CaseView,
    CaseCreate,
    CaseEdit,
    CaseDelete,
    CaseAssign,
    CaseArchive,
    // Task permissions
    TaskView,
    TaskCreate,
    TaskEdit,
    TaskDelete,
    // Document permissions
    DocumentView,
    DocumentUpload,
    DocumentEdit,
    DocumentDelete,
    DocumentTemplateManage,
    // Billing permissions
    BillingView,
    BillingCreate,
    BillingEdit,
    BillingApprove,
    TimeLogApprove,
    // Team permissions
    TeamView,
    TeamManage,
    UserManage,
    UserViewAll,
    // Approval permissions
    ApprovalCreate,
    ApprovalApprove,
    ApprovalViewAll,
    // CRM permissions
    CrmView,
    CrmEdit,
    // Tools permissions
    ToolsManage,
    // AI permissions
    AiUse,
    // Admin permissions
    AdminAccess,
    AdminSettings,
    AdminAudit,
}

impl Permission {
    pub fn as_str(self) -> &'static str {
        match self {
            Permission::DashboardView => "dashboard:view",
            Permission::DashboardEdit => "dashboard:edit",
            Permission::CaseView => "case:view",
            Permission::CaseCreate => "case:create",
            Permission::CaseEdit => "case:edit",
            Permission::CaseDelete => "case:delete",
            Permission::CaseAssign => "case:assign",
            Permission::CaseArchive => "case:archive",
            Permission::TaskView => "task:view",
            Permission::TaskCreate => "task:create",
            Permission::TaskEdit => "task:edit",
            Permission::TaskDelete => "task:delete",
            Permission::DocumentView => "document:view",
            Permission::DocumentUpload => "document:upload",
            Permission::DocumentEdit => "document:edit",
            Permission::DocumentDelete => "document:delete",
            Permission::DocumentTemplateManage => "document:template_manage",
            Permission::BillingView => "billing:view",
            Permission::BillingCreate => "billing:create",
            Permission::BillingEdit => "billing:edit",
            Permission::BillingApprove => "billing:approve",
            Permission::TimeLogApprove => "timelog:approve",
            Permission::TeamView => "team:view",
            Permission::TeamManage => "team:manage",
            Permission::UserManage => "user:manage",
            Permission::UserViewAll => "user:view_all",
            Permission::ApprovalCreate => "approval:create",
            Permission::ApprovalApprove => "approval:approve",
            Permission::ApprovalViewAll => "approval:view_all",
            Permission::CrmView => "crm:view",
            Permission::CrmEdit => "crm:edit",
            Permission::ToolsManage => "tools:manage",
            Permission::AiUse => "ai:use",
            Permission::AdminAccess => "admin:access",
            Permission::AdminSettings => "admin:settings",
            Permission::AdminAudit => "admin:audit",
        }
    }
}

impl std::fmt::Display for Permission {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

pub fn parse_role(role: &str) -> Option<Role> {
    match role.trim().to_uppercase().as_str() {
        "PARTNER" => Some(Role::Partner),
        "SENIOR_LAWYER" => Some(Role::SeniorLawyer),
        "LAWYER" => Some(Role::Lawyer),
        "TRAINEE" => Some(Role::Trainee),
        "ADMIN" => Some(Role::Admin),
        "HR" => Some(Role::Hr),
        "MARKETING" => Some(Role::Marketing),
        "LEGAL_SECRETARY" => Some(Role::LegalSecretary),
        "CLIENT" => Some(Role::Client),
        "FIRM_ENTITY" => Some(Role::FirmEntity),
        _ => None,
    }
}

const PARTNER_PERMISSIONS: &[Permission] = &[
    Permission::DashboardView,
    Permission::DashboardEdit,
    Permission::CaseView,
    Permission::CaseCreate,
    Permission::CaseEdit,
    Permission::CaseDelete,
    Permission::CaseAssign,
    Permission::CaseArchive,
    Permission::TaskView,
    Permission::TaskCreate,
    Permission::TaskEdit,
    Permission::TaskDelete,
    Permission::DocumentView,
    Permission::DocumentUpload,
    Permission::DocumentEdit,
    Permission::DocumentDelete,
    Permission::DocumentTemplateManage,
    Permission::BillingView,
    Permission::BillingCreate,
    Permission::BillingEdit,
    Permission::BillingApprove,
    Permission::TimeLogApprove,
    Permission::TeamView,
    Permission::TeamManage,
    Permission::UserManage,
    Permission::UserViewAll,
    Permission::ApprovalCreate,
    Permission::ApprovalApprove,
    Permission::ApprovalViewAll,
    Permission::CrmView,
    Permission::CrmEdit,
    Permission::ToolsManage,
    Permission::AiUse,
    Permission::AdminAccess,
    Permission::AdminSettings,
    Permission::AdminAudit,
];

const SENIOR_LAWYER_PERMISSIONS: &[Permission] = &[
    Permission::DashboardView,
    Permission::DashboardEdit,
    Permission::CaseView,
    Permission::CaseCreate,
    Permission::CaseEdit,
    Permission::CaseAssign,
    Permission::CaseArchive,
    Permission::TaskView,
    Permission::TaskCreate,
    Permission::TaskEdit,
    Permission::TaskDelete,
    Permission::DocumentView,
    Permission::DocumentUpload,
    Permission::DocumentEdit,
    Permission::DocumentDelete,
    Permission::BillingView,
    Permission::BillingCreate,
    Permission::TimeLogApprove,
    Permission::TeamView,
    Permission::TeamManage,
    Permission::ApprovalCreate,
    Permission::ApprovalApprove,
    Permission::CrmView,
    Permission::CrmEdit,
    Permission::AiUse,
];

const LAWYER_PERMISSIONS: &[Permission] = &[
    Permission::DashboardView,
    Permission::DashboardEdit,
    Permission::CaseView,
    Permission::CaseCreate,
    Permission::CaseEdit,
    Permission::CaseAssign,
    Permission::TaskView,
    Permission::TaskCreate,
    Permission::TaskEdit,
    Permission::DocumentView,
    Permission::DocumentUpload,
    Permission::DocumentEdit,
    Permission::BillingView,
    Permission::BillingCreate,
    Permission::TeamView,
    Permission::ApprovalCreate,
    Permission::CrmView,
    Permission::CrmEdit,
    Permission::AiUse,
];

const TRAINEE_PERMISSIONS: &[Permission] = &[
    Permission::DashboardView,
    Permission::DashboardEdit,
    Permission::CaseView,
    Permission::TaskView,
    Permission::TaskCreate,
    Permission::TaskEdit,
    Permission::DocumentView,
    Permission::DocumentUpload,
    Permission::TeamView,
    Permission::ApprovalCreate,
    Permission::CrmView,
    Permission::AiUse,
];

const ADMIN_PERMISSIONS: &[Permission] = &[
    Permission::DashboardView,
    Permission::DashboardEdit,
    Permission::CaseView,
    Permission::TaskView,
    Permission::TaskCreate,
    Permission::TaskEdit,
    Permission::TaskDelete,
    Permission::DocumentView,
    Permission::DocumentUpload,
    Permission::DocumentEdit,
    Permission::DocumentDelete,
    Permission::BillingView,
    Permission::BillingCreate,
    Permission::BillingEdit,
    Permission::BillingApprove,
    Permission::TeamView,
    Permission::TeamManage,
    Permission::UserManage,
    Permission::UserViewAll,
    Permission::ApprovalCreate,
    Permission::ApprovalApprove,
    Permission::ApprovalViewAll,
    Permission::CrmView,
    Permission::CrmEdit,
    Permission::ToolsManage,
    Permission::AiUse,
    Permission::AdminAccess,
    Permission::AdminSettings,
    Permission::AdminAudit,
];

const HR_PERMISSIONS: &[Permission] = &[
    Permission::DashboardView,
    Permission::DashboardEdit,
    Permission::TaskView,
    Permission::TaskCreate,
    Permission::TaskEdit,
    Permission::DocumentView,
    Permission::DocumentUpload,
    Permission::TeamView,
    Permission::UserManage,
    Permission::UserViewAll,
    Permission::ApprovalCreate,
    Permission::AiUse,
];

const MARKETING_PERMISSIONS: &[Permission] = &[
    Permission::DashboardView,
    Permission::DashboardEdit,
    Permission::TaskView,
    Permission::TaskCreate,
    Permission::TaskEdit,
    Permission::DocumentView,
    Permission::DocumentUpload,
    Permission::TeamView,
    Permission::ApprovalCreate,
    Permission::CrmView,
    Permission::CrmEdit,
    Permission::AiUse,
];

const LEGAL_SECRETARY_PERMISSIONS: &[Permission] = &[
    Permission::DashboardView,
    Permission::DashboardEdit,
    Permission::CaseView,
    Permission::TaskView,
    Permission::TaskCreate,
    Permission::TaskEdit,
    Permission::DocumentView,
    Permission::DocumentUpload,
    Permission::DocumentEdit,
    Permission::BillingView,
    Permission::TeamView,
    Permission::ApprovalCreate,
    Permission::CrmView,
    Permission::CrmEdit,
    Permission::AiUse,
];

const CLIENT_PERMISSIONS: &[Permission] = &[
    Permission::CaseView,
    Permission::DocumentView,
    Permission::BillingView,
];

const FIRM_ENTITY_PERMISSIONS: &[Permission] = &[];

pub fn permissions_for_role(role: Role) -> &'static [Permission] {
    match role {
        Role::Partner => PARTNER_PERMISSIONS,
        Role::SeniorLawyer => SENIOR_LAWYER_PERMISSIONS,
        Role::Lawyer => LAWYER_PERMISSIONS,
        Role::Trainee => TRAINEE_PERMISSIONS,
        Role::Admin => ADMIN_PERMISSIONS,
        Role::Hr => HR_PERMISSIONS,
        Role::Marketing => MARKETING_PERMISSIONS,
        Role::LegalSecretary => LEGAL_SECRETARY_PERMISSIONS,
        Role::Client => CLIENT_PERMISSIONS,
        Role::FirmEntity => FIRM_ENTITY_PERMISSIONS,
    }
}

pub fn has_permission(role: Role, permission: Permission) -> bool {
    permissions_for_role(role).contains(&permission)
}

pub fn require_permission(role: Role, permission: Permission) -> AppResult<()> {
    if has_permission(role, permission) {
        return Ok(());
    }
    Err(AppError::Forbidden(format!("缺少权限：{permission}")))
}
