# Database Design Audit (2026-01-02)

> 目的：面向 30–300 人规模：尽量保证常用外键（*Id）有索引，避免热路径全表扫描。
> 说明：这是启发式审计（schema 静态扫描），并不等同于实际查询计划分析；候选项需结合真实查询确认。

## Summary
- models: 53
- index candidates (*Id fields missing @@index): 43

## Candidates

- `Account.userId`  (建议：为热路径添加 @@index([userId]))
- `AIConversation.caseId`  (建议：为热路径添加 @@index([caseId]))
- `ApprovalRequest.approverId`  (建议：为热路径添加 @@index([approverId]))
- `ApprovalRequest.requesterId`  (建议：为热路径添加 @@index([requesterId]))
- `Case.channelId`  (建议：为热路径添加 @@index([channelId]))
- `Case.clientId`  (建议：为热路径添加 @@index([clientId]))
- `Case.deletedById`  (建议：为热路径添加 @@index([deletedById]))
- `Case.handlerId`  (建议：为热路径添加 @@index([handlerId]))
- `Case.originatorId`  (建议：为热路径添加 @@index([originatorId]))
- `Case.templateId`  (建议：为热路径添加 @@index([templateId]))
- `ChatThread.createdById`  (建议：为热路径添加 @@index([createdById]))
- `CollaborationInvite.receiverId`  (建议：为热路径添加 @@index([receiverId]))
- `CollaborationInvite.senderId`  (建议：为热路径添加 @@index([senderId]))
- `CollaborationInvite.targetId`  (建议：为热路径添加 @@index([targetId]))
- `ConflictCheck.caseId`  (建议：为热路径添加 @@index([caseId]))
- `ConflictCheck.checkedById`  (建议：为热路径添加 @@index([checkedById]))
- `Contact.assigneeId`  (建议：为热路径添加 @@index([assigneeId]))
- `Contact.deletedById`  (建议：为热路径添加 @@index([deletedById]))
- `Contract.creatorId`  (建议：为热路径添加 @@index([creatorId]))
- `Contract.deletedById`  (建议：为热路径添加 @@index([deletedById]))
- `Document.caseId`  (建议：为热路径添加 @@index([caseId]))
- `Document.uploaderId`  (建议：为热路径添加 @@index([uploaderId]))
- `DocumentVersion.uploaderId`  (建议：为热路径添加 @@index([uploaderId]))
- `EmailDelivery.messageId`  (建议：为热路径添加 @@index([messageId]))
- `Event.taskId`  (建议：为热路径添加 @@index([taskId]))
- `Invoice.caseId`  (建议：为热路径添加 @@index([caseId]))
- `Invoice.clientId`  (建议：为热路径添加 @@index([clientId]))
- `Notification.actorId`  (建议：为热路径添加 @@index([actorId]))
- `OpsAlert.acknowledgedById`  (建议：为热路径添加 @@index([acknowledgedById]))
- `OpsAlert.resolvedById`  (建议：为热路径添加 @@index([resolvedById]))
- `Payment.recorderId`  (建议：为热路径添加 @@index([recorderId]))
- `Project.deletedById`  (建议：为热路径添加 @@index([deletedById]))
- `ServiceRecord.contactId`  (建议：为热路径添加 @@index([contactId]))
- `ServiceRecord.lawyerId`  (建议：为热路径添加 @@index([lawyerId]))
- `Session.userId`  (建议：为热路径添加 @@index([userId]))
- `Task.documentId`  (建议：为热路径添加 @@index([documentId]))
- `TenantInvite.acceptedById`  (建议：为热路径添加 @@index([acceptedById]))
- `TenantInvite.createdById`  (建议：为热路径添加 @@index([createdById]))
- `TimeLog.taskId`  (建议：为热路径添加 @@index([taskId]))
- `UploadIntent.createdById`  (建议：为热路径添加 @@index([createdById]))
- `UploadIntent.documentVersionId`  (建议：为热路径添加 @@index([documentVersionId]))
- `User.activeTenantId`  (建议：为热路径添加 @@index([activeTenantId]))
- `User.supervisorId`  (建议：为热路径添加 @@index([supervisorId]))
