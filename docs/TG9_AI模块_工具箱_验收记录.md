# TG9 AI 模块 & 工具箱（最后落地）验收记录

> 对应子计划：`docs/TG9_AI模块_工具箱_子计划.md`  
> 约束：遵循 `prompt/1211架构设计.md`、`.agent/rules/lawclick.md`（无 mock/空壳；权限后端强制；真实落库闭环；可追溯可审计）。

## 0. 验收结论（摘要）
- 通过：代码层完成 TG9 最小闭环（AI 上下文联动 + 审计落库；工具箱 DB 驱动 + 管理 + Webhook 安全策略）。
- 构建验证：`pnpm -C lawclick-next build` 已通过。
- 注意：本环境未能连通本地 Postgres（`127.0.0.1:5434`），因此**未实际执行 migrate/seed**；但已补齐迁移文件与种子脚本，需在数据库可用时执行。

## 1. 变更清单（按业务能力）
### 1.1 AI 模块（可追溯/可审计）
- 统一 AI 助手入口：移除旧的右下角独立 AI 组件，保留并强化浮窗 AI（MDI Window）。
- AI 上下文：支持从案件/文档/审批/财务等模块打开 AI，并将上下文写入会话与审计表。
- AI 审计：新增 `AIInvocation`，每次对话/文档分析都会写入 `prompt/response/model/provider/status/error/tokenUsage/context`。
- 文档 AI 审查页：`/documents/[id]/review` 已替换静态假数据，基于真实文档（notes/粘贴文本）调用 AI，并展示结果与审计历史。

### 1.2 工具箱（DB 驱动 + 安全）
- `/tools` 改为 DB 驱动：新增“工具模块”Tab，读取 `ToolModule` 分组展示（link/external 等）。
- 管理能力：`tools:manage`（PARTNER/ADMIN）可在 `/tools` 的“管理”Tab 中 CRUD/启停/排序。
- Webhook 安全：仅允许 `https` + `TOOL_WEBHOOK_ALLOWLIST` 命中域名；并阻断 localhost/私网 IP/解析到私网等 SSRF 风险。
- 工具调用审计：新增 `ToolInvocation`，每次 webhook 调用均落库（含 payload/response/status/error）。

## 2. 数据库与环境准备（必须）
### 2.1 启动依赖（Docker）
`lawclick-next/docker-compose.yml`：Postgres(5434) + MinIO(9000/9001)。

### 2.2 环境变量
文件：`lawclick-next/.env`
- `OPENAI_API_KEY`：未配置或为占位值时，AI 会明确提示“未配置”，并写入 ERROR 审计（不会发起外部请求）。
- `TOOL_WEBHOOK_ALLOWLIST`：为空时默认拒绝所有 webhook（安全默认）；示例：
  - `TOOL_WEBHOOK_ALLOWLIST=example.com,*.n8n.cloud,n8n.yourdomain.com`

## 3. 迁移与真源数据（必须落库）
在数据库可连接时执行：
1. Prisma 生成（已执行过也可跳过）：`pnpm -C lawclick-next exec prisma generate`
2. 迁移：`pnpm -C lawclick-next exec prisma migrate deploy`
3. 真源数据（可选但推荐）：导入脱敏生产快照：`pnpm -C lawclick-next restore:snapshot -- --file <path-to-dump> --reset --yes`

期望数据：
- `ToolModule` 至少存在若干条可用模块（来源：脱敏快照；或由管理员在 `/tools` 管理 Tab 手工创建）。

## 4. 手工验收脚本（逐条执行）
### 4.1 AI：案件上下文对话 + 审计
1. 登录：`lawyer1@lawclick.com / password123`
2. 打开案件详情：`/cases/[id]`
3. 点击「AI 助手」按钮（右上角操作区）
4. 在浮窗中确认出现“案件上下文”徽章
5. 发送任意问题（例如“请给出本案下一步工作建议”）
6. 预期：
   - 浮窗返回回答（或在未配置 key 时提示未配置）
   - `AIConversation` 中 messages 被追加
   - `AIInvocation` 新增一条记录（SUCCESS/ERROR 均可）

### 4.2 AI：文档审查页替换静态假数据 + 审计历史
1. 进入：`/documents`
2. 任意文档点击「AI审查」
3. 预期页面展示真实文档信息（标题/版本/关联案件），不再出现固定合同正文与固定“AI意见”
4. 选择：
   - 分析类型 = `risks`
   - 内容来源 = `notes`（若 notes 为空则选择 `pasted` 粘贴文本）
5. 点击「生成 AI 审查结果」
6. 预期：
   - 右侧出现输出结果（或未配置 key 的明确提示）
   - 下方“审计记录（最近20次）”出现新条目，并可点击回放 response
   - 数据库 `AIInvocation` 新增一条 type=DOCUMENT_ANALYSIS 的记录，context.documentId=当前文档 id

### 4.3 工具箱：DB 模块展示 + 管理权限
1. 进入：`/tools`
2. 打开「工具模块」Tab
3. 预期：
   - 展示来自 DB 的模块（非静态数组），按 category 分组
4. 切换管理员账号：`partner1@lawclick.com / password123`
5. 打开「管理」Tab
6. 预期：
   - 可新建模块、启停模块、删除模块
   - 普通用户刷新后仅能看到 `isActive=true` 的模块

### 4.4 工具箱：Webhook 安全策略 + 审计
1. 在管理员下为某模块配置 `webhookUrl=https://...`
2. 如 allowlist 未配置或域名不匹配，预期：
   - UI 提示“域名不在 allowlist 中”
   - `ToolInvocation` 写入 ERROR 记录（便于审计排查）

## 5. 构建验证
- 已通过：`pnpm -C lawclick-next build`

## 6. 已知限制/后续增强（不影响 TG9 验收）
- 未做文件全文抽取（PDF/DOCX → 文本）：当前文档 AI 以 `notes/粘贴文本` 为内容源（MVP）。
- 未做向量检索/RAG：已在架构层预留（后续若启用 pgvector 再落地）。
