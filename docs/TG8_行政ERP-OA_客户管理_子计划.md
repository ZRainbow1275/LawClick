# TG8 行政ERP/OA & 客户管理（参照 Odoo / ERPNext / Dolibarr）子计划（Phase3-4）
> 约束：遵循 `prompt/1211架构设计.md`、`.agent/rules/lawclick.md`（无 mock/空壳；MDI + LEGO；权限必须后端校验；真实落库闭环）。  
> 主工程：`lawclick-next/`  
> 核心原则：以主模块（案件/任务）为核心，以业务流（案件 → 任务 → 计时 → 文档 → 日程/看板 → 复盘）为主线，其余模块为辅助但必须闭环可用。
> 补充子计划：`docs/TG8_案件账务联动_子计划.md`（案件内账务 Tab 联动的详细 DID）。

## 0. 背景与当前缺口（必须先修）
当前“行政/财务/客户”相关能力存在明显断链路，且违反“无假数据”原则：
1. **客户管理存在 mock**：`/contacts` 页面使用 `MOCK_CLIENTS`，与数据库脱钩。
2. **审批/财务 UI 入口不完整**：`/admin/approvals`、`/admin/finance` 以“展示为主”，缺少可用的创建/提交/审批/收款等闭环操作。
3. **后端权限未统一 enforce**：`approval-actions.ts`、`finance-actions.ts`、`customer-actions.ts` 主要做“登录校验”，缺少 `requirePermission` / 行级访问控制（caseId 关联时应 enforce `requireCaseAccess`）。
4. **审批与案件追溯弱**：`ApprovalRequest` 仅 `metadata` 承载扩展字段，缺少明确 `caseId/clientId` 关联，难以做到“从案件发起审批、从台账追溯回案件”。
5. **合同台账缺失**：缺少 Contract 领域模型与 UI，无法形成“合同 → 审批 → 文档 → 案件/客户追溯”的最小闭环。
6. **数据基线口径需统一**：主线禁止 synthetic seed；若需要可见的历史业务数据，应通过“脱敏生产快照导入”提供（而不是在 seed 里造数）。

## 1. 目标与验收（MVP：完整可用）
### 1.1 目标（必须实现）
**A. 客户管理（CRM）**
1. `/contacts` 不再出现 mock（可重定向/复用真实 CRM 页面）。
2. 客户列表：分页/搜索/阶段/等级/负责人筛选，数据来自 Postgres。
3. 客户创建/编辑：真实落库；可维护 stage/grade/source/notes/nextFollowUp/assignee。
4. 客户详情：展示标签、服务记录、关联案件；支持新增服务记录、添加标签、更新阶段/等级/负责人。
5. **联动闭环（必做）**：客户详情一键“创建案件”（预填 clientId），创建后跳转到新案件详情。

**B. 行政 OA 审批**
1. 支持创建审批（草稿/提交），类型覆盖：LEAVE / EXPENSE / PURCHASE / CONTRACT / INVOICE / OTHER（以 `metadata` 承载不同类型字段）。
2. 支持指派审批人；审批人可“通过/驳回（备注）”；申请人可“撤回”。
3. 审批列表与详情可用：待我审批 / 我已处理 / 我发起的（必要时加“全量/按案件”视图）。
4. **案件追溯（必做）**：审批可选关联 `caseId`（与案件账务联动），并在 UI 中可从审批跳转回案件。
5. 权限后端 enforce：创建/查看/审批权限不依赖前端按钮隐藏。

**C. 财务台账（应收 + 费用）**
1. 发票：创建（关联案件/客户可选）、状态流转、列表筛选、收款记录（Payment）创建后自动刷新发票状态（PARTIAL/PAID）。
2. 费用：创建（关联案件可选）、列表筛选（按案件/人员/状态）。
3. **联动闭环（必做）**：案件详情「账务」页可查看该案件 invoices/expenses，并可创建；`/admin/finance` 可回溯到案件/客户。
4. 权限后端 enforce：涉及 caseId 的操作必须 `requireCaseAccess`；台账查询必须有相应权限（见 3.2）。

**D. 合同台账（最小闭环）**
1. 合同台账模型（Contract）：合同号/标题/金额/状态/签署日期/有效期/备注；可关联案件/客户；支持绑定文档（复用 TG5 Document）。
2. 合同可走审批：审批类型 CONTRACT 可关联 contractId（MVP 允许写入 metadata；优先提供显式 contractId 以便查询）。
3. UI：合同列表/详情/状态更新可用；可从案件/客户进入合同台账。

### 1.2 验收脚本（必须可复现）
1. 以 `partner1@lawclick.com` 登录：
   - 进入 `/contacts` → 能看到真实客户（无 mock）→ 新建客户 → 进入客户详情添加服务记录 → 一键创建案件 → 跳转 `/cases/[id]` 成功。
2. 在案件详情「账务」：
   - 创建发票 → 在 `/admin/finance` 出现 → 记录收款 → 发票状态自动变化（PARTIAL/PAID）。
   - 创建费用 → 案件账务与财务台账均可见，且可回溯到案件。
3. 创建审批（关联案件）并提交：
   - 切换到有审批权限的账号（PARTNER/SENIOR_LAWYER/ADMIN）在 `/admin/approvals` 审批通过/驳回 → 状态与备注回写，且可跳回案件。
4. 工程验证：`pnpm -C lawclick-next build` 通过；所有新增页面无 mock、无硬编码业务数据。

## 2. 明确不做项（防止范围失控）
1. 多级会签/会审、条件路由、审批流编排器（本 TG 不做）。
2. 会计科目、凭证、总账、税务申报等完整财务系统（本 TG 仅应收+费用台账）。
3. 合同全文在线编辑器/版本对比（复用文档中心上传/下载/预览能力）。
4. CRM 自动化营销（自动任务、短信邮件触达、线索评分等）仅预留 hook，不做落地。

## 3. 设计（Design）
### 3.1 数据与领域模型（Schema）
1. `ApprovalRequest` 增加显式关联：
   - `caseId String?` → `Case?`
   - `clientId String?` → `Contact?`（用于非案件审批或辅助追溯）
   -（可选）在 `metadata` 中保留扩展字段（如 leaveStart/leaveEnd/items/contractId 等）。
2. 新增 `Contract`：
   - `contractNo` 唯一；`status` 枚举（DRAFT/SIGNED/ACTIVE/EXPIRED/CANCELLED）；可关联 `caseId/clientId/documentId`。
3. 迁移：新增 TG8 migration；并确保与 TG7 日程模型兼容；真源数据通过“脱敏生产快照导入”或真实 UI 操作自然产生（不依赖 seed 造数）。

### 3.2 权限模型（后端强制）
在 `src/lib/permissions.ts` 新增权限键（并在 `ROLE_PERMISSIONS` 配置角色映射）：
- `approval:create`：内部员工可发起
- `approval:approve`：合伙人/高级律师/管理员可审批
- `approval:view_all`：合伙人/管理员可查看全量（可选）
- `crm:view`、`crm:edit`：客户管理查看/编辑（默认对专业角色+秘书开放；是否对营销/HR 开放按角色映射）
- 财务台账优先复用现有：`billing:view`/`billing:create`/`billing:edit`（并在 actions 中 enforce）

### 3.3 Actions/API 设计（单一真源 + 可审计）
1. OA：
   - `createApprovalRequest`：支持 draft/submit；可关联 caseId/clientId；写入 metadata；返回 include requester/approver/case/client。
   - `submitApprovalRequest`：草稿→待审（可选，或由 create 的 submit=true 实现）。
   - `approveRequest` / `rejectRequest` / `cancelRequest`：状态机校验 + 权限校验 + 审批备注。
   - `getMyApprovals`：支持 pending/approved/mine + 可选按 caseId 过滤（用于案件详情联动）。
2. 财务：
   - `createInvoice` / `updateInvoiceStatus` / `recordPayment` / `getInvoices` / `getInvoiceStats`
   - `createExpense` / `getExpenses`
   - 所有带 `caseId` 的写操作必须 `requireCaseAccess(caseId, ...)`。
3. 合同：
   - `createContract` / `getContracts` / `getContractById` / `updateContractStatus` / `linkContractDocument`
4. CRM：
   - `getCustomers`（分页/搜索/筛选）、`getCustomerById`
   - `createCustomer` / `updateCustomer` / `updateCustomerStage` / `assignCustomer` / `addServiceRecord` / tags
   - 为 30-300 人规模预留：`getCustomerDirectory`（select/search 用）。

## 4. 实现步骤（Implement）
### 4.1 Phase A：Schema & Migration
1. 更新 `schema.prisma`（ApprovalRequest 关联 + Contract 模型 + 枚举）。
2. `pnpm -C lawclick-next exec prisma migrate dev` 生成并应用迁移。
3. `pnpm -C lawclick-next exec prisma generate` + `prisma validate`。
4. 数据基线：不在 seed 里造数；依赖脱敏快照（或通过真实 UI 操作自然产生数据）覆盖审批/发票/收款/费用/合同/标签/服务记录的可见数据。

### 4.2 Phase B：后端 Actions（先做权限与状态机）
1. 重构 `approval-actions.ts`：统一 `getSessionUserOrThrow` + `requirePermission`；增加按 caseId 的过滤；补齐 include 信息与状态机校验。
2. 增强 `finance-actions.ts`：补权限与 case access；补 `recordPayment` 写回发票状态；补删除/取消策略（创建者/管理员）。
3. 新增 `contract-actions.ts`：CRUD + 权限 + 与 Document 关联。
4. 增强 `customer-actions.ts`：补权限、编辑能力、目录检索能力；并提供给 UI 的“负责人选择”接口。

### 4.3 Phase C：UI（LEGO 组件化 + 真实绑定）
1. `/contacts`：移除 mock，改为重定向到真实 CRM（或直接复用组件）。
2. CRM 页面：
   - 客户列表：搜索/筛选/分页（client component + server actions）。
   - 客户详情：新增服务记录、标签、阶段/等级/负责人编辑、一键建案。
3. OA 审批页面 `/admin/approvals`：
   - 新建审批 Dialog（类型切换 + metadata 表单 + 指派审批人）。
   - 列表卡片支持快速审批/驳回/撤回；详情弹窗展示全字段与关联对象链接。
4. 财务中心 `/admin/finance`：
   - 创建发票/费用/收款 Dialog；列表筛选；可跳转案件/客户。
5. 案件详情联动：
   - `CaseBillingTab` 扩展：新增「发票」「费用」「审批」「合同」子页；并提供创建入口（预填 caseId/clientId）。
   - 替换案件侧边栏的“客户信息”硬编码电话/邮箱为真实 Contact 数据（从 `getCaseDetails` include）。

## 5. 交付与归档（Deliver）
1. 迁移与真源数据：`pnpm -C lawclick-next exec prisma migrate deploy` + 导入脱敏生产快照：`pnpm -C lawclick-next restore:snapshot -- --file <path-to-dump> --reset --yes`。
2. 本地验收：按 1.2 脚本逐条验证。
3. 工程校验：`pnpm -C lawclick-next build`。
4. 文档归档：
   - 验收记录：`docs/TG8_行政ERP-OA_客户管理_验收记录.md`
   - 更新：`docs/1211_架构落地开发总计划_v1.md`、`2_active_task.md`、`0_archive_context.md`
