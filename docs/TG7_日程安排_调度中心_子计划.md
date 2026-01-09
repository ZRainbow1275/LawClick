# TG7 日程安排 & 调度中心（参照 Cal.com / 飞书日历）子计划（Phase3-4）

> 约束：遵循 `prompt/1211架构设计.md`、`.agent/rules/lawclick.md`（无 mock/空壳、MDI 强制、LEGO 组件化、配置/布局尽量可持久化、权限必须在后端）  
> 主工程：`lawclick-next/`  
> 核心原则：以主模块（案件/任务）为核心，以业务流（任务→日程→计时→复盘）为主线，其余模块为辅助

## 0. 背景与现状问题（必须先修）
当前日程/调度模块与 1211 架构要求存在结构性缺口：
1. **事件模型过弱**：`Event` 只有 `creatorId`，缺少“参与人/邀请/可见性/状态/与任务联动”等字段，无法支撑“全所调度”。
2. **权限边界不清**：现有 `getEvents`（两套 actions）存在“按 userId 入参但未过滤/或仅按 creatorId 过滤”的不一致问题，且缺少“他人日程脱敏（Busy-only）”策略。
3. **/dispatch 含 mock**：`TeamHeatmap` 内置演示数据，违反“无假数据”，且邀请“接受/拒绝”按钮未落库联动。
4. **规模与性能未设计**：1211 要求 30-300 人规模的日程/状态展示，目前没有分页/虚拟列表/按范围拉取策略。
5. **与主业务流联动不足**：日程应与 `Case/Task/TimeLog` 强绑定（从案件/任务发起日程、从日程一键开任务/计时），当前链路不完整。

## 1. 目标与验收（可执行清单）
### 1.1 目标（MVP 完整可用）
1. **统一事件真源**：整合日程 actions，提供单一“真”接口（range + userIds + caseId），并修复权限/过滤逻辑。
2. **事件=可协作对象**：支持事件参与人（邀请/接受/拒绝），并与现有 `CollaborationInvite(type=MEETING)` 打通（/dispatch 可处理）。
3. **可见性与脱敏**：实现“团队可见 Busy/可见详情”的后端策略：
   - `team:view`：可查看他人忙闲块（Busy-only）
   - `user:view_all`：可查看他人事件详情（受案件访问控制影响）
   - 关联案件事件：需 `case:view` + `requireCaseAccess` 才能展示案件详情信息
4. **日历视图升级（/calendar）**：提供个人日历（week/day/month/list）+ 快速新建/编辑/删除，并可按案件/类型/参与人过滤。
5. **调度中心升级（/dispatch）**：提供团队状态（真实数据）+ 团队排班泳道（选人+范围+虚拟列表/分页）+ 待分配池（案件/任务入口），形成“调度闭环”。
6. **联动入口**：从日程创建任务、从日程/任务一键开计时、从案件发起日程（至少落地 2 条链路）。
7. **工程质量**：`pnpm -C lawclick-next build` 通过；无 mock/硬编码业务数据。

### 1.2 验收脚本（你本机执行）
1. /calendar
   - 新建日程（选择参与人/可见性/关联案件或任务）→ 保存 → 刷新仍存在
   - 切换 week/day/month/list → 数据一致（同一事件同一时间）
   - 过滤：按案件/参与人过滤能缩小结果集
2. /dispatch
   - 团队状态卡片来自 DB（非 mock），在线/工时/当前任务可见
   - 选择 5-20 个成员 → 显示同一时间范围的泳道日程
   - 收到 MEETING 邀请：接受/拒绝后事件参与状态变化、邀请状态落库、列表刷新
3. 联动
   - 从任务详情创建日程/从日程创建任务（至少一条链路）能落库并互相跳转/展示
4. 质量
   - `pnpm -C lawclick-next build` 通过

## 2. 领域与数据设计（Design）
### 2.1 时间与时区策略（对齐 Cal.com 思路）
1. **UTC 存储**：`Event.startTime/endTime` 均作为 UTC DateTime 存储（DB 单一真源）。
2. **展示转换**：页面展示按“当前用户时区”转换（MVP 默认 `Asia/Shanghai`，后续可开放用户配置）。
3. **忙闲合成**：团队视角下，非授权查看者只能看到“忙碌块”（不暴露标题/案件等敏感信息）。

### 2.2 事件可见性与参与人
**事件必须回答两个问题**：
1. 谁参与（参与人列表 + 参与状态）
2. 谁能看（可见性 + 访问控制）

建议最小枚举：
- `EventVisibility`：`PRIVATE`（仅参与人）/ `TEAM_BUSY`（团队忙闲）/ `TEAM_PUBLIC`（团队可见详情）/ `CASE_TEAM`（案件成员可见详情）
- `EventStatus`：`SCHEDULED` / `CANCELLED`
- `EventParticipantStatus`：`INVITED` / `ACCEPTED` / `DECLINED`

### 2.3 用户可用性（Availability）MVP
参照 Cal.com 的 Schedule/Availability 思路，但先落地最小闭环：
1. `Schedule`：用户默认排班（时区、名称、是否默认）
2. `AvailabilityRule`：每周工作时段（按星期 + 起止分钟）
3. `OutOfOffice`：外出/不可用区间（DateTime 范围）

> MVP 不做外部日历集成，只用本系统 `Event` + `OutOfOffice` 计算忙闲。

## 3. 数据库变更（Design）
### 3.1 Prisma Schema（最小增量）
1. `Event`：
   - 新增：`visibility`、`status`、`taskId?`
   - 新增 relation：`participants`
2. 新增 `EventParticipant`
3. 新增 `Schedule` / `AvailabilityRule` / `OutOfOffice`（用于后续“可用时段计算/调度推荐”）
4. `CollaborationInvite`：
   - 保留现有结构，扩展业务：`type=MEETING` 时与 `EventParticipant` 状态同步

### 3.2 迁移策略
- 只做“新增字段/新增表”，避免破坏性变更；必要时为旧数据补默认值：
  - `Event.visibility` 默认 `TEAM_BUSY`
  - `Event.status` 默认 `SCHEDULED`
  - 旧事件默认参与人为 creator（写脚本或在查询层补齐）

## 4. 接口设计（Design）
### 4.1 Server Actions（单一真源）
1. `getCalendarBootstrap(range, filters)`：
   - 返回：当前用户信息、默认时区、团队成员（分页/搜索）、初始事件数据（按范围）
2. `getEventsInRange({ from, to, userIds?, caseId?, includeMasked? })`：
   - 后端按权限决定返回“详情事件”或“忙碌块”
3. `createEventV2({ title, startTime, endTime, type, visibility, participants, caseId?, taskId?, location?, description? })`
4. `updateEventV2(eventId, patch)`
5. `cancelEvent(eventId)` / `deleteEvent(eventId)`（MVP 二选一，优先 cancel）
6. `getAvailableSlots({ userIds, durationMinutes, from, to })`（MVP）：工作时段交集 - 忙碌事件差集

### 4.2 权限点（必须后端 enforce）
- `team:view`：基础访问（个人/团队忙闲）
- `user:view_all`：查看他人事件详情
- `case:view` + `requireCaseAccess`：查看关联案件信息

## 5. UI 设计（Design）
### 5.1 /calendar（个人日程工作台）
- 顶部：日期导航（上一周期/下一周期/今天）+ 视图切换（week/day/month/list）+ 新建日程
- 左侧过滤：案件/类型/参与人/仅看我的（默认）
- 主区：日历网格（week/day/month）或列表（list）
- 右侧详情：点击事件 → 详情抽屉（编辑/取消/关联案件/关联任务/一键建任务/一键开计时）

### 5.2 /dispatch（调度中心）
三块组合，强调“主模块+业务流”：
1. **团队状态（真实数据）**：替换 `TeamHeatmap` mock，展示在线/状态/当前任务/今日工时/活跃案件
2. **团队排班泳道（核心）**：
   - 选择成员（搜索+分页，默认最近活跃/同部门）
   - 选择范围（默认 7 天，支持 1 天/7 天）
   - 泳道展示事件（无权限时 Busy-only）
   - 性能：成员列表虚拟化；事件按 userIds + range 拉取
3. **待分配池**：
   - 复用现有案件池/任务池入口（CaseKanban/TaskKanban），并提供“指派/邀请/安排会议”动作

## 6. 实现步骤（Implement）
### 6.1 Phase A：Schema & 数据一致性
1. Prisma：补齐 `Event` 领域字段 + 新增参与人/可用性模型
2. Migration：生成并落库；如需要，补一段迁移后修复脚本（旧事件补参与人）

### 6.2 Phase B：Actions（后端先行）
1. 统一 `getEvents` 逻辑：按 range/userIds 返回；落实“脱敏/权限/案件访问控制”
2. 新建/更新/取消事件：支持 participants + 生成 MEETING 邀请（CollaborationInvite）
3. 邀请响应扩展：`respondToInvite` 支持 `MEETING`，同步 `EventParticipant`
4. 可用时段计算（MVP）：给定参与人+时长+范围，返回按天分组的 slots

### 6.3 Phase C：UI（LEGO 组件化）
1. 重构 `/calendar`：替换现有 `CanvasCalendar` 为“可过滤/可编辑/多视图”的客户端组件（无 mock）
2. 重构 `/dispatch`：
   - `TeamHeatmap` 接收 server 数据 props，移除内置 mock
   - 增加团队泳道组件（选人/范围/虚拟列表）
   - 邀请卡片的“接受/拒绝”接入 `respondToInvite`
3. 与主业务流联动：事件详情提供“创建任务/打开任务/开始计时”入口（至少 2 条闭环）

## 7. 交付与验证（Deliver）
1. 运行迁移：`pnpm -C lawclick-next exec prisma migrate deploy`
2. 本地验证：
   - `/calendar` 新建/编辑/取消/过滤
   - `/dispatch` 团队状态真实数据、邀请处理、泳道展示
3. 工程验证：`pnpm -C lawclick-next build`
4. 文档归档：
   - 验收记录：`docs/TG7_日程安排_调度中心_验收记录.md`
   - 更新：`docs/1211_架构落地开发总计划_v1.md`、`2_active_task.md`、`0_archive_context.md`

## 8. 明确不做项（避免失控）
- 外部日历同步（Google/Outlook/ICS）
- 复杂重复事件（RRULE）
- 高级冲突约束（Postgres exclusion constraint）
- cal.com 的 SelectedSlots 并发预留（本 TG 只做后端冲突检测 + MVP）
