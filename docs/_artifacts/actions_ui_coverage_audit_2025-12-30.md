# Actions ↔ UI 覆盖审计补充（2025-12-30）

> 目的：基于当前代码状态重跑 `actions-ui-coverage-audit`，找出“Server Actions 导出但前端未引用”的真实缺口；优先补齐用户可见入口（页面/弹窗/Widgets/Blocks），其次才收敛不必要的导出面，降低潜在不一致风险。

## 2025-12-31 纠偏（重要）

- 禁止“删导出隐藏问题”：审计清零必须靠补齐真实入口；仅当确认属于内部 helper 且不应暴露为 Server Action 时才去掉 `export`。
- 审计脚本升级为 TypeScript AST 分析（真实 import/引用），避免“字符串匹配误判为已引用/未引用”。

## 最新复跑摘要（2025-12-31）

- `pnpm audit:actions-ui`
  - actions exports: 228
  - unreferenced exports (UI imports): 0
- `pnpm audit:routes`：OK（未发现断链路由引用）
- `pnpm audit:tenant-scope`：OK（tenant-scope-guard targets 已生成）

## 全站“乐高化”闭环（与本审计直接相关）

`PageWorkspace` + `SectionWorkspace` 让“补齐 UI 入口”可以以 Widgets/Blocks 的方式落地（可拖拽/可记忆/可恢复），而不是堆固定页面。

- 全局 PageWorkspace（任意工作页面）：`lawclick-next/src/app/(dashboard)/layout.tsx`
- 页面内部 Blocks：`lawclick-next/src/components/layout/section-workspace.tsx`
- PageWorkspace Widget 目录（可跨页面拖拽/保存/恢复）已包含（节选）：
  - `w_workspace_notes`：工作台便签（按页面/实体记忆，`UserSetting` 落库）
  - `w_today_time_summary`：今日工时
  - `w_my_tasks`：我的待办
  - `w_upcoming_events`：近期日程
  - `w_notifications`：通知
  - `w_pending_approvals`：待我审批
  - 以及：Timer、我的状态、客户/项目目录、任务快速视图、补录工时、案件工时记录、最近文档、工作区概览、团队动态等

## 下一批建议（按优先级）

### P1（继续扩展“全站乐高化”）

- 把调度中心的高频块（热力图/任务池/案件池）做成可跨页面添加的 Workspace Widgets。
- 继续把核心工作界面的固定分栏/卡片栏拆成 `SectionWorkspace` blocks（避免“固定布局不可 DIY”）。

### P2（安全与一致性）

- 持续为高频/高成本入口补齐 Rate Limiting（dashboard widgets / notifications / approvals / workspace notes 等）。
- 推进 actions 返回口径统一（discriminated union / ActionResult），减少 throw/return 混用导致的边界不一致。

---

## 2026-01-01 复核补充（纠偏：避免“写了但没用”的伪乐高化）

- 修复 `success` 非判别联合导致的 `never`（阻塞 `pnpm type-check`）：`getMyInvites` / `getMyApprovals` 已统一为 `success: true as const / false as const`。
- 补齐“乐高化真实性”：合同详情页从“固定布局 + 未启用 blocks”重构为 `SectionWorkspace` blocks（可拖拽/可缩放/可记忆/可恢复）。
- 复跑门禁与审计脚本：`pnpm audit:actions-ui` / `pnpm audit:routes` / `pnpm audit:tenant-scope` / `pnpm type-check` / `pnpm lint` / `pnpm build` 均通过。
- 详细回归证据与专项审查对照表见：`docs/_artifacts/audit_followup_2026-01-01.md`。

