# TG7 日程安排 & 调度中心（验收记录）

> 主工程：`lawclick-next/`  
> 约束：遵循 `prompt/1211架构设计.md`、`.agent/rules/lawclick.md`（无 mock/空壳、权限后端校验、与案件/任务联动）  
> 目标：让“日程（Event）”成为可协作对象，支撑个人日历 + 团队调度，并与案件/任务/计时形成真实闭环

## 1. 本次交付清单（已完成）
### 1.1 数据层（Prisma）
- `Event` 扩展：`visibility/status/taskId`，并增加 `participants` 关系。
- 新增：`EventParticipant`（邀请/接受/拒绝）、`Schedule/AvailabilityRule/OutOfOffice`（可用性模型，MVP 用于 slots 计算）。
- Migration：新增 `lawclick-next/prisma/migrations/20251214021520_tg7_calendar_dispatch/migration.sql`

### 1.2 后端（Server Actions）
- 事件范围查询（单一真源）：`getEventOccurrencesInRange`（支持 userIds + range；非授权自动 Busy-only 脱敏）。
- 事件创建/更新/取消：
  - `createEvent`：支持 `participantIds/visibility/taskId`，创建 `EventParticipant`，并生成 `CollaborationInvite(type=MEETING)`。
  - `cancelEvent`：软取消（`Event.status=CANCELLED`）。
- 可用时间推荐（MVP）：`getAvailableSlots`（工作时段交集 - 忙碌事件/外出差集）。
- 邀请联动：
  - `respondToInvite` 支持 `MEETING`：同步更新 `EventParticipant`（ACCEPTED/DECLINED）。
  - `getMyInvites` enrich：为 CASE/TASK/MEETING 附带 target 简要信息（title/time 等）。
- 团队成员目录：`getTeamDirectory`（用于 30-300 人规模的搜索/选择）。

### 1.3 前端（真实联动，无 mock）
- `/calendar`：
  - 周/日/月/列表视图；导航切换会按范围实时拉取数据（非静态一次性 props）。
  - 新建日程支持：可见性、参与人（多选/搜索）、推荐可用时间（slots）。
  - 点击事件打开详情弹窗：可取消（仅创建者）、可从日程创建任务（需关联案件）。
- `/dispatch`：
  - `TeamHeatmap` 已移除内置 mock，使用 `getTeamStatus()` 真数据（今日/本周工时、活跃案件、今日完成）。
  - 新增“团队日程泳道（Day View）”：选择成员（最多 20，搜索，适配 30-300 人目录）+ 事件块展示 + 事件详情弹窗。
  - 待处理邀请：可接受/拒绝，落库并刷新（MEETING 会同步 EventParticipant）。

### 1.4 与主业务流联动（至少两条闭环）
- 任务 → 日程：任务卡/任务详情“创建日程”会带 `taskId`，并默认落为 `CASE_TEAM` 可见。
- 任务 → 计时：既有“开始计时”入口保持可用；计时器状态会通过 `useUserStatusStore` 同步到 DB，调度中心可见。
- 日程 → 任务：日程详情弹窗提供“从日程创建任务”（已落库）。

## 2. 构建与验证
- 构建通过：`cd lawclick-next && pnpm build` ✅

## 3. 手工验收脚本（建议按此走一遍）
1. 启动数据库（Postgres）：确保 `lawclick-next/.env` 的 `DATABASE_URL` 可连通。
2. 应用迁移：`cd lawclick-next && pnpm exec prisma migrate deploy`
3. 启动应用：`cd lawclick-next && pnpm dev`
4. /calendar：
   - 新建日程（选择 1-3 个参与人、TEAM_PUBLIC 可见）→ 保存 → 刷新仍存在
   - 点击“推荐可用时间”能自动填充下一可用时间段
   - 点击事件 → 详情弹窗 →（创建者）取消日程后列表消失
5. /dispatch：
   - TeamHeatmap 展示真实成员数据（无 mock）
   - 选择成员（5-10 人）→ 泳道出现对应事件块
   - 若有 MEETING 邀请：接受/拒绝 → 参与状态同步并刷新

## 4. 已知限制（不阻塞本 TG 交付）
- 外部日历（Google/Outlook/ICS）、复杂重复事件（RRULE）、并发预留（SelectedSlots）未纳入本 TG。
- 时区策略当前为 MVP：已采用 UTC 存储、客户端本地展示；更精细的“组织/个人时区”在后续增强。
