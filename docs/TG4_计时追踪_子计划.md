# TG4 计时追踪（Time Tracking）子计划（Phase1-4）

> 约束：遵循 `prompt/1211架构设计.md`、`.agent/rules/lawclick.md`  
> 主开发目录：`lawclick-next/`  
> 目标导向：以“主模块（案件/任务）→业务流（计时）”为核心，其余模块辅助；禁止假数据/空壳。

## 0. 背景与现状问题（必须先修）

当前仓库在“计时”相关存在多套实现与口径不一致，导致业务无法形成真实闭环：

1. **页面层存在可访问的 mock**
   - `src/app/(dashboard)/time/page.tsx`：整页使用 `MOCK_TIME_ENTRIES` 和本地计时状态（假数据）。
   - `src/components/features/timesheet/timesheet-calendar.tsx`：使用 `TIME_ENTRIES` mock。
2. **数据口径不一致**
   - Prisma `TimeLog.duration` 注释明确为 **秒**（seconds）。
   - 旧实现 `src/actions/timelogs.ts` + `TimeLogClient` 以“分钟”输入/计算并直接写入 DB，造成历史数据潜在污染与 UI 统计错误。
3. **计时状态机实现存在漏洞**
   - `stopTimer` 未累加 `PAUSED->RUNNING` 期间已累计的 `duration`，会覆盖导致丢时长。
   - `startTimer` 仅阻止 `RUNNING`，未阻止 `PAUSED`，可能产生**多个 active timer**（RUNNING/PAUSED 并存）。
4. **全局浮窗计时器不是真实数据源**
   - `src/components/floating/timer-content.tsx` + `src/store/timer-store.ts` 仅本地 Zustand 计时，不落库、不与任务/案件联动。

## 1. TG4 目标与验收

### 1.1 目标（来自总计划 TG4）
- 工时记录必须可 **回溯到案件/任务**（至少之一；任务优先，任务可反查案件）。
- 计时必须形成 **真实闭环**：开始/暂停/继续/停止 + 手动补录 + 列表/统计展示。
- `/time` 与 `/timelog` 页面 **不允许**出现假数据；至少一个成为主入口，另一个不 404 且复用同一真实数据源。
- 权限体系落地：个人只能操作自己的记录；审批/计费状态操作需要 `timelog:approve`（或更高权限）。

### 1.2 验收（可执行清单）
1. 从任务卡（看板）点击“计时”：
   - 成功创建 RUNNING 的 TimeLog（DB 可见，且 taskId/caseId 正确）。
   - 自动打开浮窗计时器，显示真实计时（刷新后仍可继续）。
2. 在浮窗中暂停/继续/停止：
   - DB 中 status 正确流转：RUNNING ↔ PAUSED → COMPLETED。
   - 最终 duration 为**秒**且正确累计（包含多次 pause/resume）。
3. 在 `/time`（或 `/timelog`）可看到：
   - 今日/本周统计正确（秒→小时展示一致）。
   - 列表可按日期分组、显示关联案件/任务。
4. 案件详情页“工时”Tab：
   - 显示该案件的工时记录，duration 展示正确（非“分钟口径”）。
5. 权限：
   - 普通用户无法审批他人 TimeLog。
   - 具备 `timelog:approve` 的角色可审批/撤销审批。

## 2. 领域模型与状态机（DID：先定义再实现）

### 2.1 数据模型（当前 Prisma）
- `TimeLog`
  - `duration: Int`（**秒**）
  - `startTime/endTime: DateTime`
  - `status: TimeLogStatus`：`RUNNING | PAUSED | COMPLETED | APPROVED | BILLED`
  - `userId`（归属人）
  - `caseId?`（可选）
  - `taskId?`（可选；若有 taskId，则可反查 caseId）
  - `isBillable`（可计费）
  - `billingRate/billingAmount`（快照，后续账务用）

### 2.2 状态机（允许迁移）
- `IDLE -> RUNNING`：`startTimer`
- `RUNNING -> PAUSED`：`pauseTimer`（将本段 elapsed 累加进 duration）
- `PAUSED -> RUNNING`：`resumeTimer`（重置 startTime 为 now）
- `RUNNING -> COMPLETED`：`stopTimer`（duration = 已累计 duration + 本段 elapsed；写 endTime）
- `PAUSED -> COMPLETED`：`stopTimer`（duration 保持不变；写 endTime）
- `COMPLETED -> APPROVED`：`approveTimeLog`（需 `timelog:approve`）
- `APPROVED -> COMPLETED`：`unapproveTimeLog`（需 `timelog:approve`）
- `APPROVED -> BILLED`：`markTimeLogBilled`（可沿用 `timelog:approve` 或后续升级到 `billing:approve`）
- `BILLED -> APPROVED`：`unmarkTimeLogBilled`（同上）

### 2.3 关键约束
- **同一用户同时最多 1 条 Active Timer**：`status in (RUNNING, PAUSED)`。
- `duration` 永远以秒为唯一口径；UI 展示可换算成小时/分钟，但不改变存储。
- `APPROVED/BILLED` 后禁止编辑 duration/时间段（防止账务漂移）。

## 3. 技术对齐（参照 Cal.com 的可借鉴点）

> 参照 `calcom/cal.com`（deepwiki）：
> - DB 侧统一存 UTC 时间；前端按用户时区显示（`dayjs`/`Intl.DateTimeFormat`）。
> - 复杂调度用 reserved slots 防竞态（TG7 再做）；TG4 只需要“单 active timer”约束即可。

TG4 的落地策略：
- DB（Prisma/Postgres）继续存 UTC（DateTime 默认）。
- UI 展示使用 `Intl.DateTimeFormat('zh-CN')`，避免额外引入时区库（后续 TG7 如需再引入）。

## 4. 后端实现计划（Server Actions）

以 `src/actions/timelogs-crud.ts` 作为 **唯一真源**（旧 `src/actions/timelogs.ts` 退役或变薄封装）。

### 4.1 必修修复
- `startTimer`：
  - 由仅检查 `RUNNING` 改为检查 `status in ['RUNNING','PAUSED']`，禁止并发 active timer。
- `stopTimer`：
  - 支持 `RUNNING` 与 `PAUSED` 两种结束。
  - 若 RUNNING：`duration = timeLog.duration + elapsedSeconds`（修复丢失累计问题）。
  - 结束时写入 `billingRate/billingAmount`（若 `isBillable=true`）。

### 4.2 新增/完善接口（用于页面闭环）
- 查询
  - `getMyTimeLogs({ from, to, status?, caseId?, taskId? })`
  - `getTimeSummary({ from, to, scope: 'today'|'week'|'month' })`
- 编辑/删除
  - `updateTimeLog({ id, description?, startTime?, endTime?, isBillable? })`（仅 COMPLETED 且未 APPROVED/BILLED）
  - `deleteTimeLog(id)`（同上）
- 审批/计费
  - `approveTimeLog(id)` / `unapproveTimeLog(id)`
  - `markTimeLogBilled(id)` / `unmarkTimeLogBilled(id)`

## 5. 前端实现计划（页面/组件/联动）

### 5.1 浮窗计时器（MDI 关键组件）
- 文件：`src/components/floating/timer-content.tsx`
- 改造目标：从“本地 Zustand 计时器”升级为“后端 active timer 视图”：
  - mount 时调用 `getActiveTimer()` 同步状态
  - Play/Pause/Stop 分别调用 `startTimer/pauseTimer/resumeTimer/stopTimer`
  - 快速备注直接更新到 active timelog（新增 `updateTimeLogDescription` 或复用 `updateTimeLog` 的受限字段）
  - 任意页面 startTimer 成功后自动 `openWindow('timer','TIMER',...)`

### 5.2 `/time` 与 `/timelog` 页面
- `/time`：作为“工时追踪主仪表盘”（替换掉 mock）
  - Active Timer（可直接控制）
  - 今日/本周/本月统计
  - Tabs：记录列表 / 待审批 / 待计费 / 按案件汇总（最小版本先做列表+待审批）
  - 手动补录弹窗（调用 `addManualTimeLog`）
- `/timelog`：复用 `/time` 的同一组件或重定向到 `/time`（但必须真实可用）
- 同步权限：`/time` 加入 `PAGE_ACCESS_CONFIG`，与 `/timelog` 同角色集

### 5.3 业务联动点（必须真实）
- 任务看板/任务详情：
  - `TaskKanban`、`TaskDetailDialog`：startTimer 成功后打开浮窗计时器
- 案件详情：
  - `CaseDetailClient` 工时 Tab：修复 duration 展示（秒→hh:mm）
  - “记工时”按钮：打开手动补录（带 caseId 默认值）
- 团队看板（如涉及计时自动化）：
  - `CaseKanban` 当前存在“拖到 ACTIVE 自动本地 startTimer + 未同步后端”的假逻辑：应移除或改为真实调用 `startTimer`

### 5.4 Timesheet 组件去 mock
- `src/components/features/timesheet/timesheet-calendar.tsx`：
  - 移除 `TIME_ENTRIES`，改为接收 props（周范围 logs）或内部调用 `getMyTimeLogs`。
  - 时间块按 `startTime/endTime` 映射到栅格；默认展示工作日 8-18。

## 6. 实施步骤（与本次开发顺序一致）

1. 写本子计划文档（本文件），并在 `docs/1211_架构落地开发总计划_v1.md` 标记 TG4 in-progress。
2. 后端：
   - 修复 `startTimer/stopTimer` 状态机漏洞
   - 增补查询/编辑/审批 actions（`timelogs-crud.ts`）
   - 旧 `timelogs.ts` 退役或仅做薄封装转发
3. 浮窗计时器真源化（替换 `timer-store` 依赖）
4. 页面：
   - `/time` 替换 mock → 真数据
   - `/timelog` 复用或重定向
5. 联动修复：
   - Task/Case 页面入口与展示口径统一
   - `collaboration-actions` 今日工时口径统一（秒→小时）
6. 验证：
   - `pnpm -C lawclick-next build`
   - 关键路径冒烟：任务开计时→浮窗→暂停/继续/停止→列表/案件详情可见

## 7. 风险与回滚策略

### 7.1 历史数据污染（分钟写入秒字段）
- 风险：旧 `/timelog` 页面曾以“分钟”写入 `duration`，导致历史记录在新口径下变短。
- 策略：
  - TG4 先保证未来不再产生污染数据；
  - 如发现确有污染，补充一次性修复脚本（仅对“明显异常”记录进行转换），并记录在 `docs/0_archive_context.md`。

### 7.2 并发与多端
- 采用 DB 侧“单 active timer”约束（逻辑检查 + 事务）降低并发风险；更强竞态控制留到 TG7（日程 reserved slots 思路）。

## 8. 关联文件（实施时重点改动范围）
- 后端：`lawclick-next/src/actions/timelogs-crud.ts`、`lawclick-next/src/actions/timelogs.ts`（退役/封装）
- 浮窗：`lawclick-next/src/components/floating/timer-content.tsx`、`lawclick-next/src/store/timer-store.ts`
- 页面：`lawclick-next/src/app/(dashboard)/time/page.tsx`、`lawclick-next/src/app/(dashboard)/timelog/page.tsx`
- UI：`lawclick-next/src/components/timelog/TimeLogClient.tsx`、`lawclick-next/src/components/features/timesheet/timesheet-calendar.tsx`
- 联动：`lawclick-next/src/components/tasks/TaskKanban.tsx`、`lawclick-next/src/components/tasks/TaskDetailDialog.tsx`、`lawclick-next/src/components/cases/CaseDetailClient.tsx`
- 权限：`lawclick-next/src/lib/permissions.ts`

