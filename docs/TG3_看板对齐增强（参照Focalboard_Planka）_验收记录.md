# TG3 看板对齐增强（参照 Focalboard / Planka）验收记录

> 主工程：`lawclick-next/`  
> 约束：遵循 `.agent/rules/lawclick.md` 与 `AGENTS.md`（严禁 mock/空壳；输入必须 Zod 校验；极致 DRY）  
> 日期：2025-12-19

## 1. 交付物清单
- 子计划：`docs/TG3_看板对齐增强（参照Focalboard_Planka）_子计划.md`
- 排序算法单一真源：`lawclick-next/src/lib/task-ordering.ts`
- 后端移动接口：`lawclick-next/src/actions/tasks-crud.ts`（`moveTaskOnKanban`）
- 前端乐观排序：`lawclick-next/src/components/tasks/TaskKanban.tsx`（使用 `computeOptimisticOrder`）

## 2. 构建与门禁证据
- 构建：`pnpm -C lawclick-next build`（证据：`docs/_artifacts/tg12_remediation_2025-12-19/pnpm_build_after_register_action_dedup.txt`）
- E2E：`pnpm -C lawclick-next test`（证据：`docs/_artifacts/tg12_remediation_2025-12-19/pnpm_test_after_register_action_dedup_fix_mainline_exact.txt`）

## 3. 验收点（可执行清单）
1) 排序机制对齐 Planka（gap order）
- 结果：`Task.order` 使用 gap 策略；拖拽默认只更新“被移动任务”，必要时对目标列局部 reindex。

2) 交互对齐（Add card + Card modal）
- 结果：案件看板支持列内快速新建；任务卡片支持详情弹窗编辑并真实落库。

3) 失败回滚 + 撤销
- 结果：拖拽失败自动回滚；拖拽成功提供“撤销”入口（toast action），可回滚到拖拽前快照。

