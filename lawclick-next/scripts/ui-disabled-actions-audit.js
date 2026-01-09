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

function truncate(s, max = 160) {
    const text = String(s || "").trim().replace(/\s+/g, " ")
    if (text.length <= max) return text
    return text.slice(0, Math.max(0, max - 3)) + "..."
}

function getTagNameText(tagName, sourceFile) {
    if (!tagName) return ""
    return tagName.getText(sourceFile)
}

function collectText(node, sourceFile, out) {
    if (!node) return
    if (ts.isJsxText(node)) {
        const t = String(node.getText(sourceFile)).replace(/\s+/g, " ").trim()
        if (t) out.push(t)
        return
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const t = String(node.text || "").trim()
        if (t) out.push(t)
        return
    }
    node.forEachChild((child) => collectText(child, sourceFile, out))
}

function findDisabledButtons(sourceFile, relPath) {
    const candidates = []

    const visit = (node) => {
        if (ts.isJsxElement(node)) {
            const opening = node.openingElement
            const tag = getTagNameText(opening.tagName, sourceFile)
            if (tag === "Button") {
                const disabledAttr = (opening.attributes.properties || []).find(
                    (p) => ts.isJsxAttribute(p) && p.name?.text === "disabled"
                )
                if (disabledAttr) {
                    const init = disabledAttr.initializer
                    const isAlways =
                        !init ||
                        (ts.isJsxExpression(init) && init.expression && init.expression.kind === ts.SyntaxKind.TrueKeyword)
                    if (isAlways) {
                        const pos = opening.getStart(sourceFile, false)
                        const { line } = sourceFile.getLineAndCharacterOfPosition(pos)
                        const textBits = []
                        for (const child of node.children || []) collectText(child, sourceFile, textBits)
                        const label = truncate(textBits.join(" "))
                        candidates.push({ file: relPath, line: line + 1, label })
                    }
                }
            }
            for (const child of node.children) visit(child)
            return
        }

        if (ts.isJsxSelfClosingElement(node)) {
            const tag = getTagNameText(node.tagName, sourceFile)
            if (tag === "Button") {
                const disabledAttr = (node.attributes.properties || []).find(
                    (p) => ts.isJsxAttribute(p) && p.name?.text === "disabled"
                )
                if (disabledAttr) {
                    const init = disabledAttr.initializer
                    const isAlways =
                        !init ||
                        (ts.isJsxExpression(init) && init.expression && init.expression.kind === ts.SyntaxKind.TrueKeyword)
                    if (isAlways) {
                        const pos = node.getStart(sourceFile, false)
                        const { line } = sourceFile.getLineAndCharacterOfPosition(pos)
                        candidates.push({ file: relPath, line: line + 1, label: "(self-closing)" })
                    }
                }
            }
        }

        node.forEachChild(visit)
    }

    visit(sourceFile)
    return candidates
}

function main() {
    const roots = [path.join(SRC_DIR, "app"), path.join(SRC_DIR, "components")]
    const results = []
    let scanned = 0

    for (const root of roots) {
        walkDir(root, (filePath) => {
            if (!filePath.endsWith(".tsx")) return
            const rel = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, "/")
            if (rel.startsWith("src/components/ui/")) return
            const source = fs.readFileSync(filePath, "utf8")
            scanned += 1
            const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
            results.push(...findDisabledButtons(sf, rel))
        })
    }

    results.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)))

    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `ui_disabled_buttons_audit_${date}.md`)

    const lines = []
    lines.push(`# UI Disabled Buttons Audit (${date})`)
    lines.push("")
    lines.push("> 目的：发现 UI 中“永久禁用（disabled=true）”的按钮入口，避免出现占位/空壳功能。")
    lines.push("> 说明：仅扫描 TSX 中 `<Button disabled>`（字面量 true）场景；条件禁用（如 saving/权限）不会出现在此报告中。")
    lines.push("")
    lines.push("## Summary")
    lines.push(`- scanned tsx files: ${scanned}`)
    lines.push(`- disabled buttons: ${results.length}`)
    lines.push("")
    lines.push("## Candidates")
    if (results.length === 0) {
        lines.push("")
        lines.push("- ✅ None")
    } else {
        lines.push("")
        for (const r of results) {
            lines.push(`- \`${r.file}:${r.line}\` ${r.label ? `(${r.label})` : ""}`)
        }
    }

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[ui-disabled-buttons] scanned tsx files: ${scanned}`)
    console.log(`[ui-disabled-buttons] candidates: ${results.length}`)
    console.log(`[ui-disabled-buttons] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)

    if (results.length > 0) process.exit(1)
}

main()

