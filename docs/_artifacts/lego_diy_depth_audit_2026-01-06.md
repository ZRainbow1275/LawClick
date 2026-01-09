# 全站乐高化 DIY 深度审计（2026-01-06）

> 目的：回答“不是只有页面包一层 Workspace 就算乐高化”，而是检验各页面/组件是否真的拆成 **可拖拽/可缩放/可记忆/可恢复** 的模块（blocks）。
> 方法：TypeScript AST 静态分析 `<SectionWorkspace ... catalog={...} />` 与 `<LegoDeck ... catalog={...} />` 的 `catalog`，尽量推导其数组长度范围（min/max）。

## Summary
- instances: 89
- SectionWorkspace: 53
- LegoDeck: 36

## Catalog Size 分布（推导 max）

| Kind | ? | 1 | 2 | >=3 |
|---|---:|---:|---:|---:|
| SectionWorkspace | 4 | 0 | 20 | 29 |
| LegoDeck | 9 | 0 | 10 | 17 |

## 明确薄弱点（max(catalog)<2）

- ✅ None

## 需要人工确认（catalog 无法推导）

> 说明：这些 `catalog` 往往由 `.map(...)` / 动态组合生成，静态无法得出长度；并不代表不乐高化，但建议对照 UI 进行抽样确认。

| Kind | Route | sectionId | File |
|---|---|---|---|
| LegoDeck | `/admin` | `admin_index_modules_cards` | `lawclick-next/src/app/(dashboard)/admin/page.tsx:199` |
| LegoDeck | - | `admin_approvals_pending_cards` | `lawclick-next/src/components/admin/ApprovalsBoardClient.tsx:455` |
| LegoDeck | - | `admin_approvals_approved_cards` | `lawclick-next/src/components/admin/ApprovalsBoardClient.tsx:475` |
| LegoDeck | - | `admin_approvals_mine_cards` | `lawclick-next/src/components/admin/ApprovalsBoardClient.tsx:494` |
| LegoDeck | - | `cases_list_grid_cards` | `lawclick-next/src/components/cases/CaseListClient.tsx:404` |
| LegoDeck | - | `cases_list_kanban_columns` | `lawclick-next/src/components/cases/CaseListClient.tsx:414` |
| LegoDeck | - | `create_case_team_members` | `lawclick-next/src/components/cases/CreateCaseWizard.tsx:699` |
| LegoDeck | - | `documents_list_grid_cards` | `lawclick-next/src/components/documents/DocumentListClient.tsx:533` |
| LegoDeck | - | - | `lawclick-next/src/components/tools/ToolsPageClient.tsx:443` |
| SectionWorkspace | `/admin/ops` | `admin_ops_index` | `lawclick-next/src/app/(dashboard)/admin/ops/page.tsx:105` |
| SectionWorkspace | - | `case_sidebar` | `lawclick-next/src/components/cases/CaseDetailClient.tsx:425` |
| SectionWorkspace | - | `cases_intake_layout` | `lawclick-next/src/components/cases/IntakeCasesWorkspaceClient.tsx:258` |
| SectionWorkspace | - | `document_detail` | `lawclick-next/src/components/documents/DocumentDetailClient.tsx:561` |

## 路由抽样（每页 Workspace 概览）

| Route | SectionWorkspace | LegoDeck | max(catalog) min..max |
|---|---:|---:|---|
| `/admin` | 1 | 1 | 2..2 |
| `/admin/ops` | 1 | 0 | ? |
| `/calendar` | 1 | 0 | 2..2 |
| `/crm/customers` | 2 | 0 | 5..5 |
| `/crm/customers/:id` | 1 | 0 | 8..8 |
| `/dashboard` | 1 | 1 | 7..8 |
| `/dispatch` | 1 | 0 | 5..5 |
| `/invites` | 1 | 0 | 2..2 |
| `/notifications` | 1 | 0 | 2..2 |
| `/projects/:id` | 2 | 0 | 2..3 |
| `/tasks` | 1 | 0 | 2..2 |
| `/team/:id/card` | 1 | 0 | 4..4 |

