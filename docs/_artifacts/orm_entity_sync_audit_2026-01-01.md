# ORM Entity Sync Audit (2026-01-01)

> 目的：降低“双 ORM（Prisma + SeaORM）并行”带来的漂移风险。
> 注意：Rust 后端为原型/实验性网关，实体覆盖不要求 1:1；但 **Rust 不应出现 Prisma 中不存在的实体**。

## Summary
- Prisma models: 53
- Rust SeaORM entities: 13
- Rust entities missing in Prisma (should be 0): 0
- Prisma models not represented in Rust (allowed for prototype): 40

## Rust Entities

- `case.rs` → `Case`
- `case_member.rs` → `CaseMember`
- `chat_participant.rs` → `ChatParticipant`
- `chat_thread.rs` → `ChatThread`
- `conflict_check.rs` → `ConflictCheck`
- `document.rs` → `Document`
- `document_version.rs` → `DocumentVersion`
- `event.rs` → `Event`
- `event_participant.rs` → `EventParticipant`
- `notification.rs` → `Notification`
- `task.rs` → `Task`
- `time_log.rs` → `TimeLog`
- `user.rs` → `User`

## Rust Entities Missing in Prisma (Should Fix)

- ✅ None

## Prisma Models Not in Rust (Prototype Allowed)

- `AIConversation`
- `AIInvocation`
- `Account`
- `ApiRateLimit`
- `ApprovalRequest`
- `AvailabilityRule`
- `CaseTemplate`
- `ChatMessage`
- `CollaborationInvite`
- `Contact`
- `Contract`
- `CustomerTag`
- `DashboardLayout`
- `DocumentTemplate`
- `EmailDelivery`
- `Expense`
- `Firm`
- `FirmMembership`
- `Invoice`
- `OpsAlert`
- `OpsMetricSnapshot`
- `OutOfOffice`
- `Party`
- `PasswordResetToken`
- `Payment`
- `Project`
- `ProjectMember`
- `Schedule`
- `ServiceRecord`
- `Session`
- `TaskQueue`
- `Tenant`
- `TenantInvite`
- `TenantMembership`
- `TenantSignal`
- `ToolInvocation`
- `ToolModule`
- `UploadIntent`
- `UserSetting`
- `VerificationToken`
