# Actions ↔ UI 覆盖审计（2026-01-03）

> 说明：本报告统计的是 **UI 代码对 actions 的 import/引用覆盖**（AST 解析 + 文本引用补充）。这不等价于“功能一定可达/一定有入口”，但能防止最常见的‘写了 actions 却完全没有前端接入’问题。

## 摘要
- actions exports: 230
- unique action names: 230
- scanned UI files: 216
- scanned src files (excluding src/actions): 308
- unreferenced exports (UI imports): 0
- unreferenced exports (outside actions): 0
- referenced outside UI only: 0

## 按 actions 文件分组（每个导出的 UI 引用数）

### `src/actions/ai-actions.ts`
- `analyzeDocumentById`（UI: 1，例：`src/components/documents/DocumentAIReviewClient.tsx`）
- `chatWithAIEnhanced`（UI: 1，例：`src/components/floating/AIAssistantContent.tsx`）
- `createConversation`（UI: 1，例：`src/components/floating/AIAssistantContent.tsx`）
- `createConversationWithContext`（UI: 1，例：`src/components/floating/AIAssistantContent.tsx`）
- `deleteConversation`（UI: 1，例：`src/components/floating/AIAssistantContent.tsx`）
- `getConversation`（UI: 1，例：`src/components/floating/AIAssistantContent.tsx`）
- `getConversations`（UI: 1，例：`src/components/floating/AIAssistantContent.tsx`）
- `getDocumentAIInvocations`（UI: 1，例：`src/components/documents/DocumentAIReviewClient.tsx`）

### `src/actions/approval-actions.ts`
- `approveRequest`（UI: 2，例：`src/components/admin/ApprovalDetailClient.tsx`, `src/components/admin/ApprovalsBoardClient.tsx`）
- `cancelRequest`（UI: 3，例：`src/components/admin/ApprovalDetailClient.tsx`, `src/components/admin/ApprovalsBoardClient.tsx`, `src/components/cases/CaseBillingTab.tsx`）
- `createApprovalRequest`（UI: 2，例：`src/components/admin/ApprovalsBoardClient.tsx`, `src/components/approvals/CreateApprovalDialog.tsx`）
- `getApprovalById`（UI: 1，例：`src/app/(dashboard)/admin/approvals/[id]/page.tsx`）
- `getApprovalsByCase`（UI: 1，例：`src/components/cases/CaseBillingTab.tsx`）
- `getAvailableApprovers`（UI: 2，例：`src/components/admin/ApprovalsBoardClient.tsx`, `src/components/approvals/CreateApprovalDialog.tsx`）
- `getMyApprovals`（UI: 2，例：`src/app/(dashboard)/admin/approvals/page.tsx`, `src/components/dashboard/widgets/PendingApprovalsWidgetClient.tsx`）
- `rejectRequest`（UI: 2，例：`src/components/admin/ApprovalDetailClient.tsx`, `src/components/admin/ApprovalsBoardClient.tsx`）

### `src/actions/auth.ts`
- `registerUser`（UI: 1，例：`src/app/(auth)/auth/register/page.tsx`）
- `requestPasswordReset`（UI: 1，例：`src/app/(auth)/auth/reset-password/ResetPasswordClient.tsx`）
- `resetPassword`（UI: 1，例：`src/app/(auth)/auth/reset-password/ResetPasswordClient.tsx`）

### `src/actions/billing-actions.ts`
- `getCaseBilling`（UI: 1，例：`src/components/cases/CaseBillingTab.tsx`）
- `getCaseBillingDetails`（UI: 1，例：`src/components/cases/CaseBillingTab.tsx`）

### `src/actions/case-kanban.ts`
- `getCaseKanbanCards`（UI: 3，例：`src/app/(dashboard)/dashboard/page.tsx`, `src/app/(dashboard)/dispatch/page.tsx`, `src/components/dashboard/widgets/DispatchCasePoolWidgetClient.tsx`）

### `src/actions/cases-crud.ts`
- `archiveCase`（UI: 1，例：`src/components/cases/CaseSettingsTab.tsx`）
- `assignCaseHandler`（UI: 1，例：`src/components/features/TeamHeatmap.tsx`）
- `changeCaseStatus`（UI: 1，例：`src/components/features/CaseKanban.tsx`）
- `createCase`（UI: 2，例：`src/components/cases/CreateCaseWizard.tsx`, `src/components/crm/CreateCaseFromCustomerDialog.tsx`）
- `deleteCase`（UI: 1，例：`src/components/cases/CaseSettingsTab.tsx`）
- `getCaseTemplates`（UI: 1，例：`src/components/cases/CreateCaseWizard.tsx`）
- `getClientsForSelect`（UI: 1，例：`src/components/cases/CreateCaseWizard.tsx`）
- `getLawyersForSelect`（UI: 1，例：`src/components/cases/CreateCaseWizard.tsx`）
- `updateCase`（UI: 1，例：`src/components/cases/CaseSettingsTab.tsx`）

### `src/actions/cases.ts`
- `getCaseDetails`（UI: 2，例：`src/app/(dashboard)/cases/[id]/page.tsx`, `src/app/(dashboard)/cases/intake/page.tsx`）
- `getCases`（UI: 10，例：`src/app/(dashboard)/cases/active/page.tsx`, `src/app/(dashboard)/cases/archived/page.tsx`, `src/app/(dashboard)/cases/intake/page.tsx` +7）
- `getDashboardData`（UI: 2，例：`src/app/(dashboard)/dashboard/page.tsx`, `src/app/(dashboard)/time/page.tsx`）

### `src/actions/chat-actions.ts`
- `getChatMessages`（UI: 3，例：`src/app/(dashboard)/chat/page.tsx`, `src/components/chat/ChatPageClient.tsx`, `src/components/floating/FloatingChat.tsx`）
- `getMyChatThreads`（UI: 2，例：`src/app/(dashboard)/chat/page.tsx`, `src/components/chat/ChatPageClient.tsx`）
- `getOrCreateCaseThread`（UI: 1，例：`src/components/floating/FloatingChat.tsx`）
- `getOrCreateDirectThread`（UI: 2，例：`src/components/chat/ChatPageClient.tsx`, `src/components/team/UserDetailClient.tsx`）
- `getOrCreateTeamThread`（UI: 1，例：`src/components/floating/FloatingChat.tsx`）
- `markAllChatThreadsRead`（UI: 1，例：`src/components/chat/ChatPageClient.tsx`）
- `sendChatMessage`（UI: 2，例：`src/components/chat/ChatPageClient.tsx`, `src/components/floating/FloatingChat.tsx`）

### `src/actions/collaboration-actions.ts`
- `createCollaborationInvite`（UI: 1，例：`src/components/collaboration/CreateCollaborationInviteDialog.tsx`）
- `getMyInvites`（UI: 4，例：`src/app/(dashboard)/dispatch/page.tsx`, `src/app/(dashboard)/invites/page.tsx`, `src/components/dashboard/widgets/DispatchHeatmapWidgetClient.tsx` +1）
- `getMyUserStatus`（UI: 1，例：`src/components/dashboard/widgets/MyStatusWidgetClient.tsx`）
- `getTeamActivity`（UI: 1，例：`src/components/dashboard/widgets/TeamActivityWidget.tsx`）
- `getTeamStatus`（UI: 2，例：`src/app/(dashboard)/dispatch/page.tsx`, `src/components/dashboard/widgets/DispatchHeatmapWidgetClient.tsx`）
- `getUserActivity`（UI: 1，例：`src/app/(dashboard)/team/[id]/page.tsx`）
- `getUserDetail`（UI: 1，例：`src/app/(dashboard)/team/[id]/page.tsx`）
- `respondToInvite`（UI: 1，例：`src/components/dispatch/PendingInvitesPanel.tsx`）
- `respondToMeetingInviteByEventId`（UI: 1，例：`src/components/calendar/EventDetailDialog.tsx`）
- `updateUserStatus`（UI: 1，例：`src/store/user-status-store.ts`）

### `src/actions/contract-actions.ts`
- `createContract`（UI: 1，例：`src/components/finance/CreateContractDialog.tsx`）
- `deleteContract`（UI: 2，例：`src/components/admin/FinanceCenterClient.tsx`, `src/components/finance/ContractDetailClient.tsx`）
- `getContractById`（UI: 1，例：`src/app/(dashboard)/contracts/[id]/page.tsx`）
- `getContracts`（UI: 2，例：`src/app/(dashboard)/admin/finance/page.tsx`, `src/components/cases/CaseBillingTab.tsx`）
- `linkContractDocument`（UI: 1，例：`src/components/finance/ContractDetailClient.tsx`）
- `unlinkContractDocument`（UI: 1，例：`src/components/finance/ContractDetailClient.tsx`）
- `updateContractStatus`（UI: 2，例：`src/components/admin/FinanceCenterClient.tsx`, `src/components/finance/ContractDetailClient.tsx`）

### `src/actions/customer-actions.ts`
- `addServiceRecord`（UI: 1，例：`src/components/crm/AddServiceRecordDialog.tsx`）
- `addTagToCustomer`（UI: 1，例：`src/components/crm/ManageCustomerTagsDialog.tsx`）
- `createCustomer`（UI: 1，例：`src/components/crm/CreateCustomerDialog.tsx`）
- `createTag`（UI: 1，例：`src/components/crm/ManageCustomerTagsDialog.tsx`）
- `deleteCustomer`（UI: 1，例：`src/components/crm/CustomerDeleteButton.tsx`）
- `getCustomerById`（UI: 1，例：`src/app/(dashboard)/crm/customers/[id]/page.tsx`）
- `getCustomerDirectory`（UI: 1，例：`src/components/dashboard/widgets/CustomerDirectoryWidgetClient.tsx`）
- `getCustomers`（UI: 1，例：`src/app/(dashboard)/crm/customers/page.tsx`）
- `getCustomerStats`（UI: 1，例：`src/app/(dashboard)/crm/customers/page.tsx`）
- `getServiceRecords`（UI: 1，例：`src/app/(dashboard)/crm/customers/[id]/page.tsx`）
- `getTags`（UI: 1，例：`src/app/(dashboard)/crm/customers/[id]/page.tsx`）
- `updateCustomer`（UI: 1，例：`src/components/crm/CustomerEditDialog.tsx`）
- `updateCustomerStage`（UI: 1，例：`src/components/crm/CustomerStageEditorClient.tsx`）

### `src/actions/dashboard-widgets.ts`
- `getDashboardRecentDocuments`（UI: 1，例：`src/components/dashboard/widgets/RecentDocumentsWidget.tsx`）
- `getDashboardUpcomingEvents`（UI: 1，例：`src/components/dashboard/widgets/UpcomingEventsWidgetClient.tsx`）
- `getFirmOverviewSnapshot`（UI: 1，例：`src/components/dashboard/widgets/FirmOverviewWidget.tsx`）

### `src/actions/dispatch-tasks.ts`
- `getUnassignedTasksForDispatch`（UI: 2，例：`src/app/(dashboard)/dispatch/page.tsx`, `src/components/dashboard/widgets/DispatchTaskPoolWidgetClient.tsx`）

### `src/actions/document-directory.ts`
- `getDocumentDirectory`（UI: 1，例：`src/components/finance/ContractDetailClient.tsx`）

### `src/actions/document-templates.ts`
- `createDocumentTemplate`（UI: 1，例：`src/components/admin/DocumentTemplatesClient.tsx`）
- `getAllDocumentTemplates`（UI: 2，例：`src/app/(dashboard)/admin/document-templates/page.tsx`, `src/components/admin/DocumentTemplatesClient.tsx`）
- `getDocumentTemplateForEdit`（UI: 1，例：`src/components/admin/DocumentTemplatesClient.tsx`）
- `getDocumentTemplatesForDrafting`（UI: 1，例：`src/components/cases/NewDraftDialog.tsx`）
- `updateDocumentTemplate`（UI: 1，例：`src/components/admin/DocumentTemplatesClient.tsx`）

### `src/actions/documents.ts`
- `addDocumentTag`（UI: 1，例：`src/components/documents/DocumentListClient.tsx`）
- `deleteDocument`（UI: 2，例：`src/components/documents/DocumentDetailClient.tsx`, `src/components/documents/DocumentListClient.tsx`）
- `finalizePresignedDocumentUpload`（UI: 1，例：`src/lib/document-upload-client.ts`）
- `generateDocument`（UI: 1，例：`src/components/cases/NewDraftDialog.tsx`）
- `getDocumentById`（UI: 2，例：`src/app/(dashboard)/documents/[id]/page.tsx`, `src/app/(dashboard)/documents/[id]/review/page.tsx`）
- `getDocuments`（UI: 1，例：`src/app/(dashboard)/documents/page.tsx`）
- `initPresignedDocumentUpload`（UI: 1，例：`src/lib/document-upload-client.ts`）
- `removeDocumentTag`（UI: 1，例：`src/components/documents/DocumentListClient.tsx`）
- `toggleDocumentFavorite`（UI: 2，例：`src/components/documents/DocumentDetailClient.tsx`, `src/components/documents/DocumentListClient.tsx`）
- `updateDocument`（UI: 2，例：`src/components/documents/DocumentDetailClient.tsx`, `src/components/documents/DocumentListClient.tsx`）
- `uploadDocument`（UI: 1，例：`src/lib/document-upload-client.ts`）

### `src/actions/event-actions.ts`
- `cancelEvent`（UI: 1，例：`src/components/calendar/EventDetailDialog.tsx`）
- `createEvent`（UI: 4，例：`src/components/calendar/CanvasCalendar.tsx`, `src/components/cases/CaseDetailClient.tsx`, `src/components/tasks/TaskDetailDialog.tsx` +1）
- `deleteEvent`（UI: 1，例：`src/components/calendar/EventDetailDialog.tsx`）
- `getAvailableSlots`（UI: 1，例：`src/components/calendar/CanvasCalendar.tsx`）
- `getEventById`（UI: 1，例：`src/components/calendar/CanvasCalendar.tsx`）
- `getEventOccurrencesInRange`（UI: 3，例：`src/app/(dashboard)/calendar/page.tsx`, `src/components/calendar/CanvasCalendar.tsx`, `src/components/dispatch/DispatchScheduleBoardClient.tsx`）
- `updateEvent`（UI: 1，例：`src/components/calendar/EventDetailDialog.tsx`）

### `src/actions/finance-actions.ts`
- `createExpense`（UI: 1，例：`src/components/finance/CreateExpenseDialog.tsx`）
- `createInvoice`（UI: 1，例：`src/components/finance/CreateInvoiceDialog.tsx`）
- `getExpenses`（UI: 2，例：`src/app/(dashboard)/admin/finance/page.tsx`, `src/components/cases/CaseBillingTab.tsx`）
- `getInvoices`（UI: 2，例：`src/app/(dashboard)/admin/finance/page.tsx`, `src/components/cases/CaseBillingTab.tsx`）
- `getInvoiceStats`（UI: 1，例：`src/app/(dashboard)/admin/finance/page.tsx`）
- `getPayments`（UI: 1，例：`src/components/admin/FinanceCenterClient.tsx`）
- `recordPayment`（UI: 1，例：`src/components/finance/RecordPaymentDialog.tsx`）
- `updateInvoiceStatus`（UI: 1，例：`src/components/admin/FinanceCenterClient.tsx`）

### `src/actions/members.ts`
- `addCaseMember`（UI: 1，例：`src/components/cases/CaseTeamCard.tsx`）
- `removeCaseMember`（UI: 1，例：`src/components/cases/CaseTeamCard.tsx`）

### `src/actions/notification-actions.ts`
- `getMyNotifications`（UI: 3，例：`src/app/(dashboard)/notifications/page.tsx`, `src/components/dashboard/widgets/NotificationsWidgetClient.tsx`, `src/components/layout/HeaderComponents.tsx`）
- `markAllNotificationsRead`（UI: 3，例：`src/app/(dashboard)/notifications/page.tsx`, `src/components/dashboard/widgets/NotificationsWidgetClient.tsx`, `src/components/layout/HeaderComponents.tsx`）
- `markNotificationRead`（UI: 3，例：`src/app/(dashboard)/notifications/page.tsx`, `src/components/dashboard/widgets/NotificationsWidgetClient.tsx`, `src/components/layout/HeaderComponents.tsx`）

### `src/actions/ops-kanban-monitoring.ts`
- `enqueueKanbanHealthCheck`（UI: 1，例：`src/components/admin/KanbanOpsClient.tsx`）
- `getKanbanMonitoring`（UI: 1，例：`src/app/(dashboard)/admin/ops/kanban/page.tsx`）

### `src/actions/ops-queue-monitoring.ts`
- `ackOpsAlert`（UI: 2，例：`src/components/admin/KanbanOpsClient.tsx`, `src/components/admin/QueueOpsClient.tsx`）
- `enqueueQueueHealthCheck`（UI: 1，例：`src/components/admin/QueueOpsClient.tsx`）
- `getQueueMonitoring`（UI: 1，例：`src/app/(dashboard)/admin/ops/queue/page.tsx`）
- `resolveOpsAlert`（UI: 2，例：`src/components/admin/KanbanOpsClient.tsx`, `src/components/admin/QueueOpsClient.tsx`）
- `snoozeOpsAlert`（UI: 2，例：`src/components/admin/KanbanOpsClient.tsx`, `src/components/admin/QueueOpsClient.tsx`）
- `unsnoozeOpsAlert`（UI: 2，例：`src/components/admin/KanbanOpsClient.tsx`, `src/components/admin/QueueOpsClient.tsx`）

### `src/actions/party-actions.ts`
- `addParty`（UI: 1，例：`src/components/cases/CasePartiesTab.tsx`）
- `deleteParty`（UI: 1，例：`src/components/cases/CasePartiesTab.tsx`）
- `getCaseParties`（UI: 1，例：`src/components/cases/CasePartiesTab.tsx`）
- `getPartyById`（UI: 1，例：`src/app/(dashboard)/cases/parties/[id]/page.tsx`）
- `updateParty`（UI: 1，例：`src/components/cases/CasePartiesTab.tsx`）

### `src/actions/projects-crud.ts`
- `addProjectMember`（UI: 1，例：`src/components/projects/ProjectMembersPanel.tsx`）
- `createProject`（UI: 1，例：`src/components/projects/CreateProjectDialog.tsx`）
- `deleteProject`（UI: 1，例：`src/components/projects/ProjectSettingsPanelClient.tsx`）
- `getProjectDetails`（UI: 1，例：`src/app/(dashboard)/projects/[id]/page.tsx`）
- `getProjects`（UI: 1，例：`src/components/dashboard/widgets/ProjectsDirectoryWidgetClient.tsx`）
- `getProjectsListPage`（UI: 2，例：`src/app/(dashboard)/projects/page.tsx`, `src/components/projects/ProjectsListClient.tsx`）
- `removeProjectMember`（UI: 1，例：`src/components/projects/ProjectMembersPanel.tsx`）
- `updateProject`（UI: 1，例：`src/components/projects/ProjectSettingsPanelClient.tsx`）

### `src/actions/queue-ops.ts`
- `cancelJob`（UI: 1，例：`src/components/admin/QueueOpsClient.tsx`）
- `getQueueJobs`（UI: 2，例：`src/app/(dashboard)/admin/ops/queue/page.tsx`, `src/components/admin/QueueOpsClient.tsx`）
- `requeueJob`（UI: 1，例：`src/components/admin/QueueOpsClient.tsx`）

### `src/actions/recycle-bin.ts`
- `getRecycleBinSnapshot`（UI: 1，例：`src/app/(dashboard)/admin/recycle-bin/page.tsx`）
- `restoreRecycleBinItem`（UI: 1，例：`src/components/admin/RecycleBinClient.tsx`）

### `src/actions/search-actions.ts`
- `globalSearch`（UI: 1，例：`src/components/layout/HeaderComponents.tsx`）

### `src/actions/section-layout.ts`
- `getMySectionWorkspaceConfig`（UI: 1，例：`src/components/layout/SectionWorkspace.tsx`）
- `resetMySectionWorkspaceConfig`（UI: 1，例：`src/components/layout/SectionWorkspace.tsx`）
- `saveMySectionWorkspaceConfig`（UI: 1，例：`src/components/layout/SectionWorkspace.tsx`）

### `src/actions/similar-cases.ts`
- `getSimilarCases`（UI: 1，例：`src/components/cases/SimilarCasesBlock.tsx`）

### `src/actions/stage-management.ts`
- `advanceCaseStage`（UI: 1，例：`src/components/cases/CaseStageTimeline.tsx`）
- `completeDocument`（UI: 1，例：`src/components/cases/StageDocumentChecklist.tsx`）
- `getCaseStageProgress`（UI: 1，例：`src/components/cases/CaseDetailClient.tsx`）
- `getStageDocuments`（UI: 1，例：`src/components/cases/CaseDetailClient.tsx`）
- `initializeStageDocuments`（UI: 1，例：`src/components/cases/CaseDetailClient.tsx`）
- `initializeStageTasks`（UI: 1，例：`src/components/cases/CaseDetailClient.tsx`）

### `src/actions/tasks-crud.ts`
- `assignTask`（UI: 1，例：`src/components/features/TeamHeatmap.tsx`）
- `createCaseTask`（UI: 1，例：`src/components/tasks/TaskKanban.tsx`）
- `createProjectTask`（UI: 2，例：`src/components/projects/ProjectTasksPanelClient.tsx`, `src/components/tasks/TaskKanban.tsx`）
- `deleteTask`（UI: 1，例：`src/components/tasks/TaskDetailDialog.tsx`）
- `getAccessibleTaskKanbanItemById`（UI: 1，例：`src/components/tasks/TaskKanban.tsx`）
- `getAccessibleTaskKanbanStatusCounts`（UI: 1，例：`src/components/tasks/TaskKanban.tsx`）
- `getAccessibleTaskKanbanStatusPage`（UI: 1，例：`src/components/tasks/TaskKanban.tsx`）
- `getAccessibleTasksForBoard`（UI: 1，例：`src/components/dashboard/widgets/TaskBoardQuickViewWidgetClient.tsx`）
- `getAccessibleTasksForBoardMeta`（UI: 1，例：`src/components/dashboard/widgets/TaskBoardQuickViewWidgetClient.tsx`）
- `getAccessibleTasksForListPage`（UI: 2，例：`src/app/(dashboard)/tasks/page.tsx`, `src/components/projects/ProjectTasksPanelClient.tsx`）
- `getUserTasks`（UI: 1，例：`src/components/dashboard/widgets/MyTasksWidgetClient.tsx`）
- `moveTaskOnKanban`（UI: 2，例：`src/components/tasks/TaskDetailDialog.tsx`, `src/components/tasks/TaskKanban.tsx`）
- `reorderTasks`（UI: 1，例：`src/components/tasks/TaskKanban.tsx`）
- `updateTask`（UI: 1，例：`src/components/tasks/TaskDetailDialog.tsx`）
- `updateTaskStatus`（UI: 1，例：`src/components/dashboard/widgets/TaskBoardQuickViewWidgetClient.tsx`）

### `src/actions/tasks-detail.ts`
- `getTaskDetailPageData`（UI: 1，例：`src/app/(dashboard)/tasks/[id]/page.tsx`）

### `src/actions/tasks.ts`
- `createTask`（UI: 2，例：`src/components/calendar/EventDetailDialog.tsx`, `src/components/tasks/QuickCreateTaskDialog.tsx`）
- `getTaskCreationCaseOptions`（UI: 1，例：`src/components/tasks/QuickCreateTaskDialog.tsx`）

### `src/actions/team-directory.ts`
- `getTeamDirectory`（UI: 3，例：`src/app/(dashboard)/calendar/page.tsx`, `src/app/(dashboard)/crm/customers/[id]/page.tsx`, `src/components/collaboration/CreateCollaborationInviteDialog.tsx`）

### `src/actions/tenant-actions.ts`
- `acceptTenantInvite`（UI: 1，例：`src/app/(dashboard)/tenants/accept/page.tsx`）
- `acceptTenantInviteById`（UI: 1，例：`src/components/tenants/TenantsClient.tsx`）
- `addTenantMemberByEmail`（UI: 1，例：`src/components/admin/TenantAdminClient.tsx`）
- `createTenant`（UI: 1，例：`src/components/admin/TenantAdminClient.tsx`）
- `createTenantInvite`（UI: 1，例：`src/components/admin/TenantAdminClient.tsx`）
- `getMyPendingTenantInvites`（UI: 1，例：`src/app/(dashboard)/tenants/page.tsx`）
- `getMyTenantContext`（UI: 1，例：`src/app/(dashboard)/layout.tsx`）
- `listTenantMembers`（UI: 1，例：`src/app/(dashboard)/admin/tenants/page.tsx`）
- `revokeTenantInvite`（UI: 1，例：`src/components/admin/TenantAdminClient.tsx`）
- `setTenantMemberStatus`（UI: 1，例：`src/components/admin/TenantAdminClient.tsx`）
- `switchMyActiveTenant`（UI: 2，例：`src/components/layout/AppHeader.tsx`, `src/components/tenants/TenantsClient.tsx`）
- `updateMyFirmProfile`（UI: 1，例：`src/components/admin/TenantAdminClient.tsx`）
- `updateTenantMemberRole`（UI: 1，例：`src/components/admin/TenantAdminClient.tsx`）

### `src/actions/timeline-actions.ts`
- `getCaseTimeline`（UI: 1，例：`src/components/cases/CaseTimelineTab.tsx`）

### `src/actions/timelogs-crud.ts`
- `addManualTimeLog`（UI: 1，例：`src/components/dashboard/widgets/ManualTimeLogWidgetClient.tsx`）
- `approveTimeLog`（UI: 1，例：`src/components/timelog/TimeApprovalClient.tsx`）
- `deleteTimeLog`（UI: 1，例：`src/components/timelog/TimeLogClient.tsx`）
- `getActiveTimer`（UI: 3，例：`src/app/(dashboard)/dashboard/page.tsx`, `src/components/floating/FloatingTimerContent.tsx`, `src/components/timelog/TimerWidget.tsx`）
- `getCaseTimeLogs`（UI: 1，例：`src/components/dashboard/widgets/CaseTimeLogsWidgetClient.tsx`）
- `getCaseTimeLogsPage`（UI: 1，例：`src/components/cases/CaseTimeLogsTab.tsx`）
- `getCaseTimeSummary`（UI: 2，例：`src/components/cases/CaseDetailClient.tsx`, `src/components/cases/CaseTimeLogsTab.tsx`）
- `getMyTimeLogs`（UI: 2，例：`src/app/(dashboard)/time/page.tsx`, `src/components/features/timesheet/TimesheetCalendar.tsx`）
- `getMyTimeLogsMeta`（UI: 1，例：`src/components/features/timesheet/TimesheetCalendar.tsx`）
- `getMyTimeSummary`（UI: 1，例：`src/app/(dashboard)/dashboard/page.tsx`）
- `getTimeLogsPendingApproval`（UI: 1，例：`src/components/timelog/TimeApprovalClient.tsx`）
- `getTodayTimeSummary`（UI: 1，例：`src/components/dashboard/widgets/TodayTimeSummaryWidget.tsx`）
- `markTimeLogBilled`（UI: 1，例：`src/components/timelog/TimeApprovalClient.tsx`）
- `pauseTimer`（UI: 2，例：`src/components/floating/FloatingTimerContent.tsx`, `src/components/timelog/TimerWidget.tsx`）
- `resumeTimer`（UI: 2，例：`src/components/floating/FloatingTimerContent.tsx`, `src/components/timelog/TimerWidget.tsx`）
- `startTimer`（UI: 4，例：`src/components/features/CaseKanban.tsx`, `src/components/tasks/TaskDetailDialog.tsx`, `src/components/tasks/TaskKanban.tsx` +1）
- `stopTimer`（UI: 2，例：`src/components/floating/FloatingTimerContent.tsx`, `src/components/timelog/TimerWidget.tsx`）
- `unapproveTimeLog`（UI: 1，例：`src/components/timelog/TimeApprovalClient.tsx`）
- `unmarkTimeLogBilled`（UI: 1，例：`src/components/timelog/TimeApprovalClient.tsx`）
- `updateTimeLog`（UI: 1，例：`src/components/floating/FloatingTimerContent.tsx`）

### `src/actions/timelogs.ts`
- `createTimeLog`（UI: 2，例：`src/components/cases/CaseTimeLogsTab.tsx`, `src/components/timelog/TimeLogClient.tsx`）

### `src/actions/tool-actions.ts`
- `createToolModule`（UI: 1，例：`src/components/tools/ToolsPageClient.tsx`）
- `deleteToolModule`（UI: 1，例：`src/components/tools/ToolsPageClient.tsx`）
- `getToolInvocationDetail`（UI: 1，例：`src/components/tools/ToolsPageClient.tsx`）
- `getToolInvocations`（UI: 1，例：`src/components/tools/ToolsPageClient.tsx`）
- `getToolModules`（UI: 1，例：`src/components/tools/ToolsPageClient.tsx`）
- `triggerModuleWebhook`（UI: 1，例：`src/components/tools/ToolsPageClient.tsx`）
- `updateToolModule`（UI: 1，例：`src/components/tools/ToolsPageClient.tsx`）

### `src/actions/ui-settings.ts`
- `getMyAppUiPreferences`（UI: 1，例：`src/app/(dashboard)/layout.tsx`）
- `getMyCasesUiPreferences`（UI: 2，例：`src/app/(dashboard)/cases/intake/page.tsx`, `src/app/(dashboard)/layout.tsx`）
- `getMyDashboardUiPreferences`（UI: 1，例：`src/app/(dashboard)/layout.tsx`）
- `getMyDispatchUiPreferences`（UI: 2，例：`src/app/(dashboard)/calendar/page.tsx`, `src/app/(dashboard)/dispatch/page.tsx`）
- `getMyFloatingLauncherConfig`（UI: 1，例：`src/app/(dashboard)/layout.tsx`）
- `getMyOnboardingUiPreferences`（UI: 1，例：`src/app/(dashboard)/layout.tsx`）
- `updateMyAppUiPreferences`（UI: 1，例：`src/components/layout/UiPreferencesProvider.tsx`）
- `updateMyCasesUiPreferences`（UI: 1，例：`src/components/layout/UiPreferencesProvider.tsx`）
- `updateMyDashboardUiPreferences`（UI: 1，例：`src/components/layout/UiPreferencesProvider.tsx`）
- `updateMyDispatchUiPreferences`（UI: 1，例：`src/components/dispatch/DispatchScheduleBoardClient.tsx`）
- `updateMyFloatingLauncherConfig`（UI: 1，例：`src/components/layout/UiPreferencesProvider.tsx`）
- `updateMyOnboardingUiPreferences`（UI: 1，例：`src/components/layout/UiPreferencesProvider.tsx`）

### `src/actions/upload-intents.ts`
- `enqueueCleanupUploadIntents`（UI: 1，例：`src/components/admin/UploadIntentsClient.tsx`）
- `getUploadIntents`（UI: 2，例：`src/app/(dashboard)/admin/ops/uploads/page.tsx`, `src/components/admin/UploadIntentsClient.tsx`）

### `src/actions/workspace-layout.ts`
- `getMyWorkspaceConfig`（UI: 1，例：`src/components/layout/PageWorkspace.tsx`）
- `resetMyWorkspaceConfig`（UI: 1，例：`src/components/layout/PageWorkspace.tsx`）
- `saveMyWorkspaceConfig`（UI: 1，例：`src/components/layout/PageWorkspace.tsx`）

### `src/actions/workspace-notes.ts`
- `getMyWorkspaceNote`（UI: 1，例：`src/components/dashboard/widgets/WorkspaceNotesWidgetClient.tsx`）
- `resetMyWorkspaceNote`（UI: 1，例：`src/components/dashboard/widgets/WorkspaceNotesWidgetClient.tsx`）
- `saveMyWorkspaceNote`（UI: 1，例：`src/components/dashboard/widgets/WorkspaceNotesWidgetClient.tsx`）
