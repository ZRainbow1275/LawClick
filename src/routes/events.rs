//! 日程 / 调度路由模块（真实闭环）
//!
//! 对齐 Web 主线 `lawclick-next/src/actions/event-actions.ts` 的最小闭环：
//! - 创建事件：落库 Event + EventParticipant；参与人默认 INVITED，创建者 ACCEPTED
//! - 查询事件：按时间范围返回当前用户相关事件
//! - 权限：`team:view`；若关联案件则额外 `case:view` + 案件可见性校验
//! - 通知：对被邀请参与人写入 Notification（type=INVITE_RECEIVED）

use axum::{
    extract::{Query, State},
    response::Json,
    routing::get,
    Router,
};
use chrono::{DateTime, Utc};
use sea_orm::{
    ActiveEnum, ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, QuerySelect, TransactionTrait,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use uuid::Uuid;
use validator::Validate;

use crate::db::AppState;
use crate::entity::{event, event_participant, notification};
use crate::error::{AppError, AppResult};
use crate::security::case_access::require_case_access;
use crate::security::current_user::CurrentUser;
use crate::security::permissions::{require_permission, Permission};
use crate::security::validation::{require_non_empty, ValidatedJson};

#[derive(Debug, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CreateEventRequest {
    #[validate(length(min = 1, max = 200, message = "标题不能为空"))]
    pub title: String,

    #[validate(length(min = 1, max = 5000, message = "description 长度不合法"))]
    pub description: Option<String>,

    pub r#type: Option<String>,
    pub visibility: Option<String>,

    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,

    #[validate(length(min = 1, max = 200, message = "location 长度不合法"))]
    pub location: Option<String>,

    #[validate(custom(function = "crate::security::validation::validate_uuid_str"))]
    pub case_id: Option<String>,

    #[validate(custom(function = "crate::security::validation::validate_uuid_str"))]
    pub task_id: Option<String>,

    pub participant_ids: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventsInRangeQuery {
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
    pub include_cancelled: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventParticipantDTO {
    pub user_id: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventDTO {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub r#type: String,
    pub visibility: String,
    pub status: String,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub location: Option<String>,
    pub case_id: Option<String>,
    pub task_id: Option<String>,
    pub creator_id: String,
    pub participants: Vec<EventParticipantDTO>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

fn parse_event_type(raw: Option<&str>) -> AppResult<event::EventType> {
    match raw.map(|s| s.trim()).filter(|s| !s.is_empty()) {
        None => Ok(event::EventType::Meeting),
        Some(v) => match v.to_uppercase().as_str() {
            "MEETING" => Ok(event::EventType::Meeting),
            "HEARING" => Ok(event::EventType::Hearing),
            "DEADLINE" => Ok(event::EventType::Deadline),
            "OTHER" => Ok(event::EventType::Other),
            _ => Err(AppError::Validation("eventType 无效".to_string())),
        },
    }
}

fn parse_event_visibility(raw: Option<&str>) -> AppResult<event::EventVisibility> {
    match raw.map(|s| s.trim()).filter(|s| !s.is_empty()) {
        None => Ok(event::EventVisibility::TeamBusy),
        Some(v) => match v.to_uppercase().as_str() {
            "PRIVATE" => Ok(event::EventVisibility::Private),
            "TEAM_BUSY" => Ok(event::EventVisibility::TeamBusy),
            "TEAM_PUBLIC" => Ok(event::EventVisibility::TeamPublic),
            "CASE_TEAM" => Ok(event::EventVisibility::CaseTeam),
            _ => Err(AppError::Validation("visibility 无效".to_string())),
        },
    }
}

async fn create_event(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    ValidatedJson(payload): ValidatedJson<CreateEventRequest>,
) -> AppResult<Json<EventDTO>> {
    require_permission(current_user.model.role.clone(), Permission::TeamView)?;

    if payload.end_time <= payload.start_time {
        return Err(AppError::Validation("endTime 必须晚于 startTime".to_string()));
    }

    let title = require_non_empty(&payload.title, "title", 200)?;
    let description = payload
        .description
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let location = payload
        .location
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let event_type = parse_event_type(payload.r#type.as_deref())?;
    let visibility = parse_event_visibility(payload.visibility.as_deref())?;

    if let Some(case_id) = payload.case_id.as_deref() {
        require_case_access(
            &state,
            case_id,
            current_user.id(),
            current_user.model.role.clone(),
            Permission::CaseView,
        )
        .await?;
    }

    let mut participant_ids: HashSet<String> = HashSet::new();
    if let Some(ids) = payload.participant_ids.as_ref() {
        for id in ids {
            let trimmed = id.trim();
            if trimmed.is_empty() {
                return Err(AppError::Validation("participantIds 包含空字符串".to_string()));
            }
            Uuid::parse_str(trimmed)
                .map_err(|_| AppError::Validation("participantIds 包含无效 UUID".to_string()))?;
            participant_ids.insert(trimmed.to_string());
        }
    }
    participant_ids.remove(current_user.id());

    let now = Utc::now();
    let event_id = Uuid::new_v4().to_string();
    let creator_id = current_user.id().to_string();
    let case_id = payload.case_id.clone();
    let task_id = payload.task_id.clone();

    let created = state
        .db
        .transaction(|txn| {
            let title = title.clone();
            let description = description.clone();
            let location = location.clone();
            let event_type = event_type.clone();
            let visibility = visibility.clone();
            let start_time = payload.start_time;
            let end_time = payload.end_time;
            let participant_ids = participant_ids.clone();
            let creator_id = creator_id.clone();
            let event_id = event_id.clone();
            let case_id = case_id.clone();
            let task_id = task_id.clone();
            Box::pin(async move {
                let active = event::ActiveModel {
                    id: sea_orm::ActiveValue::Set(event_id.clone()),
                    title: sea_orm::ActiveValue::Set(title),
                    description: sea_orm::ActiveValue::Set(description),
                    event_type: sea_orm::ActiveValue::Set(event_type),
                    visibility: sea_orm::ActiveValue::Set(visibility),
                    status: sea_orm::ActiveValue::Set(event::EventStatus::Scheduled),
                    start_time: sea_orm::ActiveValue::Set(start_time),
                    end_time: sea_orm::ActiveValue::Set(end_time),
                    location: sea_orm::ActiveValue::Set(location),
                    case_id: sea_orm::ActiveValue::Set(case_id),
                    task_id: sea_orm::ActiveValue::Set(task_id),
                    creator_id: sea_orm::ActiveValue::Set(creator_id.clone()),
                    created_at: sea_orm::ActiveValue::Set(now),
                    updated_at: sea_orm::ActiveValue::Set(now),
                };
                let created = active
                    .insert(txn)
                    .await
                    .map_err(|e| AppError::Database(format!("创建事件失败: {e}")))?;

                // creator 作为参与人（ACCEPTED）
                let creator_participant = event_participant::ActiveModel {
                    id: sea_orm::ActiveValue::Set(Uuid::new_v4().to_string()),
                    event_id: sea_orm::ActiveValue::Set(created.id.clone()),
                    user_id: sea_orm::ActiveValue::Set(creator_id.clone()),
                    status: sea_orm::ActiveValue::Set(event_participant::EventParticipantStatus::Accepted),
                    created_at: sea_orm::ActiveValue::Set(now),
                    updated_at: sea_orm::ActiveValue::Set(now),
                };
                creator_participant
                    .insert(txn)
                    .await
                    .map_err(|e| AppError::Database(format!("写入参与人失败: {e}")))?;

                // invited participants
                for pid in participant_ids.iter() {
                    let participant = event_participant::ActiveModel {
                        id: sea_orm::ActiveValue::Set(Uuid::new_v4().to_string()),
                        event_id: sea_orm::ActiveValue::Set(created.id.clone()),
                        user_id: sea_orm::ActiveValue::Set(pid.clone()),
                        status: sea_orm::ActiveValue::Set(event_participant::EventParticipantStatus::Invited),
                        created_at: sea_orm::ActiveValue::Set(now),
                        updated_at: sea_orm::ActiveValue::Set(now),
                    };
                    participant
                        .insert(txn)
                        .await
                        .map_err(|e| AppError::Database(format!("写入参与人失败: {e}")))?;

                    let notif = notification::ActiveModel {
                        id: sea_orm::ActiveValue::Set(Uuid::new_v4().to_string()),
                        user_id: sea_orm::ActiveValue::Set(pid.clone()),
                        actor_id: sea_orm::ActiveValue::Set(Some(creator_id.clone())),
                        notification_type: sea_orm::ActiveValue::Set(notification::NotificationType::InviteReceived),
                        title: sea_orm::ActiveValue::Set(format!("日程邀请：{}", created.title)),
                        content: sea_orm::ActiveValue::Set(Some(format!(
                            "开始：{}\n结束：{}",
                            created.start_time.to_rfc3339(),
                            created.end_time.to_rfc3339()
                        ))),
                        action_url: sea_orm::ActiveValue::Set(Some(format!("/calendar?eventId={}", created.id))),
                        metadata: sea_orm::ActiveValue::Set(None),
                        read_at: sea_orm::ActiveValue::Set(None),
                        created_at: sea_orm::ActiveValue::Set(now),
                    };
                    notif
                        .insert(txn)
                        .await
                        .map_err(|e| AppError::Database(format!("写入通知失败: {e}")))?;
                }

                Ok(created)
            })
        })
        .await
        .map_err(|e| match e {
            sea_orm::TransactionError::Connection(db) => AppError::Database(format!("事务连接失败: {db}")),
            sea_orm::TransactionError::Transaction(app) => app,
        })?;

    let participants = event_participant::Entity::find()
        .filter(event_participant::Column::EventId.eq(&created.id))
        .all(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询参与人失败: {e}")))?;

    Ok(Json(EventDTO {
        id: created.id,
        title: created.title,
        description: created.description,
        r#type: created.event_type.to_value(),
        visibility: created.visibility.to_value(),
        status: created.status.to_value(),
        start_time: created.start_time,
        end_time: created.end_time,
        location: created.location,
        case_id: created.case_id,
        task_id: created.task_id,
        creator_id: created.creator_id,
        participants: participants
            .into_iter()
            .map(|p| EventParticipantDTO {
                user_id: p.user_id,
                status: p.status.to_value(),
            })
            .collect(),
        created_at: created.created_at,
        updated_at: created.updated_at,
    }))
}

async fn list_events_in_range(
    State(state): State<Arc<AppState>>,
    current_user: CurrentUser,
    Query(query): Query<EventsInRangeQuery>,
) -> AppResult<Json<Vec<EventDTO>>> {
    require_permission(current_user.model.role.clone(), Permission::TeamView)?;

    if query.to <= query.from {
        return Err(AppError::Validation("to 必须晚于 from".to_string()));
    }

    let include_cancelled = query.include_cancelled.unwrap_or(false);

    let participant_event_ids: Vec<String> = event_participant::Entity::find()
        .filter(event_participant::Column::UserId.eq(current_user.id()))
        .filter(event_participant::Column::Status.ne(event_participant::EventParticipantStatus::Declined))
        .select_only()
        .column(event_participant::Column::EventId)
        .into_values::<String, event_participant::Column>()
        .all(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询参与事件失败: {e}")))?;

    let mut select = event::Entity::find()
        .filter(event::Column::StartTime.lt(query.to))
        .filter(event::Column::EndTime.gt(query.from))
        .filter(
            sea_orm::Condition::any()
                .add(event::Column::CreatorId.eq(current_user.id()))
                .add(event::Column::Id.is_in(participant_event_ids)),
        )
        .order_by_asc(event::Column::StartTime);

    if !include_cancelled {
        select = select.filter(event::Column::Status.eq(event::EventStatus::Scheduled));
    }

    let events = select
        .all(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询事件失败: {e}")))?;

    if events.is_empty() {
        return Ok(Json(vec![]));
    }

    let ids: Vec<String> = events.iter().map(|e| e.id.clone()).collect();
    let participants = event_participant::Entity::find()
        .filter(event_participant::Column::EventId.is_in(ids.clone()))
        .all(&state.db)
        .await
        .map_err(|e| AppError::Database(format!("查询参与人失败: {e}")))?;

    let mut map: HashMap<String, Vec<EventParticipantDTO>> = HashMap::new();
    for p in participants {
        map.entry(p.event_id)
            .or_default()
            .push(EventParticipantDTO { user_id: p.user_id, status: p.status.to_value() });
    }

    Ok(Json(
        events
            .into_iter()
            .map(|e| EventDTO {
                id: e.id.clone(),
                title: e.title,
                description: e.description,
                r#type: e.event_type.to_value(),
                visibility: e.visibility.to_value(),
                status: e.status.to_value(),
                start_time: e.start_time,
                end_time: e.end_time,
                location: e.location,
                case_id: e.case_id,
                task_id: e.task_id,
                creator_id: e.creator_id,
                participants: map.remove(&e.id).unwrap_or_default(),
                created_at: e.created_at,
                updated_at: e.updated_at,
            })
            .collect(),
    ))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/", get(list_events_in_range).post(create_event))
}
