# 律时 (LawClick) Web 主线后端口径文档（v3.1）

## 0. 主线声明（防止架构口径漂移）
- **Web 主线**：`lawclick-next/`（Next.js App Router + Server Actions + Prisma/Postgres + MinIO(S3)）。
- **非主线**：仓库根目录 `src/` Rust（Axum/SeaORM）为原型/实验分支，不作为当前 Web 主线后端，不纳入 Web 门禁；对外不承诺 `/api/v1/*`。

> [!IMPORTANT]
> Web 主线不使用 `/api/v1/*` REST 体系；业务读写以 **Server Actions** 为真源。

## 1. 后端交互方式
### 1.1 Server Actions（主真源）
- 目录：`lawclick-next/src/actions/*`
- 约束：**所有输入必须 Zod runtime 校验**（`safeParse` + `.strict()`），禁止隐式信任 TS 类型。
- 权限：必须在服务端执行 `requirePermission(...)` / `requireCaseAccess(...)`，禁止前端“靠隐藏按钮”当权限。

### 1.2 认证方式
- 框架：NextAuth.js v5（Auth.js）
- 会话：Server-side session（非 Bearer JWT）
- Provider：Credentials（邮箱/密码）

### 1.3 数据与存储
- ORM：Prisma
- 数据库：PostgreSQL
- 文件存储：MinIO（S3 兼容）
  - 真源接口：`lawclick-next/src/lib/s3.ts`（`StorageProvider`）
  - Bucket 不允许“默认值 + 吞错创建”，缺配置必须显式失败（生产对齐）。

## 2. 关键模块入口（非穷举）
> 说明：这里列出“对外可被页面调用”的关键入口文件与典型函数，完整列表以代码为准。

- 认证：`lawclick-next/src/actions/auth.ts`（`registerUser` / `requestPasswordReset` / `resetPassword`）
- 案件：`lawclick-next/src/actions/cases-crud.ts`（`createCase` / `updateCase` / `changeCaseStatus` / `getClientsForSelect` / `getLawyersForSelect` 等）
- 任务：`lawclick-next/src/actions/tasks-crud.ts`（`createCaseTask` / `updateTask` / `moveTaskOnKanban` / `reorderTasks` 等）
- 工时：`lawclick-next/src/actions/timelogs-crud.ts`（计时状态机 + 列表/汇总 + 审批）
- 文档：`lawclick-next/src/actions/documents.ts`（上传/版本链/元数据/标签/删除）
- 日程：`lawclick-next/src/actions/event-actions.ts`
- 通知：`lawclick-next/src/actions/notification-actions.ts`
- 全局搜索：`lawclick-next/src/actions/search-actions.ts`
- 聊天：`lawclick-next/src/actions/chat-actions.ts`
- AI：`lawclick-next/src/actions/ai-actions.ts`（通过 `lawclick-next/src/lib/ai-provider.ts` 抽象供应商）

## 3. 仅保留的 API Routes（受控边界）
| 路径 | 用途 | 关键约束 |
|------|------|----------|
| `/api/auth/[...nextauth]` | NextAuth 回调 | 由 NextAuth 管理 |
| `/api/documents/[id]/file` | 文档下载/预览（**受控流式**，非 presigned） | 登录 + `requireCaseAccess`；支持 `?versionId=<uuid>` 与 `?download=1` |
| `/api/queue/process` | 队列处理触发（内部运维） | 需 `x-lawclick-queue-secret` 或具备 `admin:settings` 权限 |

## 4. 返回结构约定（推荐）
- 推荐统一到结构化错误：`lawclick-next/src/lib/action-result.ts`（`{ success: true; data } | { success: false; error: { code; message; details? } }`）。
- 现状：部分历史 action 仍使用 `{ success: boolean; error?: string }` 或 `{ error: string }`，后续应继续收敛，避免前端处理分裂。

## 5. 变更记录
- v3.1 (2025-12-19): 同步真实实现：受控流式文档路由、队列鉴权、AI Provider 抽象、返回结构约定补充
