const fs = require("fs")
const path = require("path")

const PROJECT_ROOT = path.join(__dirname, "..")
const REPO_ROOT = path.join(PROJECT_ROOT, "..")

const PRISMA_SCHEMA = path.join(PROJECT_ROOT, "prisma", "schema.prisma")
const RUST_ENTITY_DIR = path.join(REPO_ROOT, "src", "entity")
const OUT_DIR = path.join(REPO_ROOT, "docs", "_artifacts")

function formatDate(d) {
    const pad = (n) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function toPascalCase(snake) {
    return String(snake || "")
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("")
}

function collectPrismaModels() {
    if (!fs.existsSync(PRISMA_SCHEMA)) return []
    const src = fs.readFileSync(PRISMA_SCHEMA, "utf8")
    const re = /^\s*model\s+([A-Za-z0-9_]+)\s*\{/gm
    const models = new Set()
    for (const m of src.matchAll(re)) {
        const name = m[1]
        if (name) models.add(name)
    }
    return Array.from(models).sort()
}

function collectRustEntities() {
    if (!fs.existsSync(RUST_ENTITY_DIR)) return []
    const entries = fs.readdirSync(RUST_ENTITY_DIR, { withFileTypes: true })
    const entities = []
    for (const entry of entries) {
        if (!entry.isFile()) continue
        if (!entry.name.endsWith(".rs")) continue
        if (entry.name === "mod.rs") continue
        const base = entry.name.slice(0, -3)
        entities.push({ file: entry.name, module: base, model: toPascalCase(base) })
    }
    entities.sort((a, b) => a.model.localeCompare(b.model))
    return entities
}

function main() {
    const prismaModels = collectPrismaModels()
    const rustEntities = collectRustEntities()

    const prismaSet = new Set(prismaModels)
    const rustSet = new Set(rustEntities.map((e) => e.model))

    const rustUnknownModels = rustEntities.filter((e) => !prismaSet.has(e.model))
    const prismaMissingInRust = prismaModels.filter((m) => !rustSet.has(m))

    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `orm_entity_sync_audit_${date}.md`)

    const lines = []
    lines.push(`# ORM Entity Sync Audit (${date})`)
    lines.push("")
    lines.push("> 目的：降低“双 ORM（Prisma + SeaORM）并行”带来的漂移风险。")
    lines.push("> 注意：Rust 后端为原型/实验性网关，实体覆盖不要求 1:1；但 **Rust 不应出现 Prisma 中不存在的实体**。")
    lines.push("")
    lines.push("## Summary")
    lines.push(`- Prisma models: ${prismaModels.length}`)
    lines.push(`- Rust SeaORM entities: ${rustEntities.length}`)
    lines.push(`- Rust entities missing in Prisma (should be 0): ${rustUnknownModels.length}`)
    lines.push(`- Prisma models not represented in Rust (allowed for prototype): ${prismaMissingInRust.length}`)

    lines.push("")
    lines.push("## Rust Entities")
    if (rustEntities.length) {
        lines.push("")
        for (const e of rustEntities) {
            lines.push(`- \`${e.file}\` → \`${e.model}\``)
        }
    }

    lines.push("")
    lines.push("## Rust Entities Missing in Prisma (Should Fix)")
    if (rustUnknownModels.length === 0) {
        lines.push("")
        lines.push("- ✅ None")
    } else {
        lines.push("")
        for (const e of rustUnknownModels) {
            lines.push(`- ❌ \`${e.file}\` → \`${e.model}\` (no matching Prisma model)`)
        }
    }

    lines.push("")
    lines.push("## Prisma Models Not in Rust (Prototype Allowed)")
    if (prismaMissingInRust.length === 0) {
        lines.push("")
        lines.push("- ✅ None")
    } else {
        lines.push("")
        for (const m of prismaMissingInRust) lines.push(`- \`${m}\``)
    }

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[orm-entity-sync] prisma models: ${prismaModels.length}`)
    console.log(`[orm-entity-sync] rust entities: ${rustEntities.length}`)
    console.log(`[orm-entity-sync] rust missing in prisma: ${rustUnknownModels.length}`)
    console.log(
        `[orm-entity-sync] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`
    )

    if (rustUnknownModels.length) process.exitCode = 1
}

main()

