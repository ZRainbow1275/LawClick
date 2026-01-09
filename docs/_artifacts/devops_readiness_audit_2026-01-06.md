# DevOps Readiness Audit (2026-01-06)

> 目的：对“可启动/可迁移/可验证/可回归”的 DevOps 最小集做可复跑检查。
> 说明：本审计只做静态存在性检查；运行态验证请结合 `pnpm -C lawclick-next verify:system` 与 E2E。

## Summary
- checks: 13
- offenders: 0

## Checklist

- ✅ 根目录 Dockerfile 存在（生产构建入口） (dockerfile)
- ✅ CI 工作流存在（.github/workflows/ci.yml） (ci-workflow)
- ✅ Docker Compose（Postgres + MinIO）存在 (docker-compose)
- ✅ docker-compose.yml 包含 postgres/minio 服务 (docker-compose-services)
- ✅ Prisma schema 存在 (schema)
- ✅ Prisma v7 配置存在（prisma.config.ts） (prisma-config)
- ✅ Prisma migrations 存在且非空 (migrations)
- ✅ verify:system 脚本存在 (verify-system)
- ✅ Playwright 配置存在（E2E 可复跑） (playwright)
- ✅ Next 配置存在 (next-config)
- ✅ 健康检查端点存在（/api/health） (health-endpoint)
- ✅ middleware 存在（请求治理入口） (middleware)
- ✅ 本地 .env 存在（不读取内容） (env-present)
