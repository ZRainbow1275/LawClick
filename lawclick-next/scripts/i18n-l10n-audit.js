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

const EN_RE = /[A-Za-z]{3,}/
const ZH_RE = /[\u4e00-\u9fff]/

function isLikelyUserVisible(text) {
    const s = String(text || "").trim()
    if (!s) return false
    if (!EN_RE.test(s)) return false
    if (ZH_RE.test(s)) return false

    // allowlist: identifiers/keys/urls/emails/filepaths
    if (s.includes("http://") || s.includes("https://")) return false
    if (s.includes("@") && s.includes(".")) return false
    if (/^[a-z0-9:_-]+$/i.test(s)) return false
    if (/^[A-Z0-9_:-]+$/.test(s)) return false
    if (s.startsWith("pnpm ") || s.startsWith("node ")) return false
    if (s.includes(".ts") || s.includes(".tsx") || s.includes(".md")) return false
    if (s === "LawClick" || s.startsWith("E2E")) return false

    return true
}

function nodeLine(sourceText, pos) {
    const lines = sourceText.split(/\r?\n/)
    const line = sourceText.slice(0, pos).split("\n").length
    return { line, sample: (lines[line - 1] || "").trim() }
}

function main() {
    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `i18n_l10n_audit_${date}.md`)

    const roots = [path.join(SRC_DIR, "app"), path.join(SRC_DIR, "components")]
    const findings = []
    let scanned = 0

    const ATTR_NAMES = new Set([
        "title",
        "placeholder",
        "alt",
        "aria-label",
        "ariaLabel",
        "label",
        "description",
        "helperText",
    ])

    for (const root of roots) {
        walkDir(root, (filePath) => {
            if (!filePath.endsWith(".tsx")) return
            const rel = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, "/")
            const sourceText = fs.readFileSync(filePath, "utf8")
            scanned += 1

            const sf = createSourceFile(filePath, sourceText)

            function visit(node) {
                if (ts.isJsxAttribute(node) && node.initializer) {
                    const name = node.name?.getText(sf) || ""
                    if (ATTR_NAMES.has(name)) {
                        const init = node.initializer
                        if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
                            const value = init.text
                            if (isLikelyUserVisible(value)) {
                                const { line, sample } = nodeLine(sourceText, init.getStart(sf, false))
                                findings.push({ file: rel, line, text: value, sample })
                            }
                        } else if (ts.isJsxExpression(init) && init.expression) {
                            const expr = init.expression
                            if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
                                const value = expr.text
                                if (isLikelyUserVisible(value)) {
                                    const { line, sample } = nodeLine(sourceText, expr.getStart(sf, false))
                                    findings.push({ file: rel, line, text: value, sample })
                                }
                            }
                        }
                    }
                }

                if (ts.isCallExpression(node)) {
                    const expr = node.expression
                    if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
                        if (expr.expression.text === "toast") {
                            const arg0 = node.arguments[0]
                            if (arg0 && (ts.isStringLiteral(arg0) || ts.isNoSubstitutionTemplateLiteral(arg0))) {
                                const value = arg0.text
                                if (isLikelyUserVisible(value)) {
                                    const { line, sample } = nodeLine(sourceText, arg0.getStart(sf, false))
                                    findings.push({ file: rel, line, text: value, sample })
                                }
                            }
                        }
                    }
                }

                if (ts.isJsxText(node)) {
                    const value = node.getText(sf).trim()
                    if (isLikelyUserVisible(value)) {
                        const { line, sample } = nodeLine(sourceText, node.getStart(sf, false))
                        findings.push({ file: rel, line, text: value, sample })
                    }
                }

                ts.forEachChild(node, visit)
            }

            visit(sf)
        })
    }

    findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)))

    const lines = []
    lines.push(`# i18n / l10n Audit (${date})`)
    lines.push("")
    lines.push("> 目的：用户可见文案以中文（zh-CN）为主，技术标识/键名可保留英文。")
    lines.push("> 说明：这是启发式静态扫描（可能误报/漏报）。输出项需人工确认：要么翻译为中文，要么加入“明确的允许理由”。")
    lines.push("")
    lines.push("## Summary")
    lines.push(`- scanned files: ${scanned}`)
    lines.push(`- candidates: ${findings.length}`)
    lines.push("")
    lines.push("## Candidates")

    if (!findings.length) {
        lines.push("")
        lines.push("- ✅ None")
    } else {
        lines.push("")
        for (const f of findings) {
            lines.push(`- \`${f.file}:${f.line}\` ${f.text} | ${f.sample}`)
        }
    }

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[i18n-l10n] scanned files: ${scanned}`)
    console.log(`[i18n-l10n] candidates: ${findings.length}`)
    console.log(`[i18n-l10n] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)
}

main()
