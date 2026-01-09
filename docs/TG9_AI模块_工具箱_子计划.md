# TG9 AI 模块 & 工具箱（最后落地）子计划（DID）
> 约束：遵循 `prompt/1211架构设计.md`、`.agent/rules/lawclick.md`（无 mock/空壳；MDI + LEGO；权限必须后端校验；真实落库闭环；文档/任务清单中文）。  
> 主工程：`lawclick-next/`  
> 核心原则：以主模块（案件/项目）为核心，以业务流（案件 → 任务 → 计时 → 文档 → 日程/看板 → 行政/财务 → 复盘）为主线，AI 与工具箱作为“放大器”必须可追溯/可审计。

## 0. 背景与当前缺口（必须先修）
当前仓库已存在 AI 与工具箱的“雏形”，但存在明显断链与违规点，需要在 TG9 一次性收敛为“可用且可审计”的最小闭环：
1. **AI Key 存在 mock fallback**：`OPENAI_API_KEY` 缺失时使用 `"sk-mock-key"`，会导致不可控的错误体验与“假配置”风险。
2. **AI 缺少审计链**：对话虽可落库（`AIConversation`），但每次 AI 调用缺少 `model/provider/输入输出/错误/上下文来源/tokenUsage` 等审计字段。
3. **AI 无业务上下文联动**：浮窗 AI 不能从案件/文档/审批/财务等业务节点携带上下文打开，无法体现“AI 驱动业务流”。
4. **文档 AI 审查页是静态假数据**：`/documents/[id]/review` 当前展示固定合同正文与固定“AI意见”，违背“无假数据/无空壳”原则。
5. **工具箱 UI 未接入数据库**：已有 `ToolModule` 与 `tool-actions.ts`，但 `/tools` 仍是静态计算器/链接，未展示 DB 模块。
6. **工具箱权限与安全缺失**：
   - `create/update/deleteToolModule` 仅校验登录，任何用户可管理模块（权限违规）。
   - `triggerModuleWebhook` 可向任意 URL 发起请求，存在 SSRF/误触发风险；且缺少调用审计落库。

## 1. 目标与验收（MVP：完整可用）
### 1.1 目标（必须实现）
**A. AI 会话（可落库/可回放/可追溯）**
1. 仅保留一套“官方 AI 助手”（浮窗/MDI），消除重复入口与无持久化版本，避免“两个助手谁是真的”的困惑。
2. AI 对话会话持久化：
   - 会话列表/详情可回放；
   - 支持绑定业务上下文（至少：`caseId`、`documentId`、`approvalId`、`invoiceId/expenseId/contractId` 任选其一或多选）。
3. AI 后端强制权限：
   - 任何携带 `caseId` 的会话/上下文必须 `requireCaseAccess(caseId)`；
   - `documentId` 必须验证所属 `caseId` 再走 `requireCaseAccess`；
   - 审批/财务对象同理（先取记录 → 推导 caseId/clientId → enforce）。
4. AI 审计落库：
   - 每次 AI 调用均写入 `AIInvocation`（或等价模型），包含：`userId`、`conversationId?`、`context(Json)`、`prompt/response`、`model/provider`、`status/error`、`tokenUsage(Json)`、时间戳。
5. 配置缺失可预期：
   - 未配置 `OPENAI_API_KEY` 时必须**短路返回明确错误**（不发起外部请求），并仍记录一次失败审计（用于运维排查）。

**B. AI 文档审查/分析（替换假页面，形成真实闭环）**
1. `/documents/[id]/review` 改为真实读取文档（标题/案件/版本/备注等）并基于真实内容进行审查：
   - 内容来源（MVP）：`document.notes` 或“用户粘贴文本”二选一；
   - 分析类型：`summary/keypoints/risks/timeline`；
   - 结果展示（右侧面板）并落库审计（`AIInvocation`）。
2. 可选增强（MVP 内做一项即可）：
   - 将 `summary` 类型结果写回 `Document.summary`（形成“AI 驱动文档沉淀”）。

**C. 工具箱（DB 驱动 + 可配置 + 安全可审计）**
1. `/tools` 页面新增“工具模块”Tab：
   - 从 DB 读取 `ToolModule`（按 `category` + `sortOrder` 分组排序）；
   - 支持打开 `url`（外链）；
   - 支持触发 `webhookUrl`（N8N 接入）。
2. 工具模块管理（管理员功能）：
   - 仅 `PARTNER/ADMIN`（或具备 `tools:manage` 权限者）可创建/编辑/停用/删除/排序模块；
   - 普通用户仅能看到 `isActive=true` 的模块。
3. Webhook 安全策略（后端强制）：
   - 仅允许 `https`；
   - 必须命中 allowlist（建议 env：`TOOL_WEBHOOK_ALLOWLIST`，以逗号分隔域名/后缀）；
   - 明确禁止 `localhost/127.0.0.1/私网 IP` 等高风险目标。
4. 工具调用审计落库：
   - 每次 webhook 调用写 `ToolInvocation`（userId/moduleId/payload/response/status/error/createdAt）。

### 1.2 验收脚本（必须可复现）
1. 以 `lawyer1@lawclick.com` 登录：
   - 进入任意案件详情 `/cases/[id]` → 点击「AI 助手」→ 浮窗展示“案件上下文”徽章 → 发送消息 → 刷新页面 → 会话可回放；
   - 数据库中存在对应 `AIInvocation` 记录（status SUCCESS 或 ERROR）。
2. 文档 AI 审查：
   - 进入 `/documents` 列表 → 点击某文档「AI 审查」→ 页面展示真实文档信息（不再出现静态合同正文/静态意见）；
   - 选择分析类型=风险识别，内容来源=文档备注或粘贴文本 → 获得结果并展示；
   - `AIInvocation` 落库；若选择 summary 且启用写回，则 `Document.summary` 更新。
3. 工具箱：
   - `/tools` → “工具模块”Tab 展示来自 DB 的模块（非静态数组）；
   - 普通用户仅见启用模块；管理员进入管理 Tab 可新增模块并停用一个模块，普通用户刷新后不可见；
   - 触发 webhook：若 URL 不满足 allowlist/安全策略，应明确拒绝并记录失败 `ToolInvocation`。
4. 工程校验：`pnpm -C lawclick-next build` 通过。

## 2. 明确不做项（防止范围失控）
1. **不做完整 RAG/向量检索**（`pgvector/embeddings` 暂不启用；仅预留未来扩展点）。
2. **不做 PDF/DOCX 自动抽取全文**（MVP 先基于 `notes/粘贴文本`；后续可引入提取服务/队列）。
3. **不做多 AI Provider 编排**（仅提供 OpenAI/兼容 baseURL；未来再接入多模型路由）。
4. **不做复杂的“逐条高亮合同定位”**（先返回结构化建议列表；后续再做段落定位与批注）。

## 3. 设计（Design）
### 3.1 数据与领域模型（Schema）
1. `AIConversation` 扩展：
   - 新增 `context Json?`（通用上下文：caseId/documentId/taskId/approvalId/invoiceId/expenseId/contractId 等）。
   - 保留现有 `caseId` 字段以兼容旧数据；未来逐步迁移到 `context`。
2. 新增 `AIInvocation`：
   - `userId`、`conversationId?`、`context Json?`、`prompt String`、`response String?`
   - `provider String`、`model String`、`status Enum(SUCCESS/ERROR)`、`error String?`、`tokenUsage Json?`
3. 新增 `ToolInvocation`：
   - `userId`、`toolModuleId`、`payload Json?`、`response Json?`、`status Enum(SUCCESS/ERROR)`、`error String?`
4. 可选：为审计表增加必要索引（userId/toolModuleId/conversationId/createdAt）。

### 3.2 权限模型（后端强制）
在 `src/lib/permissions.ts` 增加权限键并映射到角色：
- `ai:use`：允许使用 AI（内部员工默认允许，CLIENT 禁止）。
- `tools:manage`：允许管理 ToolModule（PARTNER/ADMIN）。
- `admin:audit`：已存在，用于审计日志页面（若 TG9 内落地 UI）。

### 3.3 Actions/API 设计（单一真源 + 可审计）
**AI Actions（src/actions/ai-actions.ts）**
1. `createConversationWithContext(context)`：落库 `AIConversation(context, caseId?)`，并做上下文权限校验。
2. `getAIContextSnapshot(context)`：从 DB 拉取最小必要字段拼出 system context（避免 token 爆炸），并权限校验。
3. `chatWithAIEnhanced({ message, conversationId, context })`：
   - 校验登录 + `ai:use`；
   - 生成 system prompt + history；
   - 通过 OpenAI 调用；
   - 追加消息到会话；
   - 写入 `AIInvocation`（含 success/error）。
4. `analyzeDocumentById({ documentId, analysisType, contentSource, pastedText? })`：
   - 校验 `document:view` + case access；
   - 组织 prompt 调用 AI；
   - 写 `AIInvocation`；可选写回 `Document.summary`。

**Tool Actions（src/actions/tool-actions.ts）**
1. `getToolModules(category?)`：仅返回 `isActive=true`（普通用户）；管理员可选返回全部。
2. `create/update/deleteToolModule`：强制 `tools:manage`。
3. `triggerModuleWebhook(moduleId, payload)`：
   - 校验登录；
   - 校验模块存在且启用；
   - 校验 webhookUrl 安全策略（https + allowlist + 禁止私网）；
   - 触发后写 `ToolInvocation`（success/error + response）。

### 3.4 UI 设计（业务流入口优先）
1. **统一 AI 入口**：仅保留“浮窗 AI（MDI Window）”，由 Header + 业务页面按钮打开；移除旧的右下角独立 AI 组件。
2. **上下文联动**：
   - 案件详情：按钮「AI 助手（本案）」→ 打开浮窗并携带 `{ caseId }`；
   - 文档详情：按钮「AI（本文档）」→ 携带 `{ documentId }`；
   - 审批/财务：在详情卡片/弹窗提供「AI 辅助」→ 携带相应 id（可推导到 caseId）。
3. **工具箱**：
   - Tab：计算器 / 工具模块 / 常用链接 /（可选）管理；
   - 管理 Tab 仅管理员可见：CRUD + 启停 + 排序。
4. **审计 UI（可选增强）**：
   - `/admin/audit` 最小列表：AIInvocation + ToolInvocation（按时间倒序/分页/筛选）。

## 4. 实现步骤（Implement）
### 4.1 Phase A：Schema & Migration & 数据基线（禁止 seed 造数）
1. 更新 `lawclick-next/prisma/schema.prisma`（新增模型与字段/枚举）。
2. 生成迁移（仅开发时）：`pnpm -C lawclick-next exec prisma migrate dev --name <name>`
3. 应用迁移（可复现）：`pnpm -C lawclick-next exec prisma migrate deploy`
4. 数据基线：不在 seed 里造数；`ToolModule` 等配置来自脱敏生产快照或由管理员在 `/tools` 管理 Tab 创建（真实落库）。

### 4.2 Phase B：后端 Actions（先做权限/安全/审计）
1. 重构 `ai-actions.ts`：移除 mock key fallback；补权限；落库 `AIInvocation`；增加基于 context 的快照生成。
2. 增强 `tool-actions.ts`：补 `tools:manage` 权限；增加 webhook allowlist 校验；落库 `ToolInvocation`。
3. 更新 `permissions.ts`：新增权限键；补 `/tools` 页面访问配置。

### 4.3 Phase C：UI（真实绑定 + LEGO 化）
1. 浮窗 AI：支持展示上下文徽章/标题；创建或绑定会话；发送消息时携带 context。
2. 业务页面入口：案件/文档/审批/财务页面新增“AI 助手”按钮，打开浮窗并携带 context。
3. 文档 AI 审查页：替换静态内容为真实读档 + 真实调用 + 结果展示。
4. 工具箱页：从 DB 渲染 ToolModule；管理员管理 Tab（CRUD/启停/排序）。

## 5. 交付与归档（Deliver）
1. 迁移与真源数据：`pnpm -C lawclick-next exec prisma migrate deploy`；如需可见历史数据，导入脱敏生产快照：`pnpm -C lawclick-next restore:snapshot -- --file <path-to-dump> --reset --yes`。
2. 按 1.2 验收脚本逐条验证并记录截图/日志。
3. 工程校验：`pnpm -C lawclick-next build`。
4. 文档归档：
   - 验收记录：`docs/TG9_AI模块_工具箱_验收记录.md`
   - 更新：`docs/1211_架构落地开发总计划_v1.md`、`2_active_task.md`、`0_archive_context.md`
