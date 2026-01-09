# TG6 仪表盘（MDI/DIY 工作台）子计划（Phase3-4）

> 约束：遵循 `prompt/1211架构设计.md`、`.agent/rules/lawclick.md`（无 mock/空壳、MDI 强制、LEGO 组件化、布局必须落库跨设备一致、权限必须在后端）  
> 主工程：`lawclick-next/`  
> 核心原则：以主模块（案件/任务）为核心，以业务流（计时/日程/协作）为主线，其余模块为辅助组件

## 0. 背景与现状问题（必须先修）
当前仪表盘存在以下关键缺口，与 1211 架构要求不一致：
1. **非 DIY**：`/dashboard` 为固定布局（Tabs + 固定卡片），用户无法拖拽/停靠/自定义组件组合。
2. **布局不持久化**：没有 DB 级的 DashboardConfig/WidgetLayout，跨设备无法复用。
3. **存在 mock/假数据**：仪表盘内存在硬编码 `SMART_ALERTS`、以及律所概览中的硬编码数值，违反“无假数据”。
4. **MDI/LEGO 未完整落地**：已有全局浮窗（Timer/Chat/AI）但缺少“工作台级别”的 LEGO Widget 注册与布局系统。
5. **体验问题（信息密度/自适应）**：需要修复“工具栏收缩后布局不自适应”和“字体过密缺少积木感”等问题（以 dashboard 工作台为主入口先落地）。

## 1. 目标与验收（可执行清单）
### 1.1 目标（MVP 完整可用）
1. **MDI/DIY 工作台**：`/dashboard` 支持“编辑模式”下拖拽/缩放 Widget；“查看模式”下稳定展示。
2. **布局持久化到 DB**：每个用户的工作台布局（Widget 列表 + grid layout）写入数据库，刷新/换机可恢复。
3. **LEGO Widget 注册中心（最小）**：提供可插拔组件注册表（title/icon/defaultSize/permissions/dataSource）。
4. **无 mock**：移除仪表盘内所有假数据/硬编码业务数字，全部来自 Postgres（允许为 0 或空列表）。
5. **工作台包含核心业务组件**：至少包含以下真实组件：
   - 案件看板（CaseKanban）
   - 今日待办/任务列表
   - 日程/近期事件列表
   - 工时概览（今日/本周小时数 + 快捷入口到 `/time` + 打开计时器浮窗）

### 1.2 验收
1. 首次进入 `/dashboard`：
   - 自动生成默认工作台布局（无需手动配置）
2. 编辑布局：
   - 进入“编辑模式” → 拖拽/缩放 Widget → 点击“保存布局”
   - 刷新页面后布局保持一致
3. 跨设备一致：
   - 同一账号在不同浏览器/设备登录后，布局能从 DB 恢复
4. 数据真实性：
   - 仪表盘各 Widget 不使用 mock；列表/统计均来自真实 actions + Prisma 查询
5. 工程质量：
   - `pnpm -C lawclick-next build` 通过

## 2. 领域与数据设计（Design）
### 2.1 数据模型（最小增量）
新增 `DashboardLayout`（或 `DashboardConfig`）用于持久化：
- `userId + dashboardKey` 唯一（默认 `dashboardKey="default"`）
- `config`（Json）：保存 `widgets`（实例列表）与 `layout`（网格位置）
- `createdAt/updatedAt`

配置建议结构（Json）：
```json
{
  "widgets": [
    { "id": "w_cases", "type": "cases_kanban" },
    { "id": "w_tasks", "type": "my_tasks" }
  ],
  "layout": [
    { "i": "w_cases", "x": 0, "y": 0, "w": 8, "h": 10 },
    { "i": "w_tasks", "x": 8, "y": 0, "w": 4, "h": 6 }
  ]
}
```

### 2.2 权限设计
- 增加 `dashboard:view` / `dashboard:edit` 权限（与页面访问配置保持一致）
- Server Actions 必须：
  - 获取布局：`dashboard:view`
  - 保存布局：`dashboard:edit`

## 3. 接口设计（Design）
### 3.1 Server Actions（单一真源）
- `getMyDashboardConfig(dashboardKey?: string)`
- `saveMyDashboardConfig(dashboardKey: string, config: DashboardConfigInput)`
- `resetMyDashboardConfig(dashboardKey?: string)`（可选，MVP 可通过保存默认配置实现）

### 3.2 Widget 注册中心（代码结构）
- `src/lib/dashboard-widgets.ts`：
  - 定义 widget 类型、默认尺寸、标题、允许角色/权限
  - 由 `/dashboard` server 侧根据 config 生成对应 widget node

## 4. 实现步骤（Implement）
### 4.1 后端
1. Prisma：新增 `DashboardLayout` 并 migrate
2. 权限：新增 `dashboard:view/edit` 并补齐角色映射
3. Actions：实现 get/save（upsert）+ revalidatePath(`/dashboard`)

### 4.2 前端（工作台）
1. 引入 `react-grid-layout` 实现拖拽/缩放（符合“react-grid-layout logic”要求）
2. 新增 `DashboardWorkspaceClient`：
   - 查看模式：静态网格
   - 编辑模式：可拖拽/可缩放 + “添加组件/保存布局/重置”
3. `/dashboard` 页面重构：
   - 去掉 `SMART_ALERTS` mock
   - 使用 server 获取 dashboardConfig + 真实业务数据（cases/tasks/events/time summary）
   - 将 widget nodes 注入 `DashboardWorkspaceClient`

## 5. 交付与验证（Deliver）
1. `pnpm -C lawclick-next build`
2. 浏览器验收（你本机执行）：
   - 编辑布局 → 保存 → 刷新 → 布局保持
   - 打开计时器浮窗、跳转 `/time`、跳转 `/calendar` 等联动正常
3. 输出验收记录：`docs/TG6_仪表盘_MDI-DIY_验收记录.md`
4. 更新总计划与 `2_active_task.md`

## 6. 风险与回滚
- 布局 JSON 兼容性：需要 schema version（后续可在 config 内加入 `configVersion`）。
- 大屏/小屏：用 Container Queries + 响应式 breakpoints 分别保存布局（后续增强）。
- 编辑写放大：MVP 采用“手动保存”；后续再引入 debounce 自动保存。

