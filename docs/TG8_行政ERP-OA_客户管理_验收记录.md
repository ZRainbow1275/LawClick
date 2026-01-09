# TG8 行政ERP/OA & 客户管理（验收记录）

> 主工程：`lawclick-next/`  
> 约束：遵循 `prompt/1211架构设计.md`、`.agent/rules/lawclick.md`（无 mock/空壳、权限后端校验、真实落库闭环）  
> 目标：参考成熟 ERP/OA 流程，打通 **审批 / 发票 / 收款 / 费用 / 合同 / CRM**，并与案件形成“发起 → 追溯”的最小闭环

## 1. 本次交付清单（已完成）
### 1.1 数据层（Prisma）
- `ApprovalRequest`：显式补齐 `caseId/clientId` 关联与索引（支持案件追溯与客户追溯）。
- 新增 `ContractStatus`、`Contract`（支持 case/client/document/creator 关联；与 `Document` 1-1）。
- 迁移：`lawclick-next/prisma/migrations/20251213202509_tg8_admin_oa_finance_crm/migration.sql`
- Seed：主线禁止 synthetic seed；当前 `prisma db seed` 为守门硬失败（防止假闭环），真源数据基线通过“脱敏生产快照导入”提供。

### 1.2 权限与后端（Server Actions，后端强制校验）
- 权限扩展：`lawclick-next/src/lib/permissions.ts`
  - 新增：`approval:create|approve|view_all`、`crm:view|edit`
  - 路由访问控制：新增 `/crm` 与 `/admin` 相关配置（并细化 `/admin/approvals` 对 `SENIOR_LAWYER` 放行）。
- OA 审批：`lawclick-next/src/actions/approval-actions.ts`
  - 支持创建/审批/驳回/撤回；支持案件维度查询 `getApprovalsByCase(caseId)`；审批与可见性后端强制校验。
- 财务：`lawclick-next/src/actions/finance-actions.ts`
  - 发票/收款/费用真实落库；`caseId` 关联时强制 `requireCaseAccess`；修复 `recordPayment` 汇总重复计数问题。
- 合同：`lawclick-next/src/actions/contract-actions.ts`
  - 合同 CRUD + 状态变更；与 Document 关联校验案件一致性；权限与 case scope 强制。
- CRM：`lawclick-next/src/actions/customer-actions.ts`
  - 客户列表分页筛选、详情、创建/编辑、服务记录、标签管理；权限后端强制。

### 1.3 UI（真实联动，无 mock）
- CRM：
  - `/contacts` 不再使用 mock（重定向到真实 CRM）。
  - `/crm/customers`：服务端分页/搜索/筛选 + 新建客户弹窗（真实落库）。
  - `/crm/customers/[id]`：真实“新建案件/服务记录/标签管理/编辑客户”入口；标签与服务记录区域的“添加”按钮均为真实 Dialog（无空按钮）。
- 行政中心（/admin）：
  - `/admin/approvals`：审批中心可创建、审批、驳回、撤回（列表刷新已修复为 props 驱动）。
  - `/admin/finance`：财务中心（发票/收款/费用/合同）；合同状态更新可见性已补齐（调用后 `router.refresh()`）。
- 案件联动（最小闭环）：
  - `CaseBillingTab`：新增子页 `工时/发票/费用/审批/合同`；均真实读取并支持案件内创建入口；收款支持案件内直接记录。
  - `CaseDetailClient`：客户电话/邮箱移除硬编码，显示真实 `caseItem.client.phone/email`。
- 导航：
  - `客户管理` 入口改为 `/crm/customers`；新增 `日程安排` 与 `行政中心（审批/财务）` 分组；导航项按 `canAccessPage` 自动过滤。

## 2. 构建与验证
- 构建通过：`cd lawclick-next && pnpm build`
- 已知构建告警（不阻塞本 TG）：
  - workspace root 推断告警（多 lockfile）
  - Next 提示 middleware 约定弃用（建议后续按 Next 文档迁移到 proxy 约定）

## 3. 手工验收脚本（建议按此走一遍）
1. 启动数据库（Postgres）：确保 `lawclick-next/.env` 的 `DATABASE_URL` 可连通。
2. 迁移与真源数据：
   - `cd lawclick-next && pnpm exec prisma migrate deploy`
   - 导入脱敏生产快照：`pnpm -C lawclick-next restore:snapshot -- --file <path-to-dump> --reset --yes`
3. 启动应用：`cd lawclick-next && pnpm dev`
4. CRM：
   - 打开 `/crm/customers` → 搜索/筛选 → 新建客户 → 刷新仍存在
   - 进入客户详情 `/crm/customers/[id]` → 添加服务记录/标签 → 刷新仍存在
   - 客户详情“一键创建案件” → 跳转案件详情可正常打开
5. 审批中心：
   - `/admin/approvals` → 新建审批（可关联案件）→ 提交后列表可见
   - 以具备审批权限账号：通过/驳回 → 状态更新可见
6. 财务中心：
   - `/admin/finance` → 创建发票/费用/合同 → 列表可见
   - 记录收款 → 发票状态/已收金额变化可见
   - 合同状态下拉更新后可见
7. 案件联动：
   - 进入任一案件详情 `/cases/[id]` → 账务 Tab
   - 分别在“发票/费用/审批/合同”子页创建记录 → 列表立即出现且刷新仍存在
   - 侧边栏客户电话/邮箱显示真实字段（为空显示“未填写”）

## 4. 已知限制（不阻塞本 TG 交付）
- 合同与 Document 的“选择/绑定”UI 尚未提供（后端已具备 `linkContractDocument`，后续增强）。
- 审批的高级流转（草稿提交/改派/转签/多级审批）未纳入本 TG（先保证最小闭环）。
