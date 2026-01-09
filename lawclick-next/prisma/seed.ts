/**
 * LawClick 数据导入种子脚本（极限标准）
 *
 * 严禁生成任何模拟/示例业务数据（Synthetic Seed）。
 * 允许方式：导入脱敏后的生产快照（或与生产同构的 staging 数据源）。
 *
 * 目标：保证开发/测试数据与生产 1:1 同构，而不是“脚本造数”。
 */

async function main() {
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

    throw new Error(message)
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
