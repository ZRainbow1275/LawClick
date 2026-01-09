# 当前任务快照（高频更新）

## 当前阶段
- 当前 TG：TG12 进行中（统一回归验收与纠错 v2：路由断链巡检 + 告警收敛 + 体验抛光）
- 子计划：`docs/TG12_统一回归与纠错_v2_子计划.md`
- 验收记录：`docs/TG12_统一回归与纠错_v2_验收记录.md`
- 上一 TG：TG11 已完成（全局搜索/通知闭环：Notification 落库 + Header 搜索/通知真接入 + 关键触发点写入）

## TG12 已完成（本轮已落地）
1. 入口级断链修复：补齐 `/admin` 入口页，避免导航父级 404
2. 自动化巡检：新增 `lawclick-next/scripts/route-audit.js`，并提供 `npm -C lawclick-next run audit:routes`
3. 告警收敛：关键页面标记 `force-dynamic`，`next build` 不再输出 `Dynamic server usage` 错误
4. 构建提示收敛：设置 `turbopack.root`（解决 workspace root 推断/多 lockfile 提示），并将 `middleware` 迁移为 `src/proxy.ts`
5. DB 真源验收：本环境已跑通 `docker compose up -d` + `prisma migrate deploy` + `prisma db seed`
6. 同页跳转定位补强：`/cases/:id?tab=...` 与 `/chat?threadId=...` 支持“同页 actionUrl 跳转”可靠生效（含 URL 与 UI 状态同步）
7. Next.js 16 动态 API 兼容：补齐 `/chat`、`/crm/customers` 的 `searchParams: Promise<...>` 解包，避免运行期 `sync-dynamic-apis` 报错
8. Playwright 回归扩展：新增 `case-tab-deeplink.spec.ts`、`chat-notification.spec.ts`，并增强 `mainline.spec.ts` 的计时器等待稳定性
9. 工程质量收敛：`npm -C lawclick-next run lint`（0 error）、`npm -C lawclick-next run build`、`cd lawclick-next; npx playwright test` 均已通过；并移除命令面板中的 `/settings` 假入口（避免空壳可达）

## 近期目标（1-2 天内）
1. 浏览器侧统一回归主线（案件→任务→计时→文档→日程/调度→聊天→通知→搜索）并补齐截图/问题清单
2. 按主线回归结果收敛“体验抛光”：文档上传/受控下载、调度邀请回执、聊天通知跳转、全局搜索跳转等入口的一致性与错误提示，并同步记录到 TG12 验收记录

## 风险/注意事项
- 避免“空壳入口”：任何按钮/入口必须同时具备 Schema + Action + 落库 + 可回读 + 权限后端校验
- AI/工具箱必须可追溯：所有调用必须携带 `caseId/documentId/userId` 上下文 + 审计记录
