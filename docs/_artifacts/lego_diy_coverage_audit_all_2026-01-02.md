# 全站乐高化 DIY 覆盖审计（All Pages）（2026-01-02）

> 目的：证明“不是只有任务/看板”，而是全站任意页面（含 Auth）都具备可拖拽/可记忆/可恢复的组件化 DIY 能力。
> 方法：静态扫描 + 最多两跳组件追踪 + 最近 layout.tsx 回溯。只要命中 `PageWorkspace/SectionWorkspace/LegoDeck` 即认为具备 DIY 基础能力。

## Global Wrapper

- layouts with lego markers: 2
  - `lawclick-next/src/app/(dashboard)/layout.tsx`
  - `lawclick-next/src/components/auth/AuthWorkspaceShell.tsx`

## Summary
- pages: 47
- direct: 12
- via-component: 28
- via-layout: 3
- redirect-only: 4
- unknown: 0

## Coverage

| Route | Page | Evidence | Mode |
|---|---|---|---|
| `/admin` | `lawclick-next/src/app/(dashboard)/admin/page.tsx` | `lawclick-next/src/app/(dashboard)/admin/page.tsx` | direct |
| `/admin/approvals` | `lawclick-next/src/app/(dashboard)/admin/approvals/page.tsx` | `lawclick-next/src/components/admin/ApprovalsBoardClient.tsx` | via-component |
| `/admin/approvals/:id` | `lawclick-next/src/app/(dashboard)/admin/approvals/[id]/page.tsx` | `lawclick-next/src/components/admin/ApprovalDetailClient.tsx` | via-component |
| `/admin/document-templates` | `lawclick-next/src/app/(dashboard)/admin/document-templates/page.tsx` | `lawclick-next/src/components/admin/DocumentTemplatesWorkspaceClient.tsx` | via-component |
| `/admin/finance` | `lawclick-next/src/app/(dashboard)/admin/finance/page.tsx` | `lawclick-next/src/components/admin/FinanceCenterClient.tsx` | via-component |
| `/admin/ops` | `lawclick-next/src/app/(dashboard)/admin/ops/page.tsx` | `lawclick-next/src/app/(dashboard)/admin/ops/page.tsx` | direct |
| `/admin/ops/kanban` | `lawclick-next/src/app/(dashboard)/admin/ops/kanban/page.tsx` | `lawclick-next/src/components/admin/KanbanOpsClient.tsx` | via-component |
| `/admin/ops/queue` | `lawclick-next/src/app/(dashboard)/admin/ops/queue/page.tsx` | `lawclick-next/src/components/admin/QueueOpsClient.tsx` | via-component |
| `/admin/ops/uploads` | `lawclick-next/src/app/(dashboard)/admin/ops/uploads/page.tsx` | `lawclick-next/src/components/admin/UploadIntentsClient.tsx` | via-component |
| `/admin/recycle-bin` | `lawclick-next/src/app/(dashboard)/admin/recycle-bin/page.tsx` | `lawclick-next/src/components/admin/RecycleBinClient.tsx` | via-component |
| `/admin/tenants` | `lawclick-next/src/app/(dashboard)/admin/tenants/page.tsx` | `lawclick-next/src/components/admin/TenantAdminClient.tsx` | via-component |
| `/auth/login` | `lawclick-next/src/app/(auth)/auth/login/page.tsx` | `lawclick-next/src/components/auth/AuthWorkspaceShell.tsx` | via-layout |
| `/auth/register` | `lawclick-next/src/app/(auth)/auth/register/page.tsx` | `lawclick-next/src/components/auth/AuthWorkspaceShell.tsx` | via-layout |
| `/auth/reset-password` | `lawclick-next/src/app/(auth)/auth/reset-password/page.tsx` | `lawclick-next/src/components/auth/AuthWorkspaceShell.tsx` | via-layout |
| `/calendar` | `lawclick-next/src/app/(dashboard)/calendar/page.tsx` | `lawclick-next/src/app/(dashboard)/calendar/page.tsx` | direct |
| `/cases` | `lawclick-next/src/app/(dashboard)/cases/page.tsx` | `lawclick-next/src/components/cases/CaseListClient.tsx` | via-component |
| `/cases/:id` | `lawclick-next/src/app/(dashboard)/cases/[id]/page.tsx` | `lawclick-next/src/components/cases/CaseDetailClient.tsx` | via-component |
| `/cases/active` | `lawclick-next/src/app/(dashboard)/cases/active/page.tsx` | `lawclick-next/src/components/cases/CaseListClient.tsx` | via-component |
| `/cases/archive` | `lawclick-next/src/app/(dashboard)/cases/archive/page.tsx` | `lawclick-next/src/app/(dashboard)/cases/archive/page.tsx -> /cases/archived` | redirect |
| `/cases/archived` | `lawclick-next/src/app/(dashboard)/cases/archived/page.tsx` | `lawclick-next/src/components/cases/CaseListClient.tsx` | via-component |
| `/cases/intake` | `lawclick-next/src/app/(dashboard)/cases/intake/page.tsx` | `lawclick-next/src/components/cases/IntakeCasesWorkspaceClient.tsx` | via-component |
| `/cases/parties/:id` | `lawclick-next/src/app/(dashboard)/cases/parties/[id]/page.tsx` | `lawclick-next/src/components/cases/PartyDetailClient.tsx` | via-component |
| `/chat` | `lawclick-next/src/app/(dashboard)/chat/page.tsx` | `lawclick-next/src/components/chat/ChatPageClient.tsx` | via-component |
| `/contacts` | `lawclick-next/src/app/(dashboard)/contacts/page.tsx` | `lawclick-next/src/app/(dashboard)/contacts/page.tsx -> /crm/customers` | redirect |
| `/contracts/:id` | `lawclick-next/src/app/(dashboard)/contracts/[id]/page.tsx` | `lawclick-next/src/components/finance/ContractDetailClient.tsx` | via-component |
| `/crm/customers` | `lawclick-next/src/app/(dashboard)/crm/customers/page.tsx` | `lawclick-next/src/app/(dashboard)/crm/customers/page.tsx` | direct |
| `/crm/customers/:id` | `lawclick-next/src/app/(dashboard)/crm/customers/[id]/page.tsx` | `lawclick-next/src/app/(dashboard)/crm/customers/[id]/page.tsx` | direct |
| `/dashboard` | `lawclick-next/src/app/(dashboard)/dashboard/page.tsx` | `lawclick-next/src/app/(dashboard)/dashboard/page.tsx` | direct |
| `/dispatch` | `lawclick-next/src/app/(dashboard)/dispatch/page.tsx` | `lawclick-next/src/app/(dashboard)/dispatch/page.tsx` | direct |
| `/documents` | `lawclick-next/src/app/(dashboard)/documents/page.tsx` | `lawclick-next/src/components/documents/DocumentListClient.tsx` | via-component |
| `/documents/:id` | `lawclick-next/src/app/(dashboard)/documents/[id]/page.tsx` | `lawclick-next/src/components/documents/DocumentDetailClient.tsx` | via-component |
| `/documents/:id/review` | `lawclick-next/src/app/(dashboard)/documents/[id]/review/page.tsx` | `lawclick-next/src/components/documents/DocumentAIReviewClient.tsx` | via-component |
| `/invites` | `lawclick-next/src/app/(dashboard)/invites/page.tsx` | `lawclick-next/src/app/(dashboard)/invites/page.tsx` | direct |
| `/notifications` | `lawclick-next/src/app/(dashboard)/notifications/page.tsx` | `lawclick-next/src/app/(dashboard)/notifications/page.tsx` | direct |
| `/profile` | `lawclick-next/src/app/(dashboard)/profile/page.tsx` | `lawclick-next/src/components/profile/ProfileClient.tsx` | via-component |
| `/projects` | `lawclick-next/src/app/(dashboard)/projects/page.tsx` | `lawclick-next/src/components/projects/ProjectsListClient.tsx` | via-component |
| `/projects/:id` | `lawclick-next/src/app/(dashboard)/projects/[id]/page.tsx` | `lawclick-next/src/app/(dashboard)/projects/[id]/page.tsx` | direct |
| `/research` | `lawclick-next/src/app/(dashboard)/research/page.tsx` | `lawclick-next/src/app/(dashboard)/research/page.tsx -> /tools` | redirect |
| `/settings` | `lawclick-next/src/app/(dashboard)/settings/page.tsx` | `lawclick-next/src/components/settings/SettingsClient.tsx` | via-component |
| `/tasks` | `lawclick-next/src/app/(dashboard)/tasks/page.tsx` | `lawclick-next/src/app/(dashboard)/tasks/page.tsx` | direct |
| `/tasks/:id` | `lawclick-next/src/app/(dashboard)/tasks/[id]/page.tsx` | `lawclick-next/src/components/tasks/TaskDetailPageClient.tsx` | via-component |
| `/team/:id` | `lawclick-next/src/app/(dashboard)/team/[id]/page.tsx` | `lawclick-next/src/components/team/UserDetailClient.tsx` | via-component |
| `/tenants` | `lawclick-next/src/app/(dashboard)/tenants/page.tsx` | `lawclick-next/src/components/tenants/TenantsClient.tsx` | via-component |
| `/tenants/accept` | `lawclick-next/src/app/(dashboard)/tenants/accept/page.tsx` | `lawclick-next/src/components/tenants/TenantInviteAcceptWorkspaceClient.tsx` | via-component |
| `/time` | `lawclick-next/src/app/(dashboard)/time/page.tsx` | `lawclick-next/src/components/timelog/TimeTrackingClient.tsx` | via-component |
| `/timelog` | `lawclick-next/src/app/(dashboard)/timelog/page.tsx` | `lawclick-next/src/app/(dashboard)/timelog/page.tsx -> /time` | redirect |
| `/tools` | `lawclick-next/src/app/(dashboard)/tools/page.tsx` | `lawclick-next/src/app/(dashboard)/tools/page.tsx` | direct |

