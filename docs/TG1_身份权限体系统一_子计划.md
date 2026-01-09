# TG1 身份/权限体系统一子计划（DID）

## 文档信息
- 版本：v1.0
- 创建日期：2025-12-12
- 适用范围：`lawclick-next/`
- 上游依赖：TG0 已完成（DB/seed/存储基线稳定）
- 目标里程碑：为 TG2“案件端到端闭环”提供统一、可复用、无空壳的权限底座

---

## 一、Design（设计/领域澄清）

### 1.1 目标
1. **统一身份与权限语义**：角色、权限点、页面访问、案件成员权限三者一致，不再各处硬编码。
2. **去除“Demo/假身份”逻辑**：登录不得自动创建用户，避免空壳/假数据污染。
3. **动作层强校验**：所有核心 actions（cases/tasks/documents/timelogs/events）必须执行权限与案件成员可见性校验。
4. **路由层统一拦截**：`src/proxy.ts`（原 `src/middleware.ts`）基于 `PAGE_ACCESS_CONFIG` 做登录与页面访问控制。
5. **为 RLS/多租户预留**：不在 TG1 全量上 Firm/tenant，但在 helper 中统一 tenant 入口，后续 TG 可平滑接入。

### 1.2 范围
- 身份/权限配置：`src/lib/permissions.ts`
- NextAuth 登录与会话：`src/auth.ts`
- 路由拦截：`src/proxy.ts`
- 核心 actions 权限改造：
  - 案件：`src/actions/cases.ts`、`cases-crud.ts`、`party-actions.ts`、`stage-management.ts`
  - 任务：`src/actions/tasks-crud.ts`
  - 计时：`src/actions/timelogs-crud.ts`
  - 文档：`src/actions/document-actions.ts`
  - 日程：`src/actions/event-actions.ts`
- 公共鉴权 helper（新增）：`src/lib/server-auth.ts`

**不做项**
- 不做完整 Firm/组织/多租户模型落库（留给后续 TG）。
- 不在 TG1 处理 UI/UX 细节（权限 UI 提示在 TG2+ 逐页补齐）。

---

## 二、Implement（实现/集成）

### 2.1 领域/配置对齐
1. 复核 `Role` 枚举与 1211 身份矩阵：确认专业/行政/外部/系统角色覆盖完整。
2. 复核 `ROLE_PERMISSIONS`、`PAGE_ACCESS_CONFIG`：
   - 与当前路由结构一致（`/(dashboard)/...`）。
   - 明确每个 permission 的业务语义与最小集合。

### 2.2 去除 Demo 身份污染
1. 修改 `src/auth.ts`：
   - 移除“未注册邮箱自动创建 Demo 用户”逻辑。
   - 保留“legacy user 无 password 时补写默认密码”的兜底（仅开发期/seed 兼容）。
2. 精简开发期 debug log（保留必要错误日志）。

### 2.3 新增统一鉴权 helper
新增 `src/lib/server-auth.ts`（仅 Server 使用），提供：
1. `getSessionUserOrThrow()`：读取 session → prisma user → 不存在则 throw/redirect。
2. `requirePermission(permission)`：基于 `hasPermission` 校验。
3. `requireCaseAccess(caseId, permission?)`：
   - 允许 originator/handler/caseMember；
   - ADMIN/合伙人可全局查看（按 `ROLE_PERMISSIONS`）。
4. `getTenantId(user)` 预留（当前返回 `"default-tenant"`）。

### 2.4 actions 层权限改造
1. 统一替换 actions 内零散的 session 判断为 helper：
   - 所有入口必须先 `getSessionUserOrThrow()`。
2. 案件 actions：
   - `createCase`：`requirePermission('case:create')`。
   - `updateCase/changeStatus/archive`：`requireCaseAccess(caseId, 'case:edit'|'case:archive')`。
   - `getCases/getCaseDetails`：`requirePermission('case:view')` + 成员可见性过滤。
3. 任务 actions：
   - 创建/更新/删除任务必须校验 `task:*` 权限 + `requireCaseAccess(caseId)`。
4. 文档 actions：
   - 上传/编辑/删除必须校验 `document:*` 权限 + 案件可见性。
5. 计时 actions：
   - 创建/修改/审批工时按 `timelog:*` 权限与案件/任务关联校验。
6. 日程 actions：
   - 创建/编辑/删除需 `team:view` 或更高权限，且 caseId 关联时走 `requireCaseAccess`。

### 2.5 路由层（middleware）统一拦截
1. `src/proxy.ts` 改造（原 `src/middleware.ts`）：
   - 非 `/auth/*` 且未登录 → 重定向 `/auth/login`。
   - 已登录但 `!canAccessPage(role, pathname)` → 重定向 `/dashboard`（后续可替换为 403 页）。
2. 保持 matcher 不影响 `/api` 与静态资源。

---

## 三、Deliver（验收/验证）

### 3.1 验收脚本
1. 清空浏览器 session 后访问任意 dashboard 页面 → 必须被重定向到登录页。
2. 以不同角色登录（seed 用户）：
   - PARTNER/LAWYER/LEGAL_SECRETARY/CLIENT 访问页面权限与 `PAGE_ACCESS_CONFIG` 一致。
3. actions 层越权测试：
   - 非案件成员直接调用任务/文档/计时 actions → 返回权限错误。
   - 合伙人/ADMIN 能跨案件查看（按权限配置）。

### 3.2 验收标准
- 登录不再自动创建 Demo 用户。
- 页面访问与 actions 权限统一、可预测、无硬编码分叉。
- 案件成员可见性在服务端强约束。
- 为 TG2 端到端闭环提供稳定权限底座。

### 3.3 风险与对策
- **现有 UI 依赖弱校验**：TG1 先保证服务端正确，UI 提示在 TG2 逐页补齐。
- **权限矩阵调整**：以 `permissions.ts` 为唯一真源，动作层不再散落角色判断。

---

## 四、TG1 完成后的下一步
- 补充本文件“验收结果”小节。
- 进入 TG2 案件端到端闭环，先写 `docs/TG2_子计划.md` 再实施。

---

## 五、验收结果（2025-12-12）
1. 身份/权限真源统一：
   - 以 `src/lib/permissions.ts` 为唯一权限矩阵；新增 `src/lib/server-auth.ts` 作为服务端鉴权入口。
2. 去除 Demo 身份污染：
   - `src/auth.ts` 已移除“未注册邮箱自动创建 Demo 用户”逻辑，仅允许已存在用户登录。
3. 路由层拦截：
   - `src/proxy.ts` 已启用登录校验与页面访问控制（基于 `PAGE_ACCESS_CONFIG`）。
4. actions 层强校验：
   - 案件/阶段/时间线/当事人：`cases.ts`、`cases-crud.ts`、`stage-management.ts`、`timeline-actions.ts`、`party-actions.ts`
   - 任务：`tasks-crud.ts`、`tasks.ts`
   - 计时：`timelogs-crud.ts`、`timelogs.ts`
   - 文档：`document-actions.ts`、`documents.ts`
   - 日程：`event-actions.ts`、`events.ts`
   均已接入 `getSessionUserOrThrow / requirePermission / requireCaseAccess`。
5. 无假数据修正：
   - `actions/documents.ts` 的 mock 文档/上传/生成逻辑已替换为真实落库占位记录；
   - `DocumentListClient` 移除初始 mock 扩展字段注入。
6. tenant/RLS 预备：
   - `server-auth.getTenantId()` 已预留，当前返回默认 tenant，后续 TG 可平滑扩展。

**结论**：TG1 验收通过，可进入 TG2“案件端到端闭环”。  
**已知非本 TG 问题**：`src/app/(dashboard)/research/page.tsx` 存在 TS 语法错误，导致全量 `tsc --noEmit` 失败（未在 TG1 内改动，留待后续专项修复）。
