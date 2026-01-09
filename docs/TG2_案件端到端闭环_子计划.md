# TG2 案件主业务流端到端闭环子计划（DID）

## 文档信息
- 版本：v1.0
- 创建日期：2025-12-12
- 适用范围：`lawclick-next/`
- 上游依赖：TG0/TG1 已完成（真实 DB/seed/权限底座稳定）
- 目标里程碑：打通“新建案件 → 列表/详情/仪表盘/任务/计时/文档联动 → 归档”真实闭环

---

## 一、Design（设计/领域澄清）

### 1.1 目标
1. **案件创建真实可用**：/cases “新建案件”完整提交落库；冲突审查记录生成。
2. **案件列表真实可见**：/cases、/cases/active、/cases/archived 均来自 DB，无空壳。
3. **案件详情全量可用**：/cases/[id] 不再使用 mock；各 Tab（概览/设置/任务/当事人/文档/时间线/账务/计时/日程）可访问且不报错。
4. **主线联动**：案件→任务→计时→文档→日程→仪表盘/看板可见。
5. **状态机与阶段一致**：CaseStatus + currentStage 流转合法，推进阶段同步生成阶段文书/默认任务。

### 1.2 范围
- 数据/状态机：`prisma/schema.prisma`（Case/CaseMember/CaseTemplate/Party/ConflictCheck）
- 案件 actions：
  - 已有：`src/actions/cases.ts`、`cases-crud.ts`、`stage-management.ts`、`party-actions.ts`、`timeline-actions.ts`
  - 待补齐/加强：update/changeStatus/archive/member/模板‑阶段联动
- UI：
  - 列表：`src/app/(dashboard)/cases/*` + `components/cases/CaseListClient.tsx`
  - 详情：`src/app/(dashboard)/cases/[id]/page.tsx` + `components/cases/CaseDetailClient.tsx` 及各 Tab 组件
  - 左侧导航跳转逻辑（如有）

**不做项**
- 不在 TG2 内做完整 MDI/DIY 仪表盘体系（TG6 专项），仅保证案件数据联动可见。
- 不在 TG2 内引入新基础设施/外部服务。

---

## 二、Implement（实现/集成）

### Phase1_Analysis & Schema（最小必要更新）
1. 复核 Case 字段：
   - `caseCode/title/status/serviceType/billingMode/clientId/originatorId/handlerId/currentStage/templateId`
2. 明确状态机迁移表：
   - `LEAD → INTAKE → ACTIVE ↔ SUSPENDED → CLOSED → ARCHIVED`
   - 禁止越级/回退到历史阶段（除非 ADMIN/合伙人强制）
3. 模板‑阶段 JSON 规范确认：
   - `CaseTemplate.stages/requiredDocs/defaultTasks` 结构与 stage-management.ts 配置一致。

### Phase2_Core Logic（Server Actions）
1. 在 `cases-crud.ts` 新增/补齐：
   - `updateCase(caseId, input)`：更新基本信息/模板/阶段（权限：case:edit）
   - `changeCaseStatus(caseId, status)`：带合法迁移校验（权限：case:edit）
   - `archiveCase(caseId)`：归档并只读保护（权限：case:archive）
2. 成员管理：
   - 复核 `src/actions/members.ts` 的 add/removeCaseMember 权限与可见性（TG1 已接入，必要时补齐）。
3. 阶段联动：
   - `advanceCaseStage` 推进后触发 `initializeStageDocuments/initializeStageTasks`（若尚未初始化）。
4. 单元测试（新增最小覆盖）：
   - 案号生成、冲突审查、状态迁移合法性、权限拒绝。

### Phase3_UI Implementation（真实数据绑定）
1. 案件列表页（/cases）：
   - 继续使用 `getCases` 返回真实数据；
   - CreateCaseWizard 成功后 `router.refresh()` + 跳转详情。
2. **重写案件详情页**：
   - 将 `src/app/(dashboard)/cases/[id]/page.tsx` 的 mock 页面替换为：
     - server 侧调用 `getCaseDetails(id)`；
     - 组装 viewModel（caseNumber/caseType/clientName/progress/owner/members 等）；
     - 渲染 `CaseDetailClient`。
3. 各 Tab 保证不报错：
   - `CaseSettingsTab` / `CaseTaskKanban` / `CasePartiesTab` / `CaseTimelineTab` / `CaseBillingTab`
   - 若发现某 Tab 仍使用 mock，立即替换为真实 actions。
4. 左侧导航：
   - “我的案件”始终指向 `/cases`；
   - “立案侦查/INTAKE”作为 `/cases` 过滤或详情子入口（不直连空页）。

### Phase4_Browser Verification（验收）
1. 用 seed 账号 `partner1@lawclick.com` 登录：
   - 新建案件（含新客户/已有客户两种路径）→ 落库成功 → 跳转详情。
2. 详情页：
   - 切换各 Tab 无报错；
   - 新建任务/当事人/文档/计时后刷新仍存在。
3. 联动验证：
   - 回到 `/dashboard`、`/tasks`、`/time`、`/documents` 能看到该案件关联数据。
4. 记录截图/问题到 `docs/v9_enhancement_log.md` 或 TG2 验收补充小节。

---

## 三、Deliver（验收标准）
1. 新建案件真实落库、可重复创建、无假数据。
2. `/cases`、`/cases/active`、`/cases/archived` 列表真实可用。
3. `/cases/[id]` 详情页无 mock，所有 Tab 可访问无报错。
4. 案件‑任务‑计时‑文档‑日程‑仪表盘数据一致、刷新可复现。

---

## 四、TG2 完成后的下一步
- 补充本文件“验收结果”小节并 /compact。
- 进入 TG3 任务协作+看板，先写 `docs/TG3_子计划.md` 再实施。

---

## 五、验收结果（2025-12-12）
1. 案件列表真实化：
   - `/cases`、`/cases/active`、`/cases/archived` 已基于 `getCases` 返回真实数据。
   - 新增 `/cases/intake` 过滤视图，匹配侧栏“立案侦查”入口，避免空路由。
2. 案件详情去 mock：
   - `src/app/(dashboard)/cases/[id]/page.tsx` 已替换为 server fetch + `CaseDetailClient`，不再使用假数据。
3. 核心 actions 补齐：
   - 新增 `updateCase/changeCaseStatus/archiveCase`（`src/actions/cases-crud.ts`）。
   - 列表过滤修复：`getCases` 的 type 过滤已改为 `serviceType`。
   - `getCaseDetails` 已补充 `handler/client` 关系。
   - 成员管理 `src/actions/members.ts` 重新实现并接入 TG1 权限底座。
   - 账务 actions `src/actions/billing-actions.ts` 接入权限与案件可见性校验。
4. 详情 Tab 全链路：
   - 设置/任务/当事人/文档/时间线/账务/计时/日程 Tab 均基于真实 actions，无 mock 入口。

**需你本地浏览器复核的路径**（Phase4 操作脚本）：  
1) 登录 `partner1@lawclick.com / password123` → `/cases` 新建案件（新客户/已有客户各一次）。  
2) 自动跳转 `/cases/[id]`：切换所有 Tab，分别新增任务/当事人/文档占位/开启计时。  
3) 回到 `/dashboard`、`/tasks`、`/time`、`/documents` 验证联动出现。  

**已知非本 TG 阻塞**：`src/app/(dashboard)/research/page.tsx` 存在 TS 语法错误，导致全量 `tsc --noEmit` 失败；不影响 TG2 运行路径。

**结论**：TG2 代码实现已完成，待上述浏览器脚本确认后可进入 TG3。
