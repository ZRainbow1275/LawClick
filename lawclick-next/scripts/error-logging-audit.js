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

function isObjectLiteral(node) {
    return Boolean(node && ts.isObjectLiteralExpression(node))
}

function getPropNameText(nameNode) {
    if (!nameNode) return null
    if (ts.isIdentifier(nameNode)) return nameNode.text
    if (ts.isStringLiteral(nameNode)) return nameNode.text
    return null
}

function nodeTextSnippet(sourceText, pos) {
    const lines = sourceText.split(/\r?\n/)
    const line = sourceText.slice(0, pos).split("\n").length
    return { line, sample: (lines[line - 1] || "").trim() }
}

function hasSuspiciousErrorInitializer(initializer, sourceFile) {
    if (!initializer) return false
    const text = initializer.getText(sourceFile)
    if (/\berror\.message\b/.test(text)) return true
    if (/\bString\(\s*error\s*\)/.test(text)) return true
    if (/\bString\(\s*err\s*\)/.test(text)) return true
    if (/\bString\(\s*e\s*\)/.test(text)) return true
    if (/\berr\.message\b/.test(text)) return true
    if (/\be\.message\b/.test(text)) return true
    if (/\binstanceof\s+Error\s*\?\s*\w+\.message\b/.test(text)) return true
    return false
}

function collectReturnErrorMessageLeaks(filePath, sourceText) {
    const findings = []
    const sf = createSourceFile(filePath, sourceText)

    function visit(node) {
        if (ts.isReturnStatement(node) && node.expression && isObjectLiteral(node.expression)) {
            for (const prop of node.expression.properties) {
                if (!ts.isPropertyAssignment(prop)) continue
                const nameText = getPropNameText(prop.name)
                if (nameText !== "error") continue
                if (hasSuspiciousErrorInitializer(prop.initializer, sf)) {
                    const { line, sample } = nodeTextSnippet(sourceText, prop.getStart(sf, false))
                    findings.push({ kind: "return-error-message", line, sample })
                }
            }
        }

        if (ts.isCallExpression(node)) {
            const callee = node.expression.getText(sf)
            if (callee.includes("NextResponse.json") || callee.includes("NextResponse.redirect")) {
                const txt = node.getText(sf)
                if (/\berror\.message\b/.test(txt) || /\bString\(\s*error\s*\)/.test(txt)) {
                    const { line, sample } = nodeTextSnippet(sourceText, node.getStart(sf, false))
                    findings.push({ kind: "route-response-error-message", line, sample })
                }
            }
        }

        ts.forEachChild(node, visit)
    }

    visit(sf)
    return findings
}

function main() {
    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `error_logging_audit_${date}.md`)

    const roots = [
        path.join(SRC_DIR, "actions"),
        path.join(SRC_DIR, "app", "api"),
        path.join(SRC_DIR, "lib"),
    ]
    const findings = []
    let scanned = 0
    let consoleOutsideLogger = 0

    const consoleAllowlist = new Set(["src/lib/logger.ts"])

    for (const root of roots) {
        walkDir(root, (filePath) => {
            if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) return
            const rel = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, "/")
            const sourceText = fs.readFileSync(filePath, "utf8")
            scanned += 1

            if (/\bconsole\.(log|warn|error|info)\b/.test(sourceText) && !consoleAllowlist.has(rel)) {
                consoleOutsideLogger += 1
                const idx = sourceText.search(/\bconsole\.(log|warn|error|info)\b/)
                const { line, sample } = nodeTextSnippet(sourceText, idx >= 0 ? idx : 0)
                findings.push({ file: rel, line, kind: "console-usage", sample })
            }

            const fileFindings = collectReturnErrorMessageLeaks(filePath, sourceText)
            for (const f of fileFindings) {
                findings.push({ file: rel, ...f })
            }
        })
    }

    const byKind = new Map()
    for (const f of findings) {
        byKind.set(f.kind, (byKind.get(f.kind) || 0) + 1)
    }

    findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)))

    const lines = []
    lines.push(`# Error Handling & Logging Audit (${date})`)
    lines.push("")
    lines.push(
        "> 目的：统一错误处理与日志实践，避免把未知异常的 `error.message` 直接暴露给用户；避免在生产代码中散落 `console.*`。"
    )
    lines.push(
        "> 说明：这是静态审计。发现项需结合上下文判断是否“可公开”。默认倾向：用户错误只给业务语义文案，详细堆栈写入结构化日志。"
    )
    lines.push("")
    lines.push("## Summary")
    lines.push(`- scanned files: ${scanned}`)
    lines.push(`- findings: ${findings.length}`)
    lines.push(`- console usage outside logger: ${consoleOutsideLogger}`)
    lines.push("")
    lines.push("## Findings By Kind")
    if (!findings.length) {
        lines.push("")
        lines.push("- ✅ None")
    } else {
        lines.push("")
        for (const [kind, count] of Array.from(byKind.entries()).sort((a, b) => b[1] - a[1])) {
            lines.push(`- ${kind}: ${count}`)
        }

        lines.push("")
        lines.push("## Findings")
        lines.push("")
        for (const f of findings) {
            lines.push(`- \`${f.file}:${f.line}\` [${f.kind}] ${f.sample}`)
        }
    }

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[error-logging] scanned files: ${scanned}`)
    console.log(`[error-logging] findings: ${findings.length}`)
    console.log(`[error-logging] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)
}

main()

