# TG6 仪表盘（MDI/DIY 工作台）验收记录

- 日期：2025-12-13
- 主工程：`lawclick-next/`
- 约束：遵循 `prompt/1211架构设计.md`、`.agent/rules/lawclick.md`（无 mock/空壳、MDI/LEGO 强制、布局落库跨设备一致、权限必须在后端）

## 1. 已交付功能（对照子计划）
1. **MDI/DIY 工作台**：`/dashboard` 支持编辑模式下拖拽/缩放 Widget；查看模式稳定展示。
2. **布局落库**：新增 `DashboardLayout`（DB 真源），按 `userId + dashboardKey` 唯一持久化 `config(Json)`。
3. **Widget 注册中心（最小）**：新增 `lawclick-next/src/lib/dashboard-widgets.ts`，集中维护 `title/defaultSize/requiredPermissions`。
4. **无 mock**：移除仪表盘页内 mock（原 `SMART_ALERTS`），Widget 数据来自 Postgres（允许为空/为 0）。
5. **核心业务组件**（真实数据联动）：
   - 案件看板（CaseKanban）
   - 我的任务（今日待办）
   - 近期日程
   - 工时概览（今日/本周）+ 打开计时器浮窗入口
6. **自适应修复**：工具栏折叠后主内容区与网格布局可随宽度变化重新计算。

## 2. 核心实现点（便于回溯）
- Prisma：`lawclick-next/prisma/schema.prisma` 新增 `DashboardLayout`，并已迁移。
- 权限：
  - `lawclick-next/src/lib/permissions.ts` 新增 `dashboard:view` / `dashboard:edit`。
  - Widget 级权限：案件/工时组件要求 `case:view`，对不具备权限角色自动隐藏。
- Server Actions：`lawclick-next/src/actions/dashboard-layout.ts`
  - `getMyDashboardConfig`：无配置则按角色生成默认布局并落库
  - `saveMyDashboardConfig`：按角色权限清洗 widgets/layout 后 upsert
  - `resetMyDashboardConfig`：按当前角色重置默认布局
- Dashboard 页面：`lawclick-next/src/app/(dashboard)/dashboard/page.tsx`
  - 依据注册中心 + 权限过滤 catalog；仅在需要时拉取 cases/time summary
- 自适应：
  - `lawclick-next/src/app/(dashboard)/layout.tsx` 使用 `SidebarInset` 作为主内容容器
  - `lawclick-next/src/components/dashboard/DashboardWorkspaceClient.tsx` 在 Sidebar 折叠/展开后触发 `window.resize`，避免网格宽度不刷新
- 构建修复：
  - 依赖补齐：安装 `react-resizable`
  - RGL v2：改用 `react-grid-layout/legacy` 的 `WidthProvider` 兼容接口
  - Proxy（原 Middleware）：`lawclick-next/src/proxy.ts`（原 `src/middleware.ts`）使用 `next-auth/jwt getToken`（保持拦截层轻量，避免 Prisma 介入）

## 3. 人工验收步骤（你本机执行）
1. 登录任一有 `dashboard:view` 权限的账号，进入 `/dashboard`：
   - 首次进入应自动生成默认布局（并在 DB 创建 `DashboardLayout` 记录）
2. 点击「编辑布局」：
   - 拖拽/缩放任一 Widget
   - 点击「保存布局」
3. 刷新 `/dashboard`：
   - 布局应保持一致（从 DB 恢复）
4. 侧边栏折叠/展开：
   - 主内容宽度应随之变化；网格布局不应“卡死/溢出”
5. 用不同角色验证权限：
   - 无 `case:view` 的角色：不应看到「案件看板」「工时与计时」组件

## 4. 自动验证
- `pnpm -C lawclick-next build`：通过

## 5. 已知问题/后续增强
1. Widget 组件库当前为 MVP（4 个核心组件）；后续在 TG7（日程/调度）扩展更多可插拔组件。
2. Next 构建时会提示 monorepo 多 lockfile 警告（不影响 build 通过）；建议后续清理 `lawclick-next/package-lock.json` 以减少歧义。
