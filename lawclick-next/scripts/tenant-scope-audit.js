const fs = require("fs")
const path = require("path")

const PROJECT_ROOT = path.join(__dirname, "..")
const PRISMA_CLIENT_FILE = path.join(PROJECT_ROOT, "src", "lib", "prisma.ts")
const PRISMA_SCHEMA_FILE = path.join(PROJECT_ROOT, "prisma", "schema.prisma")

function sortUnique(values) {
    return Array.from(new Set(values)).sort((a, b) => String(a).localeCompare(String(b)))
}

function readPrismaSchemaOrThrow() {
    if (!fs.existsSync(PRISMA_SCHEMA_FILE)) {
        throw new Error(`未找到 Prisma schema：${path.relative(PROJECT_ROOT, PRISMA_SCHEMA_FILE)}`)
    }

    return fs.readFileSync(PRISMA_SCHEMA_FILE, "utf8")
}

function listModelsFromSchema(schemaText) {
    const modelRe = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g
    const out = []

    let match
    while ((match = modelRe.exec(schemaText)) !== null) {
        const modelName = match[1]
        if (modelName) out.push(modelName)
    }

    return sortUnique(out)
}

function listTenantScopedModelsFromSchema(schemaText) {
    const modelRe = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g
    const out = []

    let match
    while ((match = modelRe.exec(schemaText)) !== null) {
        const modelName = match[1]
        const body = match[2] || ""
        if (modelName && /^[ \t]*tenantId\s+\w+/m.test(body)) out.push(modelName)
    }

    return sortUnique(out)
}

function readTenantScopeExclusions() {
    if (!fs.existsSync(PRISMA_CLIENT_FILE)) {
        throw new Error(`未找到文件：${path.relative(PROJECT_ROOT, PRISMA_CLIENT_FILE)}`)
    }

    const source = fs.readFileSync(PRISMA_CLIENT_FILE, "utf8")

    const match = source.match(/TENANT_SCOPED_MODEL_EXCLUSIONS\s*=\s*new Set<[^>]*>\(\s*(\[[^)]*\])\s*\)/s)
    if (!match) {
        throw new Error("未能解析 TENANT_SCOPED_MODEL_EXCLUSIONS（请检查 src/lib/prisma.ts）")
    }

    let parsed
    try {
        parsed = JSON.parse(match[1])
    } catch {
        throw new Error("TENANT_SCOPED_MODEL_EXCLUSIONS 不是合法 JSON 数组（请检查 src/lib/prisma.ts）")
    }

    if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== "string")) {
        throw new Error("TENANT_SCOPED_MODEL_EXCLUSIONS 必须为 string[]（请检查 src/lib/prisma.ts）")
    }

    return { exclusions: sortUnique(parsed), source }
}

function main() {
    const schemaText = readPrismaSchemaOrThrow()
    const allModels = listModelsFromSchema(schemaText)
    const tenantScopedModels = listTenantScopedModelsFromSchema(schemaText)
    const { exclusions, source } = readTenantScopeExclusions()

    const excludedNotTenantScoped = exclusions.filter((name) => !tenantScopedModels.includes(name))
    const exclusionSet = new Set(exclusions)
    const guardedModels = tenantScopedModels.filter((name) => !exclusionSet.has(name))

    const hasGuard = source.includes('name: "tenant-scope-guard"')

    console.log(`[tenant-scope-audit] prisma models: ${allModels.length}`)
    console.log(`[tenant-scope-audit] tenant-scoped models: ${tenantScopedModels.length}`)
    console.log(`[tenant-scope-audit] guard targets: ${guardedModels.length}`)
    console.log(`[tenant-scope-audit] exclusions: ${exclusions.length}`)

    if (!hasGuard) {
        console.error("[tenant-scope-audit] FAIL: 未发现 tenant-scope-guard（src/lib/prisma.ts）")
        process.exit(1)
    }

    if (excludedNotTenantScoped.length > 0) {
        console.error(
            `[tenant-scope-audit] FAIL: exclusions 中包含非 tenant-scoped 模型：${excludedNotTenantScoped.join(", ")}`
        )
        process.exit(1)
    }

    console.log("\n[tenant-scope-audit] tenant-scoped models:")
    for (const name of tenantScopedModels) console.log(`- ${name}`)

    console.log("\n[tenant-scope-audit] tenant-scope-guard targets:")
    for (const name of guardedModels) console.log(`- ${name}`)

    console.log("\n[tenant-scope-audit] exclusions (must remain explicit):")
    for (const name of exclusions) console.log(`- ${name}`)

    console.log(
        "\n[tenant-scope-audit] OK: tenant-scoped 模型列表与 tenant-scope-guard 目标清单已生成。\n" +
            "说明：tenant-scope-guard 会对上述 targets 自动注入/校验 tenantId；\n" +
            "严禁在生产开启 LAWCLICK_ALLOW_UNSCOPED_TENANT_QUERIES（除非进行数据修复/审计且有明确隔离措施）。"
    )
}

main()
