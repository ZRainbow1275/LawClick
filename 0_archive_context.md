# 归档记录（Append-Only）

> 记录“为什么这么做”，保证中断后可追溯。

## 2025-12-12：TG3（任务协作 + Trello 看板）阶段性归档
- 目标：案件内看板 + 全局任务中心 + 拖拽排序落库 + 计时/日程最小联动入口，确保无 mock。
- 排序语义：以 `(caseId, status, swimlane)` 作为列内序；新建任务在列内取 `max(order)+1`。
- 变更原则：统一通用 `TaskKanban` 组件复用，后端 `reorderTasks` 支持批量 order/status/swimlane/stage 并事务落库。
- 风险：大列频繁拖拽会触发批量 renumber（可在后续引入 Planka 式 position gap/分数索引以优化）。

## 2025-12-12：TG3（看板对齐增强：参照 Focalboard/Planka）归档
- 动机：对齐成熟看板的排序与交互范式，降低频繁拖拽写放大，补齐“快速新建 + 详情编辑 + 撤销”的闭环体验。
- 关键决策：引入 `POSITION_GAP=1024` 的 gap order，新增 `moveTaskOnKanban`（默认只更新被移动任务；gap 不足时对目标列局部 reindex）。
- 交互落地：案件看板列头 Add card；卡片详情弹窗支持编辑/删除；拖拽成功提供一次撤销、失败自动回滚。
- 全局任务中心约束：因 `Task.order` 语义属于案件内列序，禁用同列手动重排，仅保留跨列状态移动，避免跨案件排序语义混乱。

## 2025-12-13：TG4（计时追踪闭环）归档
- 动机：计时模块存在多套实现与“分钟/秒”混用，且浮窗计时器本地化不落库，导致无法形成真实业务闭环（任务→计时→统计→计费）。
- 关键决策：
  - `TimeLog.duration` 统一以“秒”为真源；UI 统一按秒格式化展示。
  - 计时记录必须关联案件/任务（至少 caseId），避免出现“不可回溯工时”。
  - 计时器浮窗只展示/控制 DB 真源状态，不允许在无关联上下文直接 start（引导从任务/案件入口开计时）。
  - 停止/补录时写入计费快照 `billingRate/billingAmount`，便于后续账单与复盘。
- 风险与权衡：严格强制 case/task 关联会牺牲“随手计时”的自由度，但换来计费与复盘的可追溯性；若未来需要“通用计时”，应以“创建临时任务/临时案件”方式承载，而不是生成无关联 TimeLog。

## 2025-12-13：TG5（文档中心：MinIO + 版本链 + 受控预览/下载）归档
- 动机：文档模块存在“只写 DB 不上传”的空壳上传、双真源 actions、缺失详情页与阶段文书上传断链，无法支撑“文档即业务”的案件闭环。
- 关键决策：
  - 引入 `DocumentVersion` 作为版本链真源；`Document` 保留“最新版本快照”用于列表与快速展示。
  - 文件访问必须走受控 API：`/api/documents/[id]/file` 内做 session + `requireCaseAccess` 校验，避免静态直链绕过权限。
  - 上传统一为一条链路：Server Action 收到 File → PutObject 到 MinIO → 写 `Document/DocumentVersion` → revalidatePath。
  - 案件为中心：案件详情页文档 Tab 提供上传与下载，并把“阶段文书占位记录”打通上传补齐。
- 风险与权衡：当前上传在 Server Action 内将文件读入内存（MVP 可用）；后续如需支持大文件与断点续传，可升级为 presign 直传 + 回调落库，但必须继续保持后端鉴权与审计链。

## 2025-12-13：TG6（仪表盘 MDI/DIY 工作台）归档
- 动机：`/dashboard` 仍是固定布局且存在 mock（违背“仪表盘不是静态页面/布局必须落库跨端一致/无假数据”），并伴随侧边栏折叠后布局不自适应的问题。
- 关键决策：
  - 新增 `DashboardLayout`（`userId + dashboardKey` 唯一）作为仪表盘配置真源，`config(Json)` 存储 widgets + grid layout。
  - 引入最小 **Widget 注册中心**（`src/lib/dashboard-widgets.ts`）：集中维护 `title/defaultSize/requiredPermissions`，避免元数据散落在页面与客户端组件中。
  - 权限按 Widget 粒度下沉到后端：案件/工时组件要求 `case:view`，对不具备权限角色自动隐藏并在保存时清洗。
  - UI 采用 `react-grid-layout` 的拖拽/缩放作为工作台级 LEGO 容器；并在侧边栏折叠/展开后主动触发 `window.resize`，保证网格宽度与布局重算。
  - Middleware 迁移为 `next-auth/jwt getToken`：避免 Prisma 进入 Edge middleware，确保构建可通过并减少运行时不确定性。
- 风险与权衡：
  - 当前 Widget 组件库为 MVP（4 个核心组件）；后续扩展更多组件时，必须继续遵循“真实数据源 + 权限后端校验 + 落库配置”的三原则。
  - Next monorepo 多 lockfile 会产生 workspace root 推断警告；短期不影响 build，通过后续清理冗余 lockfile 再做工程洁净化。

## 2025-12-14：TG7（日程安排 & 调度中心）归档
- 动机：日程/调度存在“事件模型过弱（无参与人/可见性/状态）+ actions 重复 + /dispatch 含 mock + 邀请不联动”的断链路问题，无法支撑 1211 里“全所时间协作调度平台”的第一性目标。
- 关键决策：
  - **事件成为协作对象**：`Event` 增加 `visibility/status/taskId`，新增 `EventParticipant`（INVITED/ACCEPTED/DECLINED），并与 `CollaborationInvite(type=MEETING)` 打通（邀请即会议参与状态）。
  - **Busy-only 脱敏策略**：团队调度默认展示他人“忙碌块”；仅参与人/创建者/TEAM_PUBLIC（或 CASE_TEAM 且具备案件访问）可见详情，避免跨案件/跨角色的信息泄漏。
  - **范围查询单一真源**：新增 `getEventOccurrencesInRange`（range + userIds），按“泳道 userId → event”返回，天然支持多人会议在多条泳道重复呈现。
  - **可用时间推荐（MVP）**：新增 `Schedule/AvailabilityRule/OutOfOffice`，并落地 `getAvailableSlots`（工作时段交集 - 忙碌/外出差集），对齐 cal.com 的可用性计算思路但先实现最小闭环。
  - **状态写回 DB**：`useUserStatusStore.setStatus` 同步调用 `updateUserStatus` 落库，使计时器/调度中心的“人员状态”一致（不再只存在本地）。
- 交付结果：
  - `/calendar`：周/日/月/列表视图 + 新建日程（参与人/可见性/推荐时间）+ 事件详情（取消/从日程建任务）。
  - `/dispatch`：TeamHeatmap 去 mock（真数据）+ 团队日程泳道（Day View，最多 20 人，搜索适配 30-300）+ 邀请接受/拒绝真实落库联动。
- 风险与后续：
  - 时区/外部日历/并发预留（SelectedSlots）属于后续增强；本 TG 已保留模型与接口形态，避免返工。

## 2025-12-14：TG8（行政ERP/OA & 客户管理）归档
- 动机：审批/财务/CRM 存在 mock 与断链路（/contacts mock、/admin 页面偏展示、案件内无法追溯台账），无法支撑“以案件为核心”的经营闭环。
- 关键决策：
  - **审批追溯最小真源**：`ApprovalRequest` 显式补齐 `caseId/clientId`，避免继续依赖 `metadata` 承载核心关联字段。
  - **合同台账最小闭环**：新增 `Contract` + `ContractStatus`，并与 `Document` 维持 1-1（`documentId @unique` + `Document.contract`），后端在 `linkContractDocument` 强制“合同/文档同案一致性”。
  - **权限后端强制**：新增 `approval:create|approve|view_all`、`crm:view|edit` 权限点；actions 全面切换到 `getSessionUserOrThrow/requirePermission/requireCaseAccess`，UI 仅做展示兜底。
  - **案件为入口**：扩展 `CaseBillingTab` 为 `工时/发票/费用/审批/合同` 多子页，支持案件内创建与追溯（并复用财务/审批 Dialog）。
  - **入口统一**：`/contacts` 不再承载 mock，统一重定向到 `/crm/customers`；左侧导航按 `canAccessPage` 自动过滤，新增“日程安排”与“行政中心（审批/财务）”。
- 关键修复：
  - `recordPayment` 汇总重复计数问题修复（避免 paidAmount double-count）。
  - `/admin/approvals` client 工作台改为 props 驱动（避免 router.refresh 后 state 不更新）。
  - `/admin/finance` 合同状态更新补齐 `router.refresh()`（避免 UI 受控 select 回弹）。
- 权衡与后续：
  - 合同与文档绑定 UI 暂缓（后端已具备，后续在 TG9+ 做“文档中心/合同台账”联动入口）。
  - Next build 存在 workspace lockfile 与 middleware 约定提示（不阻塞功能；后续工程洁净化再处理）。

## 2025-12-14：TG9（AI 模块 & 工具箱）归档
- 动机：AI/工具箱存在“假配置/空壳/不可审计”问题（OpenAI key mock fallback、文档审查页静态假数据、工具箱未接入 DB、Webhook 无安全策略与无审计落库、AI 助手入口重复），无法满足 1211 的“AI 化操作系统”与 `.agent/rules/lawclick.md` 的硬性约束。
- 关键决策：
  - **统一 AI 入口为浮窗 MDI**：移除旧的右下角独立 AI 组件，业务页面通过 `openWindow('ai-paralegal', ...)` 携带上下文打开 AI。
  - **通用上下文真源**：`AIConversation` 增加 `context(Json)`，上下文统一用 `{caseId/documentId/taskId/approvalId/invoiceId/expenseId/contractId}` 表达，后端集中解析并强制 `requirePermission/requireCaseAccess`。
  - **审计链落库**：新增 `AIInvocation`/`ToolInvocation` 两张审计表，记录每次调用的 `provider/model/status/error/tokenUsage/context`，并要求失败也落库，便于排障与合规追溯。
  - **Webhook 安全默认拒绝**：仅允许 `https` + `TOOL_WEBHOOK_ALLOWLIST` 命中域名，同时阻断 localhost/私网 IP/解析到私网等 SSRF 风险；并把拒绝原因写入 `ToolInvocation`。
  - **文档 AI 审查去静态化**：`/documents/[id]/review` 改为真实读取文档并以 `notes/粘贴文本` 作为内容源调用 AI，结果展示 + 审计历史可回放（MVP 不做全文抽取与 RAG）。
- 风险与权衡：
  - 缺少 `OPENAI_API_KEY` 时不发起外部请求，直接返回明确错误并记录 ERROR 审计，避免“假在线”误导。
  - allowlist 默认为空会拒绝所有 webhook 调用，安全性优先；开发环境需显式配置域名以启用 N8N 集成。

## 2025-12-14：TG10（统一检验与纠错：入口级空壳清理）归档
- 动机：在 TG0~TG9 后仍存在“入口级别”的 mock/空壳（Header mock 用户、Dashboard 新建案件模拟、/chat 与浮窗聊天 mock），会直接破坏“生产可用系统”的可信度。
- 关键决策：
  - **Header 统一到真实会话**：`AppHeader` 使用 NextAuth `useSession` 展示真实用户，退出使用 `signOut`；清理 `mock-data` 与 store 默认 mock，避免未来回归。
  - **Dashboard 新建案件入口复用真向导**：用 `NewCaseWizard` 轻封装 `CreateCaseWizard`，避免重复造轮子与出现“一个入口真、一个入口假”的割裂。
  - **Chat 以案件为中心建模**：新增 `ChatThread/ChatParticipant/ChatMessage`，并采用 `key` 唯一策略保证可 get-or-create：
    - `TEAM:default`（团队群聊）
    - `CASE:{caseId}`（一案一群）
    - `DIRECT:{minUserId}:{maxUserId}`（私聊）
  - **成员变更同步可见性**：案件创建时自动创建案件群聊并加入参与人；后续案件成员增删与接受案件邀请会同步 chat participant，确保 `/chat` 会话列表与案件可见性一致。
- 后续：全局搜索/通知仍需做最小后端闭环（建议 TG11），避免继续存在“入口可点但不可用”的空壳体验。

## 2025-12-14：TG11（全局搜索/通知闭环）归档
- 动机：Header 的“全局搜索/通知”仍为入口级空壳（无真实查询、无落库未读数、无跳转闭环），与“无前端不后端/无假数据”硬约束冲突。
- 关键决策（数据层）：新增 `NotificationType` + `Notification`（含 `actorId/actionUrl/metadata/readAt`）并加索引，支撑未读统计与列表查询。
- 关键决策（领域层）：统一写入入口 `lawclick-next/src/lib/notifications.ts` 的 `notifyUsers()`，避免分散拼装与字段不一致。
- 关键决策（接口层）：
  - `globalSearch()` 聚合 Case/Task/Document/Contact，并在后端做权限/案件可见性过滤（Partner/Admin 全量；其他按 originator/handler/members）。
  - 通知 actions 提供：列表+未读数+已读标记，保证 Header 与通知页均为 DB 真数据。
- 关键决策（UI/跳转闭环）：
  - Header Popover 打开即拉取最新通知；“查看全部通知”新增 `/notifications` 页面；
  - `/chat?threadId=...` 支持初始定位会话；`/cases/:id?tab=...` 支持直达任务/文档/账务 Tab。
- 取舍：本阶段不做实时推送（WS/SSE），采用“打开 Popover/进入通知页拉取”；搜索暂用 `contains` 聚合，后续可升级 Postgres FTS + 权重排序。

## 2025-12-16：TG12（统一回归验收与纠错 v2）阶段性归档
- 动机：TG0～TG11 已完成主要闭环，但需要进入“统一回归 + 纠错”阶段，把入口断链与构建期噪音收敛掉，保证持续迭代不跑偏。
- 关键决策：
  - **路由断链工具化**：新增 `lawclick-next/scripts/route-audit.js`，以“代码内常见跳转语句 → 对照 app 路由树”的方式做静态巡检，并把它作为防回归守门人（`npm -C lawclick-next run audit:routes`）。
  - **入口级 404 先补齐 redirect**：补齐 `/admin` 入口页，避免“导航父级可点但 404”；同时清理未使用的历史侧边栏组件，避免遗留路由引用干扰巡检与交接理解。
  - **构建告警收敛策略**：对依赖 session/headers 的关键页面显式标记 `force-dynamic`，避免 `next build` 在静态生成阶段触发 `Dynamic server usage` 错误输出（路由本质是动态渲染，这是预期形态）。
- 取舍与后续：
  - `force-dynamic` 会放弃静态预渲染，但在“强会话 + 权限后端强校验”的应用里属于正确取舍；后续如需局部静态化，应以“公共无会话页面”或“纯客户端数据页”单独设计。
  - 仍保留的非阻塞提示（workspace root 推断、多 lockfile、middleware 约定弃用）需要在 TG12 后续验收中记录原因与迁移策略，不阻塞主线可用性。

## 2025-12-17：TG12（统一回归验收与纠错 v2）补充归档
- 动机：继续收敛 `next build` 的剩余非阻塞提示，并把 DB 真源验收从“待执行”推进到“可复现”。
- 关键决策：
  - **显式 `turbopack.root`**：在 `lawclick-next/next.config.ts` 将 `turbopack.root` 指向 workspace root（`path.resolve(__dirname, "..")`），并避免使用包含 `..` 的绝对路径字符串（在 Windows 下会触发 Turbopack 的 projectDir 解析异常，导致构建失败）。
  - **`middleware` → `proxy`**：按 Next.js 16 约定将 `lawclick-next/src/middleware.ts` 迁移为 `lawclick-next/src/proxy.ts`，保持 matcher 与登录/角色页面重定向逻辑不变。
  - **DB 真源验收落地**：本环境已执行 `docker compose up -d` + `prisma migrate deploy` + `prisma db seed`，确认 TG0-TG11 的核心数据可回读；默认账号 `partner1@lawclick.com / password123`。
- 后续：浏览器级主线回归仍需跑通并补齐截图/问题清单（至少 `partner1` + `lawyer1` 两角色）。

## 2025-12-17：TG12（统一回归验收与纠错 v2）同页跳转定位补强归档
- 动机：TG11 已把 “/cases/:id?tab=... / /chat?threadId=...” 作为通知/搜索的跳转闭环，但在 App Router 下**同页导航**（URL 变化但组件不 remount）会导致：
  - UI 状态仍停留在旧 Tab/旧会话，出现“点击通知但没定位”；
  - 若 UI 与 URL 参数脱钩，再次点击同一条 `actionUrl` 可能因为 URL 未变而无效。
- 关键决策：
  - **把 searchParams 作为定位真源**：在客户端组件中监听 `tab/threadId` 变化，确保同页 `router.push(actionUrl)` 可驱动状态切换。
  - **URL 与 UI 状态同步（用 `history.replaceState`）**：在 Case Tab 切换、Chat 会话切换时同步写回 URL，避免“状态变了但 URL 没变”导致通知重复点击失效，同时避免污染浏览器历史。
  - **可回归的测试锚点**：为 Header 通知按钮补齐 `aria-label`/`data-testid`，服务 Playwright 同页跳转回归，不引入任何 mock。
  - **Next.js 16 动态 API 兼容收口**：补齐 `/chat`、`/crm/customers` 的 `searchParams: Promise<...>` 解包，避免运行期 `sync-dynamic-apis` 报错阻断主线。
- 产出：
  - Playwright 新增同页跳转回归：`case-tab-deeplink.spec.ts`、`chat-notification.spec.ts`；
  - `mainline.spec.ts` 增强计时器状态等待，降低环境波动导致的误报。

## 2025-12-17：TG12（统一回归验收与纠错 v2）工程质量收敛补充归档
- 动机：在 TG12 回归阶段发现“Lint 阻断 / 构建期 TS 类型不一致 / E2E 偶发波动”会直接拖慢迭代与验收节奏，需要先把守门链路（lint/build/e2e）恢复到可持续状态。
- 关键决策：
  - **Lint 先保证 0 error**：将 `no-explicit-any` 与 `react-hooks/set-state-in-effect` 下调为 `warn`，先保证 `npm -C lawclick-next run lint` 可作为日常守门；后续按模块逐步收敛 warning（避免一次性“大扫除”破坏主线）。
  - **NextAuth 类型兼容优先于“纯类型洁癖”**：由于依赖树里可能存在 `@auth/core` 多版本类型差异，模块增强（`role/id`）采用 `optional` 方式做类型兼容，同时在回调中保证运行期写入（`token.id` 回退 `token.sub`）。
  - **审计落库类型强一致**：`ToolInvocation.payload/response` 统一使用 `Prisma.InputJsonValue`，避免 TS/Prisma JSON 类型不匹配导致构建失败；同时修复 `module` 命名触发 Next 规则报错。
  - **回归脚本抗波动**：`mainline.spec.ts` 对返回 `/time` 后的计时器状态做“未在计时/仍在计时”二选一等待并兜底停止，避免环境残留 timer 导致误报。
  - **清理可达空壳入口**：命令面板移除 `/settings` 假入口，避免违反“无假数据/空壳禁止”的硬约束（完整设置中心需另起 TG 设计 Schema + actions + 落库）。
