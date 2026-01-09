# TG3 任务协作 + Trello式看板 验收记录

> 主工程：`lawclick-next/`  
> 约束：遵循 `.agent/rules/lawclick.md` 与 `AGENTS.md`（严禁 mock/空壳；输入必须 Zod 校验；dev=prod 1:1；端到端闭环）  
> 日期：2025-12-19

## 1. 交付物清单
- 子计划：`docs/TG3_任务协作与Trello看板_子计划.md`
- 核心后端真源：`lawclick-next/src/actions/tasks-crud.ts`
- 看板 UI 组件：`lawclick-next/src/components/tasks/TaskKanban.tsx`
- 任务详情弹窗：`lawclick-next/src/components/tasks/TaskDetailDialog.tsx`

## 2. 构建与门禁证据
- 构建：`pnpm -C lawclick-next build`（证据：`docs/_artifacts/tg12_remediation_2025-12-19/pnpm_build_after_register_action_dedup.txt`）
- E2E：`pnpm -C lawclick-next test`（证据：`docs/_artifacts/tg12_remediation_2025-12-19/pnpm_test_after_register_action_dedup_fix_mainline_exact.txt`）

## 3. 验收点（可执行清单）
1) 案件内任务看板 Trello 化
- 入口：`/cases/[id]?tab=tasks`
- 结果：支持列内排序与跨列移动；刷新后顺序/状态保持（落库为真源）。

2) 全局任务中心真实化
- 入口：`/tasks`
- 结果：展示真实 DB 任务；支持看板视图；拖拽后与案件内看板一致（同一套后端真源）。

3) 泳道/阶段最小闭环
- 结果：`Task.stage` / `Task.swimlane` 可参与分组/排序；服务端按 `(caseId,status,swimlane)` 作为排序域。

4) 与计时/通知最小联动
- 结果：任务分配写入通知；从通知跳转可定位到对应案件任务 Tab；任务“计时”可创建真实工时记录并可回读。

## 4. 手工验收步骤（建议你本机浏览器执行）
1. 登录后进入任一案件 → 任务 Tab：新建任务并拖拽排序/跨列移动
2. 刷新页面：确认顺序/状态保持
3. 打开 `/tasks`：确认同一批任务可见，拖拽后刷新一致
4. 进入通知中心：点击任务通知，确认跳转到 `/cases/:id?tab=tasks`

