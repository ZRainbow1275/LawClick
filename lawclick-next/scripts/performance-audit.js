const fs = require("fs")
const path = require("path")
const ts = require("typescript")

const PROJECT_ROOT = path.join(__dirname, "..")
const REPO_ROOT = path.join(PROJECT_ROOT, "..")
const SRC_DIR = path.join(PROJECT_ROOT, "src")
const OUT_DIR = path.join(REPO_ROOT, "docs", "_artifacts")

function formatDate(d) {
    const pad = (n) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function walkDir(dir, onFile) {
    if (!fs.existsSync(dir)) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            walkDir(full, onFile)
            continue
        }
        if (entry.isFile()) onFile(full)
    }
}

function createSourceFile(filePath, sourceText) {
    const kind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    return ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, kind)
}

function nodeLine(sourceText, pos) {
    const lines = sourceText.split(/\r?\n/)
    const line = sourceText.slice(0, pos).split("\n").length
    return { line, sample: (lines[line - 1] || "").trim() }
}

function objectHasProperty(obj, propName) {
    if (!obj || !ts.isObjectLiteralExpression(obj)) return false
    return obj.properties.some((p) => {
        if (ts.isPropertyAssignment(p)) {
            if (ts.isIdentifier(p.name)) return p.name.text === propName
            if (ts.isStringLiteral(p.name)) return p.name.text === propName
            return false
        }
        if (ts.isShorthandPropertyAssignment(p)) {
            return p.name.text === propName
        }
        return false
    })
}

function main() {
    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `performance_audit_${date}.md`)

    const roots = [path.join(SRC_DIR, "actions"), path.join(SRC_DIR, "app", "api")]
    const findings = []
    let scanned = 0
    let findManyCalls = 0

    for (const root of roots) {
        walkDir(root, (filePath) => {
            if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) return
            const rel = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, "/")
            const sourceText = fs.readFileSync(filePath, "utf8")
            scanned += 1
            const sf = createSourceFile(filePath, sourceText)

            function visit(node) {
                if (ts.isCallExpression(node)) {
                    const expr = node.expression
                    if (ts.isPropertyAccessExpression(expr) && expr.name.text === "findMany") {
                        findManyCalls += 1
                        const arg0 = node.arguments[0]
                        const hasTake = objectHasProperty(arg0, "take")
                        const hasCursor = objectHasProperty(arg0, "cursor")
                        const hasSkip = objectHasProperty(arg0, "skip")
                        if (!hasTake && !hasCursor && !hasSkip) {
                            const { line, sample } = nodeLine(sourceText, node.getStart(sf, false))
                            findings.push({ file: rel, line, kind: "prisma-findMany-unbounded", sample })
                        }
                    }
                }
                ts.forEachChild(node, visit)
            }

            visit(sf)
        })
    }

    findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)))

    const lines = []
    lines.push(`# Performance Audit (${date})`)
    lines.push("")
    lines.push("> 目的：在 30–300 人协作场景下，优先避免“无界查询/无界列表”导致的数据库与渲染压力。")
    lines.push("> 说明：这是启发式静态审计：当前仅聚焦 Prisma `findMany` 是否显式限制（`take/cursor/skip`）。")
    lines.push("")
    lines.push("## Summary")
    lines.push(`- scanned files: ${scanned}`)
    lines.push(`- prisma findMany calls: ${findManyCalls}`)
    lines.push(`- unbounded findMany candidates: ${findings.length}`)
    lines.push("")
    lines.push("## Candidates")
    if (!findings.length) {
        lines.push("")
        lines.push("- ✅ None")
    } else {
        lines.push("")
        for (const f of findings) {
            lines.push(`- \`${f.file}:${f.line}\` [${f.kind}] ${f.sample}`)
        }
    }

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[performance] scanned files: ${scanned}`)
    console.log(`[performance] findMany calls: ${findManyCalls}`)
    console.log(`[performance] candidates: ${findings.length}`)
    console.log(`[performance] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)
}

main()
