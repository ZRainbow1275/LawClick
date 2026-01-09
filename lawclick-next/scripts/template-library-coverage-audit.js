const fs = require("fs")
const path = require("path")

const PROJECT_ROOT = path.join(__dirname, "..")
const REPO_ROOT = path.join(PROJECT_ROOT, "..")
const OUT_DIR = path.join(REPO_ROOT, "docs", "_artifacts")

const DOC_PATH = path.join(REPO_ROOT, "docs", "法律文书模板完整清单_2026-01-04.md")
const BUILTIN_PATH = path.join(
    PROJECT_ROOT,
    "src",
    "lib",
    "templates",
    "builtin",
    "builtin-document-templates.ts"
)

function formatDate(d) {
    const pad = (n) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function readText(filePath) {
    return fs.readFileSync(filePath, "utf8")
}

function extractTemplateCodesFromDoc(markdown) {
    const matches = markdown.match(/\b[A-Z]-\d{2}\b/g) || []
    return Array.from(new Set(matches)).sort()
}

function extractTemplateCodesFromBuiltin(source) {
    const codes = new Set()
    for (const line of source.split(/\r?\n/)) {
        const m = /\{\s*code:\s*"([A-Z]-\d{2})"/.exec(line)
        if (m) codes.add(m[1])
    }
    return Array.from(codes).sort()
}

function countByPrefix(codes) {
    const counts = {}
    for (const code of codes) {
        const prefix = String(code).split("-")[0] || "?"
        counts[prefix] = (counts[prefix] || 0) + 1
    }
    return counts
}

function main() {
    if (!fs.existsSync(DOC_PATH)) {
        console.error(`[template-library] missing doc: ${DOC_PATH}`)
        process.exitCode = 1
        return
    }
    if (!fs.existsSync(BUILTIN_PATH)) {
        console.error(`[template-library] missing builtin source: ${BUILTIN_PATH}`)
        process.exitCode = 1
        return
    }

    const docText = readText(DOC_PATH)
    const builtinText = readText(BUILTIN_PATH)
    const docCodes = extractTemplateCodesFromDoc(docText)
    const builtinCodes = extractTemplateCodesFromBuiltin(builtinText)

    const missingInBuiltin = docCodes.filter((c) => !builtinCodes.includes(c))
    const extraInBuiltin = builtinCodes.filter((c) => !docCodes.includes(c))

    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `template_library_coverage_audit_${date}.md`)

    const lines = []
    lines.push(`# Template Library Coverage Audit (${date})`)
    lines.push("")
    lines.push("> 目的：确保 `docs/法律文书模板完整清单_2026-01-04.md` 与内置模板库 1:1 对齐，避免“清单写了但系统无法同步/生成”的潜在不一致风险。")
    lines.push("> 说明：此审计只做静态对齐校验（不连接数据库）。如需落库，请在管理后台使用“同步内置文书模板”。")
    lines.push("")
    lines.push("## Summary")
    lines.push(`- doc codes: ${docCodes.length}`)
    lines.push(`- builtin codes: ${builtinCodes.length}`)
    lines.push(`- missing in builtin: ${missingInBuiltin.length}`)
    lines.push(`- extra in builtin: ${extraInBuiltin.length}`)
    lines.push("")
    lines.push("## Breakdown (doc)")
    const docCounts = countByPrefix(docCodes)
    const docKeys = Object.keys(docCounts).sort()
    for (const k of docKeys) {
        lines.push(`- ${k}: ${docCounts[k]}`)
    }
    lines.push("")

    lines.push("## Missing In Builtin")
    if (missingInBuiltin.length === 0) {
        lines.push("")
        lines.push("- ✅ None")
    } else {
        lines.push("")
        for (const code of missingInBuiltin) lines.push(`- \`${code}\``)
    }
    lines.push("")

    lines.push("## Extra In Builtin")
    if (extraInBuiltin.length === 0) {
        lines.push("")
        lines.push("- ✅ None")
    } else {
        lines.push("")
        for (const code of extraInBuiltin) lines.push(`- \`${code}\``)
    }
    lines.push("")

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[template-library] doc codes: ${docCodes.length}`)
    console.log(`[template-library] builtin codes: ${builtinCodes.length}`)
    console.log(`[template-library] missing in builtin: ${missingInBuiltin.length}`)
    console.log(`[template-library] extra in builtin: ${extraInBuiltin.length}`)
    console.log(`[template-library] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)

    if (missingInBuiltin.length || extraInBuiltin.length) process.exitCode = 1
}

main()

