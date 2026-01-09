# 13 维度审计修复记录（AI + 国际化）_2026-01-06

> 参照：`docs/批判性13维度深度审计报告_2026-01-06.md`
>
> 本轮约束：
> 1) **忽略 CI/CD 配置**（不在本轮实现）  
> 2) **重点完善 AI 功能、国际化（i18n）**  
> 3) **不升级 Prisma 版本**（仅做 schema/迁移与业务代码修复，不改 `package.json` 版本）  
>
> 主线范围：`lawclick-next/`（Next.js App Router + Prisma）。Rust 原型仅作为“潜在不一致风险”对照，不做主线交付。

---

## 1. AI：从“空壳”到可用闭环

### 1.1 数据模型与 Tenant 隔离（生产对齐）

- 目标：AI 会话/调用审计必须 **tenant-scoped**，避免跨租户读取/写入风险，并纳入 `tenant-scope-guard` 自动校验。
- 落地：
  - `AIConversation`、`AIInvocation` 增加 `tenantId` 作用域与索引（含查询路径优化）。
  - 迁移文件：`lawclick-next/prisma/migrations/20260106071753_add_ai_tenant_scope/migration.sql`
  - 通过审计门禁：`pnpm --filter lawclick-next audit:tenant-scope`

### 1.2 Provider 抽象 + OpenAI 接入（可扩展）

- 目标：避免把 UI/Action 绑定到单一 SDK，支持后续扩展 Azure/Anthropic 等。
- 核心实现目录：`lawclick-next/src/lib/ai/`
  - `ai-env.ts`：AI_PROVIDER/OPENAI_* 环境变量解析（Zod 校验、server-only）
  - `ai-schemas.ts`：消息/上下文等结构定义（用于强类型与 Zod 边界）
  - `ai-types.ts`：Provider 接口与通用返回类型
  - `ai-service.ts`：统一入口（屏蔽不同 provider 的差异）
  - `openai-provider.ts`：OpenAI 实现（错误映射、token usage 统计、server-only）

### 1.3 Server Actions：权限 + Zod + 限流 + 审计落库（全链路）

- 目标：严格输入校验、统一错误语义、统一限流策略，并把每次调用落库可追溯（AIInvocation）。
- Actions（均为真实后端逻辑，不做 mock）：
  - `lawclick-next/src/actions/ai-actions.ts`
    - `getAiStatus`：配置/模型/最近调用信息
    - `listAiConversations`/`getAiConversation`：会话列表与详情
    - `createAiConversation`：创建会话（写库）
    - `sendAiChatMessage`：对话（写库 + 调用 provider + 写 AIInvocation）
    - `aiGenerateDocumentDraft`：生成草稿（写 `Document` + 写 AIInvocation）
  - `lawclick-next/src/actions/ai-case-options.ts`：AI 草稿生成用案件搜索（权限与 Zod）
  - `lawclick-next/src/actions/ai-invocations.ts`：调用审计列表（分页/过滤）
- 门禁：
  - 限流覆盖：`pnpm --filter lawclick-next audit:action-rate-limit-coverage`（missing=0）
  - Actions ↔ UI 覆盖：`pnpm --filter lawclick-next audit:actions-ui`（unreferenced=0）
  - Actions UI 调用覆盖：`pnpm --filter lawclick-next audit:actions-ui-invocations`（UI-invoked=233）

### 1.4 UI：/ai 工作台（LEGO/便当盒）+ 真实入口

- 目标：提供可操作的 AI 工作台，并遵循全站 LEGO 化（SectionWorkspace 可拖拽组合）。
- 路由：`lawclick-next/src/app/(dashboard)/ai/page.tsx`
  - 使用 `SectionWorkspace` 组织 4 个面板：会话列表 / 对话 / 草稿生成 / 调用审计
  - 权限不足时返回 i18n 化提示（`common.noPermission`）
- 组件：
  - `lawclick-next/src/components/ai/AiWorkspaceProvider.tsx`：统一状态容器（状态刷新/会话打开/发送消息）
  - `lawclick-next/src/components/ai/AiConversationListPanel.tsx`：会话列表 + 新建会话（真实调用 `createAiConversation`）
  - `lawclick-next/src/components/ai/AiChatPanel.tsx`：聊天输入/消息展示（真实调用 `sendAiChatMessage`）
  - `lawclick-next/src/components/ai/AiDraftGeneratorPanel.tsx`：案件选择 + 草稿生成（真实写入 `Document`）
  - `lawclick-next/src/components/ai/AiInvocationLogPanel.tsx`：调用审计列表（可按会话过滤）

### 1.5 未配置时的行为（可预期降级）

- 环境变量读取：`lawclick-next/src/lib/ai/ai-env.ts`
  - `OPENAI_API_KEY` 为空时：`isAiConfigured()` 返回 false
- UI：Header 面板会显示 Not configured；Actions 会返回业务语义错误（不泄漏底层堆栈）。

---

## 2. 国际化（i18n）：从 0 到基础设施 + 偏好闭环

### 2.1 next-intl 集成（cookie 方案）

- Next 配置：`lawclick-next/next.config.ts`
- request config：`lawclick-next/src/i18n/request.ts`
  - 从 cookie `locale` 读取语言；非法值回退 `zh-CN`
  - messages 动态加载失败时写入统一 logger 并回退默认语言
- routing/locales：`lawclick-next/src/i18n/routing.ts`、`lawclick-next/src/i18n/locales.ts`

### 2.2 Root Layout Provider

- `lawclick-next/src/app/layout.tsx` 注入 `NextIntlClientProvider`，全站可用 `useTranslations/getTranslations`
- 文案资源：
  - `lawclick-next/messages/zh-CN.json`
  - `lawclick-next/messages/en-US.json`

### 2.3 语言偏好闭环（DB + cookie）

- 偏好结构：`lawclick-next/src/lib/ui/app-preferences.ts`（新增 `locale`）
- 设置更新：
  - `lawclick-next/src/actions/ui-settings.ts`：更新 `locale` 时写 cookie（`locale`）
  - `lawclick-next/src/components/layout/UiPreferencesProvider.tsx`：locale 变更后 `router.refresh()` 使 RSC 重新取 messages

### 2.4 AI 模块全量双语化（含 toast）

- 新增 `ai.toast` 文案段，覆盖：
  - 会话创建/加载/打开/发送失败
  - 草稿生成校验与失败/成功提示（含 `{documentId}` 插值）
  - 调用审计加载失败
- AI 工作台中不再出现硬编码中文 toast；在 `zh-CN/en-US` 下均显示对应语言。

---

## 3. 一致性与治理（本轮相关门禁）

- 权限同步：`ai:use` 在 TS 与 Rust 双端保持一致  
  - `pnpm --filter lawclick-next audit:permissions-sync`（missing/extra=0）
- tenant-scope：AIConversation/AIInvocation 已纳入 guard targets  
  - `pnpm --filter lawclick-next audit:tenant-scope`（OK）
- 错误/日志：统一 logger，避免生产 `console.error` 与底层错误泄露  
  - `pnpm --filter lawclick-next audit:error-logging`（findings=0）

---

## 4. 回归验证（可复现证据）

### 4.1 质量门禁

- `pnpm --filter lawclick-next type-check` ✅
- `pnpm --filter lawclick-next lint` ✅

### 4.2 审计脚本（输出在 `docs/_artifacts/`）

- `docs/_artifacts/action_rate_limit_coverage_audit_2026-01-06.md`（missing=0）✅
- `docs/_artifacts/error_logging_audit_2026-01-06.md`（findings=0）✅
- `docs/_artifacts/i18n_l10n_audit_2026-01-06.md`（candidates=0）✅
- `docs/_artifacts/lego_coverage_audit_2026-01-06.md` ✅
- `docs/_artifacts/actions_ui_invocation_audit_2026-01-06.md`（UI-invoked=233）✅

---

## 5. 明确不在本轮范围（避免范围蔓延）

- CI/CD（按要求忽略）。
- a11y 增强、大型文件拆分、N+1 查询审查：审计矩阵为 P2，可后续分专项推进，避免与本轮 AI/i18n 主目标互相干扰。

