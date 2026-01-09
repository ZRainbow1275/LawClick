# TG8 子模块：案件账务联动（工时 / 发票 / 费用 / 审批 / 合同）

> 约束：遵循 `prompt/1211架构设计.md`、`.agent/rules/lawclick.md`（无 mock/空壳；权限后端强制；真实落库闭环）。
> 主工程：`lawclick-next/`
> 主模块优先级：以 **案件** 为核心，账务联动是案件业务流的“结算/合规/追溯”辅助闭环。

---

## 1. 背景与问题（为何要做）
当前案件详情页的“账务”Tab 只展示 `TimeLog` 工时统计，缺少 TG8 的关键闭环：
- 案件内无法直接查看/创建 **发票（Invoice）**、**费用（Expense）**、**审批（ApprovalRequest）**、**合同（Contract）**；
- 管理端（`/admin/finance`、`/admin/approvals`）虽已具备入口，但缺少“从案件发起 → 回到案件追溯”的就地工作流；
- 案件侧边栏“客户信息”存在硬编码（电话/邮箱假数据），违反“无假数据”原则。

---

## 2. 目标（必须达成）
### 2.1 功能目标（MVP）
在 `CaseDetail` 的“账务”Tab 内提供 5 个子页，并全部真实落库：
1. **工时**：沿用现有工时统计与明细（`TimeLog` → `billing-actions.ts`）。
2. **发票**：按案件过滤展示发票列表；支持案件内创建发票；支持记录收款（权限后端校验）。
3. **费用**：按案件过滤展示费用列表；支持案件内记录费用（真实落库）。
4. **审批**：按案件过滤展示审批列表；支持案件内创建审批；支持审批人通过/驳回；申请人可撤回。
5. **合同**：按案件过滤展示合同台账；支持案件内创建合同；支持更新合同状态（权限后端校验）。

### 2.2 体验目标
- 案件内创建后应立即在列表出现（避免“创建成功但看不到”的断链路体验）。
- 列表均提供清晰的状态徽章与基础金额汇总信息（最小可读性）。
- UI 展示层只做“可见性提示/按钮隐藏”，**所有写操作权限必须在 actions 层强制**。

---

## 3. 数据与接口（使用现有真实能力，不做新空壳）
### 3.1 既有数据模型（Prisma）
- `TimeLog`（工时）
- `Invoice` / `Payment`（发票/收款）
- `Expense`（费用）
- `ApprovalRequest`（审批；显式 `caseId/clientId` 关联）
- `Contract`（合同；支持与 `Document` 1-1 关联）

### 3.2 既有 Server Actions（必须复用）
- 工时：`src/actions/billing-actions.ts`
  - `getCaseBilling(caseId)` / `getCaseBillingDetails(caseId)`
- 发票/费用/收款：`src/actions/finance-actions.ts`
  - `getInvoices({ caseId })` / `createInvoice({ caseId })` / `updateInvoiceStatus(id,status)` / `recordPayment({ invoiceId })`
  - `getExpenses({ caseId })` / `createExpense({ caseId })`
- 审批：`src/actions/approval-actions.ts`
  - `getApprovalsByCase(caseId)` / `createApprovalRequest({ caseId })` / `approveRequest(id)` / `rejectRequest(id)` / `cancelRequest(id)`
- 合同：`src/actions/contract-actions.ts`
  - `getContracts({ caseId })` / `createContract({ caseId })` / `updateContractStatus(id,status)`

### 3.3 权限边界（后端强制）
- 发票/费用/合同：基于 `billing:*` 权限 + `requireCaseAccess(caseId, ...)` 行级控制。
- 审批：`approval:create|approve` 权限 + case 追溯必须走 `requireCaseAccess`。
- UI 侧仅做按钮级兜底（`usePermission()`），不作为安全边界。

---

## 4. UI 设计（LEGO 思路，最小可用闭环）
### 4.1 入口位置
- 文件：`lawclick-next/src/components/cases/CaseBillingTab.tsx`
- 在案件详情中作为一个 Tab 渲染：`CaseDetailClient` → `CaseBillingTab caseId={caseItem.id}`

### 4.2 结构
- 顶层 Tab：`工时 / 发票 / 费用 / 审批 / 合同`
- 每个子页包含：
  - 左侧：列表（table/cards）
  - 右上：创建入口（Dialog 组件）与刷新按钮

### 4.3 关键交互
- 新建发票/费用/合同/审批后：触发 `onSuccess` 回调刷新本 Tab（避免只靠 `router.refresh()`）。
- 发票项：
  - 收款：使用 `RecordPaymentDialog`（需要 `billing:edit`；发票状态由收款逻辑自动推进）
- 审批项：
  - 申请人：允许撤回（DRAFT/PENDING）
  - 审批人：通过/驳回在 `/admin/approvals` 完成（案件内先保证发起与追溯闭环）
- 合同项：状态更新在 `/admin/finance` 完成（案件内先保证创建与追溯闭环）

---

## 5. DID 实施步骤（必须按序）
### D（Design）
1. 明确案件账务 Tab 真实数据源与权限点（如上）。
2. 补齐 Dialog 组件的 `onSuccess` 回调能力（不破坏现有 admin 页面复用）。

### I（Implement）
1. 重构 `CaseBillingTab`：并行拉取五类数据，按子页展示。
2. 新增案件内“创建审批”对话框组件（固定 caseId，不允许 mock）。
3. 修复案件侧边栏“客户信息”使用 `caseItem.client.email/phone`，移除硬编码。

### D（Deliver）
1. 本地验收：按“验收清单”逐项操作并截图/记录。
2. `pnpm -C lawclick-next build` 通过。
3. 产出验收记录：`docs/TG8_行政ERP-OA_客户管理_验收记录.md`；并更新 `docs/1211_架构落地开发总计划_v1.md`、`2_active_task.md`、`0_archive_context.md`。

---

## 6. 验收清单（可执行）
以 Lawyer/Partner/Admin 任一具备权限账号登录：
1. 打开任一案件详情 → 进入“账务”：
   - 工时子页有统计与明细（无报错）。
2. 发票子页：
   - 点击“创建发票”→ 提交后列表立刻出现新发票。
   - 若具备 `billing:edit`：可记录收款并看到已收金额变化/状态变化。
3. 费用子页：
   - 点击“记录费用”→ 提交后列表立刻出现新费用。
4. 审批子页：
   - 点击“新建审批”→ 提交后列表立刻出现；申请人可撤回。
   - 若当前用户具备审批权限：在 `/admin/approvals` 可通过/驳回并回写到案件追溯列表。
5. 合同子页：
   - 点击“创建合同”→ 提交后列表立刻出现。
   - 若具备 `billing:edit`：可更新合同状态并立刻反映。
6. 侧边栏客户信息：
   - 电话/邮箱显示为真实 contact 字段；为空时展示“未填写”而非假数据。

---

## 7. 不做项（本子模块明确不做）
- 合同与 Document 的选择/绑定 UI（已具备后端能力 `linkContractDocument`，但 UI 放到后续增强）。
- 审批 DRAFT 的“提交/改派/转签”等高级流转（先保证最小闭环）。
- 财务统计大屏（案件维度应收/已收/逾期聚合）——后续在 TG9+ 统一做可视化增强。
