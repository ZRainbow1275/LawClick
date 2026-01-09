const message = [
    "根据极限标准：禁止使用 synthetic seed（示例/造数）。",
    "请先将脱敏生产快照导入当前 DATABASE_URL 指向的数据库，再启动应用。",
    "",
    "推荐流程：",
    "1) pnpm exec prisma migrate deploy",
    "2) pnpm restore:snapshot -- --file <path-to-dump> --reset --yes",
    "   （或手动使用 pg_restore/psql 将脱敏快照导入数据库）",
    "",
    "说明：历史造数脚本已移动到 prisma/seed-synthetic.ts（非主线/禁止默认运行）。",
].join("\n")

console.error(message)
process.exitCode = 1
