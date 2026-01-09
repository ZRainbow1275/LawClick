# B线剩余缺口分析（2026-01-02）

> 目的：在关键门禁（Actions↔UI、路由、权限、tenant-scope、ORM、乐高化）全部通过的前提下，继续找出仍未达“生产一致性/稳健性/可扩展性”的剩余缺口，并给出下一步修复方案。

## 1) 已验证通过的门禁（最新证据）

- 全站乐高化 DIY 覆盖（Dashboard）：`docs/_artifacts/lego_diy_coverage_audit_2026-01-02.md`
  - unknown: 0（redirect-only 已显式标注）
- 固定卡片栏/分栏“非乐高”候选：`docs/_artifacts/lego_coverage_audit_2026-01-02.md` / `docs/_artifacts/lego_freeform_coverage_audit_2026-01-02.md`
  - candidates: 0
- Actions↔UI **真实调用**覆盖：`docs/_artifacts/actions_ui_invocation_audit_2026-01-02.md`
  - UI-invoked: 230 / no-UI: 0
- Actions 返回形状（判别联合一致性）：`docs/_artifacts/action_result_shape_audit_2026-01-02.md`
  - offenders: 0
- 禁用按钮/占位按钮审计：`docs/_artifacts/ui_disabled_buttons_audit_2026-01-02.md`
  - candidates: 0
- API Surface（Next vs Rust 原型重叠）：`docs/_artifacts/api_surface_audit_2026-01-02.md`
  - conflicts: 0
- ORM Entity 同步（Prisma vs Rust 原型）：`docs/_artifacts/orm_entity_sync_audit_2026-01-02.md`
- 路由断链：`pnpm -C lawclick-next audit:routes`（本轮 OK，控制台输出无断链）

## 2) 仍存在的“生产一致性/稳健性”缺口（待修复）

### 2.1 核心 CRUD Actions 缺少系统性 Rate Limiting（高优先级）

现状：项目已存在 `checkRateLimit` 基础设施，并在 auth/AI/通知/搜索/部分高频 widgets 与 API routes 上落地；但核心 CRUD 大文件中尚未系统覆盖：

- `lawclick-next/src/actions/cases-crud.ts`（未命中 `checkRateLimit`）
- `lawclick-next/src/actions/tasks-crud.ts`（未命中 `checkRateLimit`）
- `lawclick-next/src/actions/documents.ts`（未命中 `checkRateLimit`）
- `lawclick-next/src/actions/timelogs-crud.ts`（未命中 `checkRateLimit`）

风险：在 30-300 人协作场景下，高频列表/搜索/拖拽/保存可能造成 DB 压力与潜在滥用面，且与已落地的“限流一致性”不匹配。

修复方向（下一步）：抽象统一的 `enforceRateLimitOrFail(...)` 辅助方法（tenantId+userId+action+scope 维度），并对核心读写入口按业务类型配置更合理的限额（例如 list/read 60-120/min，写入 30/min，批量/导出更低）。

### 2.2 ESLint 规则豁免残留（中优先级）

仍存在 `react-hooks/exhaustive-deps` 的禁用：

- `lawclick-next/src/components/layout/use-rgl-auto-resize.ts`
- `lawclick-next/src/components/tasks/QuickCreateTaskDialog.tsx`

风险：Hook 依赖不透明会放大状态同步/竞态问题的排查成本，且与“代码卫生一致性”目标冲突。

修复方向（下一步）：

- `useRglAutoResize` 改为接收单一 `dependencyKey`（避免动态依赖数组），在调用处显式传入 `sidebarState`，移除 eslint-disable。
- `QuickCreateTaskDialog` 使用 `setCaseId((prev) => prev || firstId)` 的函数式更新，避免闭包读取 `caseId` 导致的依赖缺失，移除 eslint-disable。

