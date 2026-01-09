# 律时（LawClick / LegalTime）项目上下文（知识库）

> 目标：为“/compact 后可续写”提供唯一事实来源。  
> 约束：遵循 `prompt/1211架构设计.md`、`.agent/rules/lawclick.md`、`docs/LegalMind设计语言规范.md`。

## 1. 项目定位
- 律时是 LegalMind 法律生态的核心工作系统。
- **第一性主线（业务流）**：案件（Case）→ 任务（Task）→ 计时（TimeLog）→ 文档（Document）→ 日程/调度（Event/Dispatch）→ 归档/复盘/计费。

## 2. 主开发工程
- 主工程目录：`lawclick-next/`
- 技术栈：Next.js（App Router 全栈）+ Prisma + PostgreSQL（Docker）+ MinIO
- Rust 后端原型目录：根目录 `src/`（Axum 0.8 + SeaORM）
  - 与 `lawclick-next/` **共享同一个 Postgres/MinIO**（同库同字段），以“极限标准”要求推进真实闭环能力（鉴权/落库/错误语义/输入校验）。
  - 鉴权支持：Rust 自签 `JWT_SECRET`（HS256）+ 解密 NextAuth/Auth.js `NEXTAUTH_SECRET/AUTH_SECRET`（JWE），并可从 `Authorization` 或 Session Cookie 抽取。

## 3. 硬性开发原则（不可违背）
- **无前端不后端**：任何 UI 必须对应 Schema + Server Actions/API + 真实数据链路。
- **禁止假数据/空壳**：列表、看板、仪表盘等必须来自 Postgres；按钮必须可用并形成闭环。
- **权限在后端**：可见性/操作权限必须在 actions/API 层强制校验（UI 只做展示兜底）。
- **MDI + LEGO**：工作台类页面最终必须落在可停靠/可分屏/可序列化的 MDI 容器（TG6 专项推进）。

## 4. 本地基础设施（当前环境）
- Docker 容器（已在运行）：
  - Postgres：`lawclick-postgres`，端口 `5434`
  - MinIO：`lawclick-minio`，端口 `9000/9001`
- `lawclick-next/.env`（关键项）：
  - `DATABASE_URL=postgresql://postgres:password@127.0.0.1:5434/lawclick?schema=public`
  - `S3_ENDPOINT=http://127.0.0.1:9000`
  - `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET_NAME`
  - `NEXTAUTH_SECRET`（或 `AUTH_SECRET`）
- Rust API 启动（根目录）：
  - 必要 env：`DATABASE_URL`、`JWT_SECRET`、`NEXTAUTH_SECRET/AUTH_SECRET`、`S3_*`
  - 启动：`cargo run --bin server`

## 5. 当前 TG 进度（以 docs/ 为准）
- 总计划：`docs/1211_架构落地开发总计划_v1.md`
- 已完成：TG0～TG11（TG11：全局搜索/通知闭环）
- 当前：TG12（统一回归验收与纠错 v2：路由断链巡检 + 告警收敛 + 体验抛光）
  - 子计划：`docs/TG12_统一回归与纠错_v2_子计划.md`
  - 验收记录：`docs/TG12_统一回归与纠错_v2_验收记录.md`
  - 已落地（TG12）：新增 `audit:routes` 路由断链巡检；关键页面标记 `force-dynamic` 收敛 dynamic server usage；补齐 `/admin` 入口 redirect；设置 `turbopack.root` 收敛 workspace root 推断提示；将 `src/middleware.ts` 迁移为 `src/proxy.ts`（Next.js 16）；并已在本环境跑通 `migrate deploy + db seed`

## 6. 开源参照（只借鉴架构/交互，不复制代码）
- 看板：Focalboard、Planka
- 日程/可用性：Cal.com
- 研究归档：`docs/开源参照研究_看板_计时_日程.md`
