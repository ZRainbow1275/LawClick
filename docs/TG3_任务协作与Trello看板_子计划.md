# TG3 任务协作 + Trello式看板 子计划（DID）

## 文档信息
- 版本：v1.0
- 创建日期：2025-12-12
- 适用代码基线：`lawclick-next/`
- 上游依赖：TG0 基础设施、TG1 权限底座、TG2 案件闭环已完成
- 目标里程碑：实现“案件任务 Trello 看板 + 全局任务中心 + 拖拽排序落库 + 计时/日程最小联动”的真实闭环

---

## 一、Design（领域澄清与方案设计）

### 1.1 目标
1. **案件内任务看板 Trello 化**  
   - 在 `/cases/[id]` 的“任务”Tab 中实现可拖拽的 Kanban（TODO/IN_PROGRESS/REVIEW/DONE）。  
   - 支持列内排序、跨列移动，排序与状态变更真实落库并跨刷新保持。
2. **全局任务中心真实化**  
   - `/tasks` 页面移除 mock，展示当前用户可见/待办任务。  
   - 支持列表视图与看板视图切换；看板按 `TaskStatus` 分列并可拖拽落库。
3. **泳道/阶段能力最小闭环**  
   - 任务支持 `stage`（案件阶段）与 `swimlane`（自定义泳道）字段使用。  
   - 本 TG 主要用于看板排序/分组，不做复杂多泳道 UI（TG6/TG7 再做 MDI/调度深化）。
4. **与计时/日程最小联动**  
   - 任务卡片可“一键开始计时”（调用 `startTimer({ taskId })`）。  
   - 任务卡片可“创建日程”（基于任务信息调用 `createEvent`，不新增 schema）。

### 1.2 范围
- 数据/状态：复核 `Task` 模型字段与索引（`schema.prisma`）。如无必须新增字段则保持不变，仅调整语义与使用方式。
- Actions：`src/actions/tasks-crud.ts`（核心）、`src/actions/tasks.ts`（保留）、必要时新增 `getAccessibleTasksForBoard`。
- UI：
  - 案件看板：`src/components/cases/CaseTaskKanban.tsx`（改造为可拖拽，并复用通用组件）。
  - 通用看板：新增 `src/components/tasks/TaskKanban.tsx`（LEGO 组件）。
  - 全局任务中心：`src/app/(dashboard)/tasks/page.tsx` 重写为真实数据。

**不做项（明确边界）**
- 不在 TG3 内实现全局 MDI Window Manager / 仪表盘 DIY（TG6 专项）。  
- 不新增 Event↔Task schema 关联（TG7 若需要再补）。  
- 不支持跨案件拖拽移动任务（任务强绑定案件，跨案移动需更强业务规则，后续 TG 评估）。

### 1.3 关键设计决策
1. **排序语义**  
   - `Task.order` 表示在同一 `(caseId, status, swimlane)` 内的列序。  
   - 新建任务时，取同列 max(order)+1；跨列移动时对源列/目标列重新编号。
2. **reorderTasks 扩展**  
   - 支持批量更新 `order + status + swimlane + stage`。  
   - 在一次 transaction 中完成，成功后 `revalidatePath` 对应 case 与 `/tasks`。
3. **权限**  
   - `getCaseTasksByStatus/getCaseTasksByStage/reorderTasks` 全部强制 `requirePermission` + `requireCaseAccess`。  
   - 全局任务查询按当前用户可见案件过滤（PARTNER/ADMIN 直接全量）。
4. **UI 复用**  
   - 抽象 `TaskKanban` 组件，Case 详情与全局任务中心复用，避免两套排序逻辑。

---

## 二、Implement（实现与集成）

### Phase1_Analysis & Schema（最小必要更新）
1. 复核 `schema.prisma` 中 `Task`：
   - 字段：`status/priority/order/swimlane/checklist/stage/taskType/dueDate/assignee/document/estimatedHours` 已满足 Trello 看板。  
   - 如无新字段需求，仅在文档与代码中统一 `order` 的列内语义。
2. 复核 seed：确认已有案件/任务种子可支撑看板演示；如任务过少则在 seed 中补充真实任务样本（不得引入假数据）。

### Phase2_Core Logic（Server Actions）
1. `tasks-crud.ts`
   - 修复 `getCaseTasksByStatus` 权限缺失（`requirePermission` + `requireCaseAccess`）。  
   - `createCaseTask` 的 order 计算改为按 `(caseId,status,swimlane)` 取 max。  
   - 扩展 `reorderTasks` 入参：`{ taskId, order, status?, swimlane?, stage? }`。  
   - 成功后 `revalidatePath(`/cases/${caseId}`)` 与 `revalidatePath('/tasks')`。
2. 新增 `getAccessibleTasksForBoard(options)`  
   - 返回当前用户可见案件内的未完成任务（可选按 `status/assignee/search` 过滤）。  
   - include `case`/`assignee`/`document` 以支撑 UI。
3. 单元测试（最小覆盖）  
   - `reorderTasks` 跨列/列内排序正确性与权限拒绝（如仓库已有测试体系）。

### Phase3_UI Implementation（真实数据绑定）
1. 新增通用 `TaskKanban` 组件  
   - 基于 `@hello-pangea/dnd`，实现列内 reorder、跨列 move、乐观更新。  
   - onDragEnd → 计算源/目标列新 order → 调用 `reorderTasks` 落库。
2. 改造 `CaseTaskKanban`  
   - 移除本地排序逻辑，使用 `TaskKanban`；保留“新建任务”对话框。  
   - 列头展示数量、阶段/泳道标签、任务卡片信息（优先级/到期/负责人/关联文书/预估工时）。
3. 重写 `/tasks` 页面  
   - 移除 `MOCK_TASKS`。  
   - useEffect 调用 `getAccessibleTasksForBoard` 获取任务。  
   - 提供“列表/看板”切换；列表按 dueDate/priority 排序并可搜索。  
   - 看板复用 `TaskKanban`（按 status 分列）。
4. 最小联动按钮  
   - 任务卡片提供：`开始计时`（调用 `startTimer`）与 `创建日程`（调用 `createEvent`）入口。

---

## 三、Deliver（验收与交付）

### Phase4_Browser Verification（人工验收脚本）
1. 以 seed 账号 `partner1@lawclick.com / password123` 登录。  
2. 进入 `/cases` → 打开任一 ACTIVE 案件 → “任务”Tab：  
   - 新建 2-3 个任务，刷新页面仍存在。  
   - 拖拽任务在 TODO/IN_PROGRESS/REVIEW/DONE 间移动，刷新后顺序/状态保持。  
3. 进入 `/tasks`：  
   - 列表能看到同一批任务；搜索/过滤正常。  
   - 切换到看板视图，拖拽移动与案件内看板保持一致。  
4. 在任务卡片上点击“开始计时”：跳转 `/timelog` 能看到 running timer（若已有 UI 支撑）。  
5. 点击“创建日程”：在 `/calendar` 中能看到新日程（标题/案件关联正确）。

### 验收标准
- 案件内与全局任务中心完全真实数据，无 mock。  
- 拖拽排序/跨列移动全部落库，跨刷新一致。  
- 权限：非成员用户无法读取/操作不属于自己的案件任务。  
- 计时/日程联动入口可用，产生真实记录。

---

## 四、完成后归档
1. 更新 `docs/1211_架构落地开发总计划_v1.md` 中 TG3 状态与关键决策。  
2. 记录验收截图与问题到 `docs/v9_enhancement_log.md`（如有）。  
3. 按约定输出一次 `/compact`。

