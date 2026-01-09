# Repository Guidelines

## Project Structure & Module Organization

- `lawclick-next/`: Web mainline (Next.js App Router + Prisma). This is the only end-to-end, production-validated path.
  - `lawclick-next/src/app/`: routes (e.g., `src/app/(dashboard)/cases`).
  - `lawclick-next/src/actions/`: Server Actions (business logic + permissions).
  - `lawclick-next/src/components/`: UI components.
  - `lawclick-next/prisma/`: `schema.prisma`, migrations, `seed.ts`.
  - `lawclick-next/tests/e2e/`: Playwright specs.
- `docs/`: TG plans, audits, and evidence logs (`docs/_artifacts/`).
- `src/` (repo root): Rust Axum/SeaORM prototype (not part of the Web mainline gates).
- `apps/mobile/`: Flutter placeholder (currently not runnable).

## Build, Test, and Development Commands

From repo root (preferred):
- `pnpm install:web`: install deps.
- `pnpm dev`: run the Web app (`lawclick-next`).
- `pnpm lint`, `pnpm type-check`, `pnpm build`, `pnpm test`: quality gates (ESLint/TS/Next build/Playwright).

From `lawclick-next/`:
- `docker compose up -d`: start Postgres (5434) + MinIO (9000/9001).
- `pnpm exec prisma migrate deploy`: apply migrations.
- `pnpm exec prisma db seed`: seed data (dev only).
- `pnpm audit:routes`: detect route/reference breakage.

## Coding Style & Naming Conventions

- TypeScript/React: components use `PascalCase.tsx`; actions use `kebab-case.ts`.
- Prefer `unknown` + narrowing over `any`. Keep `"use server"` boundaries clean and explicit.
- Documentation and user-facing copy are zh-CN; use English for identifiers/technical terms.

## Testing Guidelines

- E2E uses Playwright: `lawclick-next/tests/e2e/*.spec.ts`. Run `pnpm test`.
- Use env overrides for E2E when needed: `E2E_PARTNER_EMAIL`, `E2E_LAWYER_EMAIL`, `E2E_PASSWORD`.

## Commit & Pull Request Guidelines

- Git history currently contains only the initial commit; no established convention yet. Prefer Conventional Commits (`feat:`, `fix:`, `docs:`).
- PRs must include: scope/impact summary, linked TG doc/issue, screenshots for UI changes, and relevant `docs/_artifacts/*` logs when touching build/test gates.

## Security & Configuration Tips

- No mock/shell features in mainline: every UI form must persist to DB and be enforced server-side (see `.agent/rules/lawclick.md`).
- Never commit secrets: `.env*` is ignored. Configure `DATABASE_URL`, `NEXTAUTH_SECRET`, `S3_*`, `OPENAI_*`, `TOOL_WEBHOOK_ALLOWLIST`.



多使用mcp，例如

1. 当在处理添加新组件、引用新语言等情况时，使用context7学习最佳语言实践
2. 使用consequential thinking提升认知深度以及决策复杂度，保证开发的一致性和连续性
3. 使用deepwiki学习github上面比较好的项目经验
4. 使用dart mcp来处理所有开发flutter时存在的问题

最重要的是：

### 1. 数据绝对真实 (Real-World Data / Production Parity)

- **严禁 Mock：** 禁止生成任何形式的模拟数据（Mock Data）或占位符。必须假设并处理真实环境中的脏数据、缺失字段和异常格式。
- **全量校验：** 所有输入数据必须经过严格的 Schema 校验（如 Pydantic/Zod），拒绝隐式信任。
- **生产对齐：** 开发环境的配置与逻辑复杂度必须与生产环境保持 1:1 一致。

### 2. 拒绝空壳交付 (No Shells / Tracer Bullet Development)

- **垂直切片：** 禁止交付只有 UI 没有逻辑、或只有接口没有实现的“空壳代码”。
- **全链路贯通：** 任何功能（Feature）的开发必须是“曳光弹（Tracer Bullet）”式的——即瞬间打通从前端交互、业务逻辑、持久化存储到错误处理的完整链路。
- **可执行性：** 交付的代码片段必须是立即可运行的，包含必要的 Imports 和环境配置。

### 3. 架构优先与过度设计 (Architecture First & Future-Proofing)

- **鼓励过度设计：** 放弃 YAGNI 原则。在满足当前需求的基础上，**强制**考虑未来可能的业务扩展。
- **抽象优先：** 即使是简单逻辑，也必须通过接口（Interface/Trait）或抽象类进行封装，严禁依赖具体实现。
- **极致 DRY (Don't Repeat Yourself)：** 零容忍代码重复。一旦发现逻辑雷同，立即提取为通用的、高内聚的组件或服务。

### 4. 防御性与强类型 (Defensive & Strict Typing)

- **类型洁癖：** 必须使用最严格的静态类型检查（如 TypeScript Strict Mode, Python Type Hints）。禁止使用 `any` 或弱类型推断。
- **显式错误处理：** 禁止吞掉异常。必须在边界显式捕获错误，并返回具备业务语义的错误信息，而非底层堆栈。
