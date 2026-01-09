# 审计补充与回归验证（2026-01-01）

> 目的：对照 `docs/批判性项目审计报告_2025-12-29.md`（第九、十章）与 `docs/前后端功能缺失专项审查_2025-12-30.md`，复核当前真实代码状态，补齐遗漏的“乐高化”与前后端一致性缺口，并进行一次可重复的质量门禁回归（type-check/lint/build + 审计脚本）。

## 一、复跑门禁与审计脚本（当前状态）

在 `lawclick-next/` 目录执行：

- `pnpm audit:actions-ui`
  - actions exports: 228
  - unreferenced exports (UI imports): 0
  - unreferenced exports (outside actions): 0
  - referenced outside UI only: 0
- `pnpm audit:routes`
  - app routes: 51
  - OK: 未发现断链路由引用
- `pnpm audit:tenant-scope`
  - tenant-scoped models: 29
  - OK: tenant-scope-guard 目标清单已生成
- `pnpm type-check`：通过
- `pnpm lint`：通过（0 warnings）
- `pnpm build`：通过（Next.js 16 / Turbopack）

## 二、本轮发现的“偷懒/不一致”与修复

### 2.1 类型一致性：`success` 非判别联合导致 `never`（阻塞 type-check）

现象：部分 UI 组件用 `Extract<ReturnType<...>, { success: true }>` 提取成功分支类型，但对应 actions 返回的 `success` 被推断为 `boolean`（非字面量），导致 Extract 结果为 `never`，从而触发属性访问报错。

修复：
- `lawclick-next/src/actions/collaboration-actions.ts`：`getMyInvites` 所有分支改为 `success: true as const / false as const`
- `lawclick-next/src/actions/approval-actions.ts`：`getMyApprovals` 所有分支改为 `success: true as const / false as const`

结果：`pnpm type-check` 通过。

### 2.2 “乐高化”真实性：合同详情页存在重复实现 + 未落地的 Blocks

现象：`ContractDetailClient` 内部同时存在“已写好的可复用 Blocks（合同信息/关联合同文档/危险操作）”与一套重复的固定布局实现，导致：
- 代码重复（DRY 破坏）
- Blocks 形同虚设（被 lint 报 unused）
- 合同详情页内部不可 DIY（与“全站乐高化”目标不一致）

修复：
- 重写 `lawclick-next/src/components/finance/ContractDetailClient.tsx`
  - 使用 `SectionWorkspace` 将合同详情拆为可拖拽/可缩放/可保存/可恢复的 Blocks
  - 将“导航与状态”也作为 pinned block，避免固定布局死板
  - 去除重复实现（统一由 Blocks 提供能力）

结果：`pnpm lint` 0 warnings；合同详情内布局可 DIY 且可恢复默认。

### 2.3 工具箱页：残留无用导入/无用 helper

修复：
- `lawclick-next/src/app/(dashboard)/tools/page.tsx`：移除未使用 `SectionCatalogItem` 与未使用的 `stableBlockId`

## 三、对照专项审查问题的落实情况（核心条目）

> 说明：`docs/前后端功能缺失专项审查_2025-12-30.md` 中列举的 P0/P1/P2 缺口，已在后续迭代中逐项补齐；本轮重点补齐“乐高化真实性”与“类型一致性阻塞”。

| 审查项 | 结论 | 证据（代码位置） |
|---|---|---|
| 案件模板选择缺 UI（`getCaseTemplates`） | ✅ 已接入 | `lawclick-next/src/components/cases/CreateCaseWizard.tsx` |
| 案件删除按钮禁用（`deleteCase`） | ✅ 已接入 | `lawclick-next/src/components/cases/CaseSettingsTab.tsx` |
| AI 对话删除缺 UI（`deleteConversation`） | ✅ 已接入 | `lawclick-next/src/components/floating/ai-assistant-content.tsx` |
| 审批详情缺 UI（`getApprovalById`） | ✅ 已接入 | `lawclick-next/src/app/(dashboard)/admin/approvals/[id]/page.tsx` |
| 日程编辑/删除缺 UI（`updateEvent`/`deleteEvent`） | ✅ 已接入 | `lawclick-next/src/components/calendar/EventDetailDialog.tsx` |
| 当事人详情缺 UI（`getPartyById`） | ✅ 已接入 | `lawclick-next/src/app/(dashboard)/cases/parties/[id]/page.tsx` |
| 用户详情缺 UI（`getUserDetail`） | ✅ 已接入 | `lawclick-next/src/app/(dashboard)/team/[id]/page.tsx` |
| CRM 客户删除缺后端（`deleteCustomer`） | ✅ 已实现并接入 | `lawclick-next/src/actions/customer-actions.ts` + `lawclick-next/src/components/crm/CustomerDeleteButton.tsx` |
| 案件工时独立 UI（`getCaseTimeLogs*`/`getCaseTimeSummary`） | ✅ 已接入 | `lawclick-next/src/components/cases/CaseTimeLogsTab.tsx` |
| 合同关联文档 UI（`linkContractDocument`） | ✅ 已接入且乐高化 | `lawclick-next/src/components/finance/ContractDetailClient.tsx` |

## 四、全站“乐高化”复核（当前实现）

- 页面级：`lawclick-next/src/app/(dashboard)/layout.tsx` 使用 `PageWorkspace`，将“页面内容”作为可拖拽/可缩放的 pinned widget，并允许叠加其他 widgets（跨设备记忆/可重置）。
- 区块级：大量核心工作界面（案件/文档/CRM/调度/聊天/财务等）已采用 `SectionWorkspace` 将内部模块拆为 blocks（可拖拽/可缩放/可保存/可恢复）。
- 本轮补齐：合同详情页内部 Blocks 真正落地（避免“写了但没用”的伪乐高化）。

## 五、30-300 人规模调度支持（代码层面证据）

- 调度中心泳道使用虚拟列表：`lawclick-next/src/components/dispatch/DispatchScheduleBoardClient.tsx`（`useVirtualizer` + `slice(0, 300)` 上限策略）
- 日程创建参与人上限与推荐逻辑：`lawclick-next/src/components/calendar/CanvasCalendar.tsx`（对参与人数做 300 上限校验，并提示用户）

