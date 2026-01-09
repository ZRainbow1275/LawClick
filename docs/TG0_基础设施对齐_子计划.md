# TG0 基础设施对齐子计划（DID）

## 文档信息
- 版本：v1.0
- 创建日期：2025-12-12
- 适用范围：`lawclick-next/`
- 目标里程碑：为 TG2“案件端到端闭环”提供真实数据与稳定 DB 基线

---

## 一、Design（设计/领域澄清）

### 1.1 目标
1. 确保本地 **PostgreSQL + MinIO** 一键可用，Next 全栈工程真实联通。
2. Prisma 迁移与 Schema 与 1211 架构一致，**不出现前后端脱节**。
3. 统一/修正 Seed 执行入口：`prisma db seed` **不得脚本造数**，仅允许导入脱敏生产快照（或与生产同构的 staging 数据源），确保 dev=prod 1:1。
4. 建立 TG0 验收脚本，为后续 TG1‑TG9 提供持续验证能力。

### 1.2 范围
- DB/存储启动与连通：`lawclick-next/docker-compose.yml`、`.env`
- Prisma 迁移：`lawclick-next/prisma/migrations/*`
- Seed 守门：`lawclick-next/prisma/seed.js`（默认拒绝 synthetic/造数，提示导入脱敏生产快照）
- 系统验证脚本：`lawclick-next/scripts/verify-system.js`、`init-s3.js`

**不做项**
- 不在 TG0 内修改任何业务 UI/路由（留给 TG2+）。
- 不引入新的外部基础设施（如 Supabase 托管、Redis 等），仅保证当前本地基线可跑。

---

## 二、Implement（实现/集成）

### 2.1 后端/基础设施对齐步骤
1. **启动基础设施**
   - 进入 `lawclick-next/` 目录
   - 执行：`docker compose up -d`
   - 预期：`lawclick-postgres`、`lawclick-minio` 两个容器健康运行

2. **验证 DB 与 MinIO 连通**
   - 执行：`pnpm -C lawclick-next verify:system`
   - 预期：输出 Database Connected + MinIO Connected

3. **Prisma 迁移核对/部署**
   - 先检查 migrations 与 schema 是否一致
   - 若本地 DB 未初始化：
     - 执行：`pnpm -C lawclick-next exec prisma migrate deploy`
   - 若需要重建开发库（仅在确认无重要数据时）：
     - 执行：`pnpm prisma migrate reset`

4. **Seed 入口修正**
   - 现状（极限标准）：禁止 synthetic seed（示例/造数），必须走“脱敏生产快照导入”。
   - 处理：
     1. 在 `lawclick-next/package.json` 配置 Prisma seed：指向 `prisma/seed.js`
     2. `prisma/seed.js` 默认直接拒绝造数并给出导入快照指引；历史造数脚本仅保留在 `prisma/seed-synthetic.ts`（禁止默认运行）

5. **导入脱敏生产快照（推荐流程）**
   - 执行：`pnpm -C lawclick-next prisma:generate`（如需要）
   - 执行：`pnpm -C lawclick-next exec prisma migrate deploy`
   - 执行：导入脱敏生产快照（推荐用本仓库脚本，避免误操作）：`pnpm -C lawclick-next restore:snapshot -- --file <path-to-dump> --reset --yes`
   - 说明：`pnpm -C lawclick-next exec prisma db seed` 会拒绝 synthetic 造数，用于防止“看似可用但不生产对齐”的假闭环

6. **初始化 MinIO Bucket**
   - 执行：`pnpm -C lawclick-next init:s3`
   - 预期：`lawclick-documents` bucket 存在

### 2.2 交付物（代码/配置）
- `lawclick-next/package.json`：新增 Prisma seed command
- `lawclick-next/prisma/seed.js`：守门硬失败（禁止造数），并给出脱敏快照导入指引
- （如迁移不一致）补齐/重建 migrations（保持最小变更）

---

## 三、Deliver（验收/验证）

### 3.1 验收脚本
1. `docker ps`：确认容器运行
2. `pnpm -C lawclick-next verify:system`：确认 DB/MinIO 连通
3. `pnpm prisma migrate status`：无 pending migration
4. 导入脱敏生产快照：`pnpm -C lawclick-next restore:snapshot -- --file <path-to-dump> --reset --yes`（不允许脚本造数）
5. 启动应用：`pnpm dev`
   - 访问 `/dashboard`、`/cases`、`/tasks`、`/time`、`/documents`
   - 预期：均出现真实数据（非空壳/非 mock）

### 3.2 验收标准
- DB 与 MinIO 一键启动、可稳定连接。
- Prisma schema 与迁移一致，且可在空库上完整建表。
- `prisma db seed` 不允许生成示例/造数数据；数据来源必须为脱敏生产快照（或 staging 同构数据源）。
- 主页面数据真实可见，为 TG2 端到端提供基线。

### 3.3 风险与对策
- **Docker 未启动/端口冲突**：先检查 5434/9000/9001 占用，再调整 `.env` 与 compose 端口。
- **迁移漂移**：以现有 migrations 为准，小步补齐；必要时重建但须先备份。
- **快照导入兼容性问题**：若导入失败，先确认快照版本与当前 migrations 对齐；必要时以空库 + `migrate deploy` 起步，通过真实 UI/E2E 自然产生数据，并记录差异。

---

## 四、TG0 完成后的下一步
- 产出 TG0 验收记录（本文件补充“验收结果”小节）。
- 进入 TG1 身份/权限体系统一，先写 `docs/TG1_子计划.md` 再动代码。

---

## 五、验收结果（2025-12-12）
> ⚠️ 历史记录（已被“极限标准复核”替代）：本节保留 2025-12-12 当时的验收过程与结论，
> 但其中 “synthetic seed 造数” 与 “Node TS experimental 脚本” 已在 2025-12-19 复核
> 中被明确废弃；当前以第六节（极限标准）为准。

1. Docker 基础设施：
   - `lawclick-postgres`、`lawclick-minio` 均已启动并健康运行（端口 5434 / 9000 / 9001）。
2. 数据库与存储连通：
   - 当时使用 `node --experimental-strip-types scripts/verify-system.ts` 验证通过；现已收敛为 `pnpm -C lawclick-next verify:system`。
3. Prisma 迁移：
   - `prisma migrate status` 显示无 pending migration，数据库 schema 最新。
4. Seed 基线：
   - 当时 `prisma db seed` 允许生成示例数据用于 UI 可见性验证；**该策略已废弃**。
   - 现行策略：`prisma db seed` 默认拒绝造数，数据来源必须为“脱敏生产快照导入”。
5. MinIO Bucket：
   - 当时使用 `scripts/init-s3.ts` 验证 bucket；现已收敛为 `pnpm -C lawclick-next init:s3`。

**结论（历史）**：当时认为 TG0 验收通过；但由于 seed 策略被提升到“极限标准”，因此当前应以第六节复核结论为准。

---

## 六、验收结果（2025-12-19｜极限标准复核）
1. Seed 策略已改为“禁止造数，要求脱敏生产快照导入”，避免假闭环。
2. 去除 Node TS experimental 噪音：Prisma seed 改为运行 `prisma/seed.js`；系统验证与 bucket 初始化脚本改为 `scripts/*.js`，并提供 `pnpm -C lawclick-next verify:system` / `init:s3`。
3. Docker Compose 已移除 `version:` 字段，避免 Docker “obsolete” warning（见 `lawclick-next/docker-compose.yml`）。
