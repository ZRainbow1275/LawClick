const fs = require("fs")
const path = require("path")

const PROJECT_ROOT = path.join(__dirname, "..")
const REPO_ROOT = path.join(PROJECT_ROOT, "..")
const SCHEMA_PATH = path.join(PROJECT_ROOT, "prisma", "schema.prisma")
const OUT_DIR = path.join(REPO_ROOT, "docs", "_artifacts")

function formatDate(d) {
    const pad = (n) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parseIndexFields(line) {
    const m = line.match(/\@\@(index|unique)\s*\(\s*\[([^\]]+)\]/)
    if (!m) return []
    const inner = m[2] || ""
    return inner
        .split(",")
        .map((s) => s.trim())
        .map((s) => s.replace(/^[\w]+\s*:\s*/g, ""))
        .map((s) => s.split(/\s+/)[0])
        .filter(Boolean)
}

function main() {
    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `db_design_audit_${date}.md`)

    if (!fs.existsSync(SCHEMA_PATH)) {
        throw new Error(`schema.prisma not found: ${SCHEMA_PATH}`)
    }

    const text = fs.readFileSync(SCHEMA_PATH, "utf8")
    const linesRaw = text.split(/\r?\n/)

    const models = []
    let i = 0
    while (i < linesRaw.length) {
        const line = linesRaw[i]
        const start = line.match(/^model\s+([A-Za-z0-9_]+)\s*\{/)
        if (!start) {
            i += 1
            continue
        }

        const modelName = start[1]
        const bodyLines = []
        const startLine = i + 1
        i += 1
        while (i < linesRaw.length && !/^\}/.test(linesRaw[i])) {
            bodyLines.push(linesRaw[i])
            i += 1
        }
        const endLine = i + 1
        models.push({ name: modelName, startLine, endLine, bodyLines })
        i += 1
    }

    const candidates = []
    for (const model of models) {
        const indexedFields = new Set()
        for (const line of model.bodyLines) {
            const fields = parseIndexFields(line)
            for (const f of fields) indexedFields.add(f)
        }

        for (const line of model.bodyLines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith("//")) continue
            if (trimmed.startsWith("@@")) continue

            const parts = trimmed.split(/\s+/)
            const fieldName = parts[0]
            if (!fieldName) continue
            if (fieldName === "id") continue
            if (!/Id$/.test(fieldName)) continue
            if (trimmed.includes("@unique") || trimmed.includes("@id")) continue
            if (indexedFields.has(fieldName)) continue

            candidates.push({ model: model.name, field: fieldName })
        }
    }

    candidates.sort((a, b) =>
        a.model === b.model ? a.field.localeCompare(b.field) : a.model.localeCompare(b.model)
    )

    const lines = []
    lines.push(`# Database Design Audit (${date})`)
    lines.push("")
    lines.push("> 目的：面向 30–300 人规模：尽量保证常用外键（*Id）有索引，避免热路径全表扫描。")
    lines.push("> 说明：这是启发式审计（schema 静态扫描），并不等同于实际查询计划分析；候选项需结合真实查询确认。")
    lines.push("")
    lines.push("## Summary")
    lines.push(`- models: ${models.length}`)
    lines.push(`- index candidates (*Id fields missing @@index): ${candidates.length}`)
    lines.push("")
    lines.push("## Candidates")
    if (!candidates.length) {
        lines.push("")
        lines.push("- ✅ None")
    } else {
        lines.push("")
        for (const c of candidates) {
            lines.push(`- \`${c.model}.${c.field}\`  (建议：为热路径添加 @@index([${c.field}]))`)
        }
    }

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[db-design] models: ${models.length}`)
    console.log(`[db-design] candidates: ${candidates.length}`)
    console.log(`[db-design] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)
}

main()

