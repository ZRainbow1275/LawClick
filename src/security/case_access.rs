//! 案件可见性与访问控制（与 Web 主线口径对齐）
//!
//! 规则（参考 `lawclick-next/src/lib/server-auth.ts` + `buildCaseVisibilityWhere`）：
//! - PARTNER / ADMIN：可访问所有案件
//! - 其它角色：仅可访问满足以下任一条件的案件
//!   - originatorId == userId
//!   - handlerId == userId
//!   - CaseMember 中存在 (caseId, userId)

use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};

use crate::db::AppState;
use crate::entity::{case, case_member, user::Role};
use crate::error::{AppError, AppResult};
use crate::security::permissions::{require_permission, Permission};

pub async fn require_case_access(
    state: &AppState,
    case_id: &str,
    user_id: &str,
    role: Role,
    permission: Permission,
) -> AppResult<case::Model> {
    require_permission(role.clone(), permission)?;

    let case_model = case::Entity::find_by_id(case_id)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询案件失败: {e}")))?
        .ok_or_else(|| AppError::NotFound(format!("案件 {} 不存在", case_id)))?;

    if matches!(role, Role::Partner | Role::Admin) {
        return Ok(case_model);
    }

    let is_direct =
        case_model.originator_id.as_deref() == Some(user_id) || case_model.handler_id.as_deref() == Some(user_id);
    if is_direct {
        return Ok(case_model);
    }

    let membership = case_member::Entity::find()
        .filter(case_member::Column::CaseId.eq(case_id))
        .filter(case_member::Column::UserId.eq(user_id))
        .one(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询案件成员失败: {e}")))?;

    if membership.is_some() {
        return Ok(case_model);
    }

    Err(AppError::Forbidden("无案件访问权限".to_string()))
}

