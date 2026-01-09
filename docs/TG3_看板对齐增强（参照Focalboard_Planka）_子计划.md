# TG3 看板对齐增强（参照 Focalboard / Planka）子计划（DID）

## 文档信息
- 版本：v1.0
- 创建日期：2025-12-12
- 适用代码基线：`lawclick-next/`
- 参照来源：
  - `docs/开源参照研究_看板_计时_日程.md`
  - Focalboard（交互/视图/手动排序理念）
  - Planka（Trello-like 结构、position 排序与后端重排策略）
- 强制约束：`prompt/1211架构设计.md`、`.agent/rules/lawclick.md`（禁止假数据/空壳、无前端不后端、权限后置、中文沟通）

---

## 一、Design（领域澄清与方案设计）

### 1.1 目标（本次必须交付）
1. **排序机制对齐 Planka（position/gap 思路）**
   - 现状：前端拖拽后对整列做 `1..n` 全量重排并批量落库。
   - 目标：默认仅更新“被移动任务”的 `order/status/swimlane`，并在 gap 不足时对目标列做**局部 reindex**，降低写放大、提升频繁拖拽稳定性。

2. **交互对齐 Planka（Add card + Card modal）**
   - 列头支持“快速新建任务（Add card）”（仅案件看板启用，避免全局任务中心无法确定 caseId）。
   - 卡片点击打开“任务详情弹窗（Modal）”，支持编辑并真实落库：
     - 标题、描述、状态、优先级、截止日期、负责人（案件成员范围内）、预估工时、任务类型
     - 删除任务（有权限）

3. **交互对齐 Focalboard（手动排序与撤销体验）**
   - 拖拽后失败：自动回滚到拖拽前快照。
   - 拖拽后成功：提供“撤销（Undo）”入口（toast action），在可控窗口内支持一次撤销回滚。

### 1.2 范围（明确不做项）
- 不做多人实时协作（WebSocket 广播）——后续 TG7/协作专项再引入。
- 不做 Focalboard 的完整 View/Property 系统（排序属于视图、可多视图切换）——后续 TG6（MDI/DIY）落地 View 配置与持久化。
- 不做跨案件拖拽移动任务（任务强绑定案件）——后续评估业务规则与权限。
- 不新增 schema（本次用 `Task.order:Int` 完成 gap 排序；未来若引入 viewCardOrder 再扩展 schema）。

### 1.3 核心设计决策（必须遵循）
1. **排序语义（保持 TG3 语义不变）**
   - `Task.order` 表示在同一 `(caseId, status, swimlane)` 内的顺序。

2. **gap order 策略（Planka 思路）**
   - 设定常量 `POSITION_GAP = 1024`。
   - 插入时只计算新 `order`：
     - 若存在 `prevOrder` 与 `nextOrder` 且 `nextOrder - prevOrder > 1`：`newOrder = floor((prev+next)/2)`
     - 若移动到列首/列尾：`newOrder = firstOrder - POSITION_GAP` 或 `lastOrder + POSITION_GAP`
     - 若 gap 不足（`nextOrder - prevOrder <= 1`）：触发**局部 reindex**（仅目标列；必要时也可对源列 reindex，但本次优先只做目标列）。

3. **后端为“排序真源”**
   - 新增 server action：`moveTaskOnKanban(input)`，在事务内：
     - 校验权限（`task:edit`）与案件访问（`case:view` + `requireCaseAccess`）
     - 读取邻居 order → 计算新 order → 必要时局部 reindex → 更新
     - 返回 `updates[]`（taskId/order/status/swimlane），供前端同步 state

4. **创建任务支持指定列（Add card 必需）**
   - 扩展 `createCaseTask` 支持 `status?: TaskStatus`，并按目标列的 `max(order)` 计算新增任务 order。

---

## 二、Implement（实现与集成）

### Phase2_Core Logic（Server Actions）
#### 2.1 `src/actions/tasks-crud.ts`
1. 扩展 `CreateTaskInput`：
   - 新增可选 `status?: TaskStatus`（默认 TODO）
2. 调整 `createCaseTask`：
   - `targetStatus = input.status ?? "TODO"`
   - `order = maxOrder + POSITION_GAP`（兼容旧数据：若 maxOrder 很小也无妨）
3. 新增 `moveTaskOnKanban`：
   - 入参建议：
     - `taskId: string`
     - `toStatus: TaskStatus`
     - `toSwimlane?: string | null`
     - `beforeTaskId?: string | null`
     - `afterTaskId?: string | null`
   - 返回：
     - `{ success: boolean; updates?: ReorderTaskUpdate[]; error?: string }`
   - 事务内容：
     - 校验任务存在并读取 `caseId`
     - 校验访问权限
     - 读取邻居 order（若提供 before/after）
     - 计算 `newOrder`，gap 不足则拉取目标列 tasks 并 reindex（`(idx+1)*POSITION_GAP`）
     - 更新 moved task 的 `status/swimlane/order`
     - `revalidatePath(`/cases/${caseId}`)` 与 `revalidatePath('/tasks')`

> 说明：保留 `reorderTasks` 作为兜底接口（也方便未来批量维护）。

### Phase3_UI Implementation（看板交互增强）
#### 3.1 `src/components/tasks/TaskKanban.tsx`
1. 拖拽逻辑改造：
   - onDragEnd 获取目标列邻居卡片：`beforeTaskId/afterTaskId`
   - 调用 `moveTaskOnKanban`（成功后以返回 updates 统一修正本地 state）
   - 失败：回滚到拖拽前快照并 toast 报错
   - 成功：toast 提供“撤销”按钮，触发一次 `moveTaskOnKanban`/`reorderTasks` 回滚（以快照 updates 为准）
2. 列头“Add card（快速新建）”
   - 仅当传入 `caseId` 时启用
   - 内联输入：Enter 创建、Esc 取消
   - 调用 `createCaseTask({ caseId, title, status: col.id })`
3. 卡片点击打开 `TaskDetailDialog`

#### 3.2 新增 `src/components/tasks/TaskDetailDialog.tsx`
- 真实 CRUD：
  - 保存：`updateTask(taskId, payload)`
  - 删除：`deleteTask(taskId)`（按钮仅在有 `task:delete` 权限时显示）
  - 指派：在有 `assignees` 数据时显示选择器
- UI：参照 Planka/Linear 的详情弹窗信息架构（标题区 + 属性区 + 描述区 + 操作区）

#### 3.3 `src/components/cases/CaseTaskKanban.tsx`
- 作为“案件看板容器”，向 `TaskKanban` 传入：
  - `caseId`
  - `assignees`（案件成员/律师列表）

#### 3.4 `/tasks` 全局任务中心
- 仍复用 `TaskKanban`，但不传 `caseId` → 不显示 Add card
- 详情弹窗可编辑基础字段，但“指派”仅在传入成员列表时启用（本次先只读展示，避免空壳）

---

## 三、Deliver（验收与交付）

### 3.1 手工验收脚本（必须逐条通过）
1. 登录：`partner1@lawclick.com / password123`
2. 打开任一 ACTIVE 案件 → 任务 Tab
3. 快速新建：
   - 在 TODO/进行中/待审核/已完成 列分别快速新建 1 条任务
   - 刷新页面，任务仍存在且在对应列
4. 拖拽排序：
   - 同列内拖拽 10 次 + 跨列拖拽 10 次
   - 刷新后顺序保持
   - 在数据库中抽查 order 值应呈 gap（非简单 1..n），且移动任务仅更新少量记录（除非触发 reindex）
5. 详情弹窗：
   - 打开任一任务，编辑标题/描述/优先级/截止日期/状态，保存后列表立即反映
6. 撤销：
   - 拖拽后点击 toast 的“撤销”，应恢复到拖拽前状态
7. 全局任务中心：
   - `/tasks` 看板视图看到同一批任务，拖拽后与案件内看板一致

### 3.2 质量门槛
- `pnpm -C lawclick-next build` 通过
- 不引入 mock 数据，不引入空按钮/空菜单（不可点击或无效功能必须移除）

### 3.3 归档
- 更新 `docs/1211_架构落地开发总计划_v1.md` 的 TG3：追加“看板对齐增强”完成记录与关键决策
- 结束后按约定输出一次 `/compact`

