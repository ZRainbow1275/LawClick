# A线（全站乐高化/可拖拽布局）闭环进展（2026-01-01）

## 目标
- 任意页面/任意卡片栏/分区：支持拖拽、缩放、跨设备记忆、可恢复默认布局（不只仪表盘/看板）。
- 多层级乐高化：页面级 `PageWorkspace` + 分区级 `SectionWorkspace/LegoDeck` 可组合，且嵌套不互抢拖拽手柄。
- 以可审计方式推进：用 TSX AST 静态扫描定位残余固定布局并清零。

## 关键改动
### 1) 嵌套拖拽手柄冲突修复
- `lawclick-next/src/components/layout/section-workspace.tsx`
- 每个 `SectionWorkspace` 基于 `workspaceKey` 生成唯一 draggableHandle class，避免 `PageWorkspace`/`SectionWorkspace` 嵌套时拖拽错层。

### 2) 核心页面/卡片栏“乐高化”落地
- `lawclick-next/src/components/cases/CaseDetailClient.tsx`：案件详情主布局改为 `SectionWorkspace`（主面板+侧边栏可 DIY）。
- `lawclick-next/src/components/timelog/TimeLogClient.tsx`：工时概览卡片栏改为 `LegoDeck`（可 DIY）。
- `lawclick-next/src/components/cases/CaseIntakeDetailPanel.tsx`：立案详情面板（含团队成员卡片栏）改为单一 `LegoDeck`（4 blocks）。
- `lawclick-next/src/components/admin/QueueOpsClient.tsx`：队列运维页“筛选+任务列表”改为 `LegoDeck` blocks。

### 3) 覆盖审计脚本升级（避免“主观宣称已完成”）
- `lawclick-next/scripts/lego-coverage-audit.js`：扫描 `grid-cols*`/`flex+gap*` 固定卡片网格。
- `lawclick-next/scripts/lego-freeform-coverage-audit.js`：扫描 `space-y/divide-y/flex-col` 等固定堆叠卡片栏。
- 两者均基于 TSX AST 扫描，排除 `SectionWorkspace/LegoDeck/PageWorkspace` 子树，降低误报。

## 可重复验证（当前状态）
在 `lawclick-next/` 运行：
- `pnpm audit:lego-coverage -- --include-workspace`
  - 产物：`docs/_artifacts/lego_coverage_audit_2026-01-01.md`
  - 结果：`candidate grids: 0`
- `pnpm audit:lego-freeform-coverage -- --include-workspace`
  - 产物：`docs/_artifacts/lego_freeform_coverage_audit_2026-01-01.md`
  - 结果：`candidates: 0`
- 门禁：`pnpm type-check` / `pnpm lint` / `pnpm build`：通过

## 可选增强（不阻塞 A 线闭环）
- 将“非 Card 形态”但具模块属性的区域纳入 catalog（快捷入口/统计条/信息块），进一步把“任何地方都能 DIY”的语义从 `<Card>` 推进到“任意模块”。
- 推进分屏/磁吸/浮窗一致交互：让模块可一键“弹出为浮窗”/“停靠为模块”，与 `FloatingLauncher` 的注册体系对齐。
