# 全站乐高化 DIY 深度审计（2026-01-02）

> 目的：回答“不是只有页面包一层 Workspace 就算乐高化”，而是检验各页面/组件是否真的拆成 **可拖拽/可缩放/可记忆/可恢复** 的模块（blocks）。
> 方法：TypeScript AST 静态分析 `<SectionWorkspace ... catalog={...} />` 与 `<LegoDeck ... catalog={...} />` 的 `catalog`，尽量推导其数组长度范围（min/max）。

## Summary
- instances: 78
- SectionWorkspace: 50
- LegoDeck: 28

## Catalog Size 分布（推导 max）

| Kind | ? | 1 | 2 | >=3 |
|---|---:|---:|---:|---:|
| SectionWorkspace | 34 | 7 | 3 | 6 |
| LegoDeck | 16 | 0 | 7 | 5 |

## 薄弱点（catalog 无法推导 或 max<2）

| Kind | Route | sectionId | File | Catalog |
|---|---|---|---|---|
| LegoDeck | `/admin` | `admin_index_modules_cards` | `lawclick-next/src/app/(dashboard)/admin/page.tsx:199` | ? |
| LegoDeck | `/tools` | - | `lawclick-next/src/app/(dashboard)/tools/page.tsx:714` | ? |
| LegoDeck | - | `admin_approvals_stats_cards` | `lawclick-next/src/components/admin/ApprovalsBoardClient.tsx:449` | ? |
| LegoDeck | - | `admin_approvals_pending_cards` | `lawclick-next/src/components/admin/ApprovalsBoardClient.tsx:477` | ? |
| LegoDeck | - | `admin_approvals_approved_cards` | `lawclick-next/src/components/admin/ApprovalsBoardClient.tsx:497` | ? |
| LegoDeck | - | `admin_approvals_mine_cards` | `lawclick-next/src/components/admin/ApprovalsBoardClient.tsx:516` | ? |
| LegoDeck | - | `case_billing_stats_cards` | `lawclick-next/src/components/cases/CaseBillingTab.tsx:286` | ? |
| LegoDeck | - | `cases_list_stats_cards` | `lawclick-next/src/components/cases/CaseListClient.tsx:307` | ? |
| LegoDeck | - | `cases_list_grid_cards` | `lawclick-next/src/components/cases/CaseListClient.tsx:403` | ? |
| LegoDeck | - | `cases_list_kanban_columns` | `lawclick-next/src/components/cases/CaseListClient.tsx:413` | ? |
| LegoDeck | - | `case_timelogs` | `lawclick-next/src/components/cases/CaseTimeLogsTab.tsx:410` | ? |
| LegoDeck | - | `create_case_team_members` | `lawclick-next/src/components/cases/CreateCaseWizard.tsx:686` | ? |
| LegoDeck | - | `firm_overview_stats` | `lawclick-next/src/components/dashboard/widgets/FirmOverviewWidget.tsx:226` | ? |
| LegoDeck | - | `today_time_summary_stats` | `lawclick-next/src/components/dashboard/widgets/TodayTimeSummaryWidget.tsx:122` | ? |
| LegoDeck | - | `documents_list_grid_cards` | `lawclick-next/src/components/documents/DocumentListClient.tsx:580` | ? |
| LegoDeck | - | `profile_metrics_cards` | `lawclick-next/src/components/profile/ProfileClient.tsx:254` | ? |
| SectionWorkspace | `/admin/ops` | `admin_ops_index` | `lawclick-next/src/app/(dashboard)/admin/ops/page.tsx:105` | ? |
| SectionWorkspace | `/admin` | `admin_index` | `lawclick-next/src/app/(dashboard)/admin/page.tsx:226` | ? |
| SectionWorkspace | `/calendar` | `calendar` | `lawclick-next/src/app/(dashboard)/calendar/page.tsx:90` | ? |
| SectionWorkspace | `/crm/customers/:id` | `crm_customer_detail` | `lawclick-next/src/app/(dashboard)/crm/customers/[id]/page.tsx:308` | ? |
| SectionWorkspace | `/crm/customers` | `crm_customers` | `lawclick-next/src/app/(dashboard)/crm/customers/page.tsx:396` | ? |
| SectionWorkspace | `/dashboard` | - | `lawclick-next/src/app/(dashboard)/dashboard/page.tsx:138` | ? |
| SectionWorkspace | `/dispatch` | - | `lawclick-next/src/app/(dashboard)/dispatch/page.tsx:126` | ? |
| SectionWorkspace | `/invites` | `invites` | `lawclick-next/src/app/(dashboard)/invites/page.tsx:62` | ? |
| SectionWorkspace | `/notifications` | - | `lawclick-next/src/app/(dashboard)/notifications/page.tsx:148` | ? |
| SectionWorkspace | `/projects/:id` | `project_main` | `lawclick-next/src/app/(dashboard)/projects/[id]/page.tsx:157` | ? |
| SectionWorkspace | `/projects/:id` | `project_sidebar` | `lawclick-next/src/app/(dashboard)/projects/[id]/page.tsx:166` | ? |
| SectionWorkspace | `/tasks` | - | `lawclick-next/src/app/(dashboard)/tasks/page.tsx:401` | ? |
| SectionWorkspace | - | `admin_document_templates` | `lawclick-next/src/components/admin/DocumentTemplatesWorkspaceClient.tsx:54` | ? |
| SectionWorkspace | - | `admin_kanban_ops` | `lawclick-next/src/components/admin/KanbanOpsClient.tsx:466` | ? |
| SectionWorkspace | - | `admin_upload_intents` | `lawclick-next/src/components/admin/UploadIntentsClient.tsx:360` | ? |
| SectionWorkspace | - | `auth` | `lawclick-next/src/components/auth/AuthWorkspaceShell.tsx:91` | ? |
| SectionWorkspace | - | `case_tab_parties` | `lawclick-next/src/components/cases/CaseDetailClient.tsx:729` | 1 |
| SectionWorkspace | - | `case_tab_tasks` | `lawclick-next/src/components/cases/CaseDetailClient.tsx:747` | 1 |
| SectionWorkspace | - | `case_tab_documents` | `lawclick-next/src/components/cases/CaseDetailClient.tsx:770` | 1 |
| SectionWorkspace | - | `case_tab_timelog` | `lawclick-next/src/components/cases/CaseDetailClient.tsx:892` | 1 |
| SectionWorkspace | - | `case_tab_events` | `lawclick-next/src/components/cases/CaseDetailClient.tsx:910` | 1 |
| SectionWorkspace | - | `case_tab_timeline` | `lawclick-next/src/components/cases/CaseDetailClient.tsx:1043` | 1 |
| SectionWorkspace | - | `case_tab_billing` | `lawclick-next/src/components/cases/CaseDetailClient.tsx:1061` | 1 |
| SectionWorkspace | - | `case_sidebar` | `lawclick-next/src/components/cases/CaseDetailClient.tsx:1092` | ? |
| SectionWorkspace | - | - | `lawclick-next/src/components/cases/CaseListClient.tsx:471` | ? |
| SectionWorkspace | - | `case_tab_settings` | `lawclick-next/src/components/cases/CaseSettingsTab.tsx:344` | ? |
| SectionWorkspace | - | `cases_intake_layout` | `lawclick-next/src/components/cases/IntakeCasesWorkspaceClient.tsx:258` | ? |
| SectionWorkspace | - | `party_detail` | `lawclick-next/src/components/cases/PartyDetailClient.tsx:256` | ? |
| SectionWorkspace | - | `chat_main` | `lawclick-next/src/components/chat/ChatPageClient.tsx:487` | ? |
| SectionWorkspace | - | `document_ai_review` | `lawclick-next/src/components/documents/DocumentAIReviewClient.tsx:296` | ? |
| SectionWorkspace | - | `document_detail` | `lawclick-next/src/components/documents/DocumentDetailClient.tsx:571` | ? |
| SectionWorkspace | - | - | `lawclick-next/src/components/documents/DocumentListClient.tsx:939` | ? |
| SectionWorkspace | - | `contract_detail` | `lawclick-next/src/components/finance/ContractDetailClient.tsx:546` | ? |
| SectionWorkspace | - | `profile` | `lawclick-next/src/components/profile/ProfileClient.tsx:458` | ? |
| SectionWorkspace | - | - | `lawclick-next/src/components/projects/ProjectsListClient.tsx:360` | ? |
| SectionWorkspace | - | `settings` | `lawclick-next/src/components/settings/SettingsClient.tsx:407` | ? |
| SectionWorkspace | - | `task_detail` | `lawclick-next/src/components/tasks/TaskDetailPageClient.tsx:150` | ? |
| SectionWorkspace | - | `team_member` | `lawclick-next/src/components/team/UserDetailClient.tsx:290` | ? |
| SectionWorkspace | - | `tenant_invite_accept` | `lawclick-next/src/components/tenants/TenantInviteAcceptWorkspaceClient.tsx:54` | ? |
| SectionWorkspace | - | `tenants` | `lawclick-next/src/components/tenants/TenantsClient.tsx:175` | ? |
| SectionWorkspace | - | `time_tracking` | `lawclick-next/src/components/timelog/TimeTrackingClient.tsx:97` | ? |

## 路由抽样（每页 Workspace 概览）

| Route | SectionWorkspace | LegoDeck | max(catalog) min..max |
|---|---:|---:|---|
| `/admin` | 1 | 1 | ? |
| `/admin/ops` | 1 | 0 | ? |
| `/calendar` | 1 | 0 | ? |
| `/crm/customers` | 2 | 0 | 5..5 |
| `/crm/customers/:id` | 1 | 0 | ? |
| `/dashboard` | 1 | 0 | ? |
| `/dispatch` | 1 | 0 | ? |
| `/invites` | 1 | 0 | ? |
| `/notifications` | 1 | 0 | ? |
| `/projects/:id` | 2 | 0 | ? |
| `/tasks` | 1 | 0 | ? |
| `/tools` | 1 | 1 | 3..3 |

