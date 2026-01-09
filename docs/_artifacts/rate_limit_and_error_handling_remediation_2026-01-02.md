# B 线治理回填：系统限流 + 错误处理一致性（2026-01-02）

> 目的：对照 `docs/批判性项目审计报告_2025-12-29.md` 中的「缺少 API Rate Limiting / 错误处理模式不一致 / console.error 生产使用」等风险项，补齐 **可复用、可扩展、可审计** 的治理能力，并在核心业务链路上落地（不靠“删导出/隐藏问题”）。

## 1) 系统限流（Server Actions）

### 1.1 统一限流入口
- `lawclick-next/src/lib/action-rate-limit.ts`
  - `enforceActionRateLimit({ tenantId, userId, action, limit, windowMs, extraKey? })`
  - 以「tenant + user + action」为基础维度（可选 extraKey），落库计数（`ApiRateLimit` 表）并返回用户可读错误信息。

### 1.2 核心模块落地（本轮新增/补齐）

- 案件核心 CRUD：`lawclick-next/src/actions/cases-crud.ts`
  - `cases.create`（20/min）
  - `cases.update`（60/min）
  - `cases.assign`（60/min）
  - `cases.status.change`（90/min）
  - `cases.archive`（30/min）
  - `cases.delete`（10/min）
  - 以及列表/选择器相关：`cases.templates.list` / `cases.clients.select` / `cases.lawyers.select`（120/min）

- 任务协作（含看板读写）：`lawclick-next/src/actions/tasks-crud.ts`
  - `tasks.create`（60/min）
  - `tasks.update`（240/min）
  - `tasks.kanban.move`（600/min）
  - `tasks.delete`（60/min）
  - `tasks.reorder`（600/min）
  - 读接口：`tasks.user.list` / `tasks.kanban.counts` / `tasks.kanban.page` / `tasks.kanban.item` / `tasks.board.meta` / `tasks.board.list` / `tasks.list.page`（600/min）

- 文档中心（含 presigned 上传）：`lawclick-next/src/actions/documents.ts`
  - `documents.list` / `documents.get`（120/min）
  - `documents.update`（60/min）
  - `documents.delete`（20/min）
  - `documents.favorite.toggle` / `documents.tag.add` / `documents.tag.remove`（120/min）
  - `documents.generate`（20/min）
  - `documents.upload`（30/min）
  - `documents.upload.presign.init` / `documents.upload.presign.finalize`（60/min）

- 工时追踪（计时/列表/审批）：`lawclick-next/src/actions/timelogs-crud.ts`
  - 计时：`timelogs.timer.start`（30/min）/ `timelogs.timer.stop`（60/min）/ `timelogs.timer.pause`（120/min）/ `timelogs.timer.resume`（120/min）/ `timelogs.timer.active`（600/min）
  - 个人：`timelogs.my.meta` / `timelogs.my.list` / `timelogs.my.summary`（600/min）
  - 案件：`timelogs.case.summary` / `timelogs.case.logs.page`（600/min）
  - 编辑：`timelogs.update`（120/min）/ `timelogs.delete`（60/min）
  - 审批：`timelogs.approval.list` / `timelogs.approval.approve` / `timelogs.approval.unapprove` / `timelogs.approval.markBilled` / `timelogs.approval.unmarkBilled`（120~600/min）

## 2) 系统限流（API Routes）

- `lawclick-next/src/app/api/documents/[id]/file/route.ts`：文档下载/预览（120/min）
- `lawclick-next/src/app/api/realtime/signals/route.ts`：SSE 拉取（30/min）
- `lawclick-next/src/app/api/queue/process/route.ts`：队列处理入口（secret 60/min，admin 20/min，按 IP）

## 3) 错误处理一致性（避免泄漏底层错误）

### 3.1 引入显式“可对用户展示”的错误类型
- `lawclick-next/src/lib/action-errors.ts`
  - `UserFacingError`
  - `getPublicActionErrorMessage(error, fallback)`

### 3.2 在案件 CRUD 中落地（本轮）
- `lawclick-next/src/actions/cases-crud.ts`
  - 事务内用于回滚的用户可读错误统一改为 `throw new UserFacingError(...)`
  - `catch` 返回统一使用 `getPublicActionErrorMessage(...)`，避免直接把未知 `error.message` 回传到 UI（防止 Prisma/内部堆栈信息泄漏）。

## 4) 类型门禁：ActionResponse 默认泛型修复

- `lawclick-next/src/lib/action-response.ts`
  - 将默认空对象类型从 `Record<string, never>` 改为 `Record<never, never>`，修复 `ActionResponse` 在 `success/error` 字段上的交叉类型冲突（阻塞 `pnpm type-check` / `pnpm build` 的 TS2322）。

## 5) 回归与证据（本轮复跑）

在 `lawclick-next/` 目录执行并通过：
- `pnpm type-check`
- `pnpm lint`
- `pnpm build`
- `pnpm audit:actions-ui-invocations` → `docs/_artifacts/actions_ui_invocation_audit_2026-01-02.md`
- `pnpm audit:action-result-shape` → `docs/_artifacts/action_result_shape_audit_2026-01-02.md`
- `pnpm audit:ui-disabled-buttons` → `docs/_artifacts/ui_disabled_buttons_audit_2026-01-02.md`
- `pnpm audit:api-surface` / `pnpm audit:orm-entity-sync` / `pnpm audit:tenant-scope` / `pnpm audit:permissions-sync`

