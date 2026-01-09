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

function truncate(s, max = 140) {
    const text = String(s || "").trim().replace(/\s+/g, " ")
    if (text.length <= max) return text
    return text.slice(0, Math.max(0, max - 3)) + "..."
}

const CONTAINER_TAGS = new Set(["div", "section", "main", "aside"])
const CARD_TAGS = new Set(["Card", "StatCard"])

function getTagNameText(tagName, sourceFile) {
    if (!tagName) return ""
    return tagName.getText(sourceFile)
}

function collectStringLiterals(node, out) {
    if (!node) return
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        out.push(node.text)
        return
    }
    ts.forEachChild(node, (child) => collectStringLiterals(child, out))
}

function extractClassNameText(attributes) {
    if (!attributes) return ""
    for (const prop of attributes.properties || []) {
        if (!ts.isJsxAttribute(prop)) continue
        if (prop.name?.text !== "className") continue
        const init = prop.initializer
        if (!init) return ""
        if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
            return init.text
        }
        if (ts.isJsxExpression(init)) {
            const out = []
            if (init.expression) collectStringLiterals(init.expression, out)
            return out.join(" ")
        }
        return ""
    }
    return ""
}

function isLikelyLayoutContainerClass(classNameText) {
    const text = String(classNameText || "").trim()
    if (!text) return false

    const hasGrid = /(^|\s|:)grid\b/.test(text)
    const hasGridCols = /(^|\s|:)grid-cols-/.test(text)
    if (hasGrid && hasGridCols) return true

    const hasFlex = /(^|\s|:)flex\b/.test(text)
    const hasGap = /(^|\s|:)gap-/.test(text)
    const hasFlexDir = /(^|\s|:)flex-(row|col|wrap)\b/.test(text) || /:flex-(row|col|wrap)\b/.test(text)
    if (hasFlex && hasGap && hasFlexDir) return true

    return false
}

function isCardLikeClass(classNameText) {
    const text = String(classNameText || "").trim()
    if (!text) return false

    const hasRounded = /(^|\s|:)rounded(-[^\s]+)?\b/.test(text)
    const hasBorder = /(^|\s|:)border(-[^\s]+)?\b/.test(text)
    if (!(hasRounded && hasBorder)) return false

    const hasBg = /(^|\s|:)bg-(card|background|muted)(\/[0-9]+)?\b/.test(text)
    if (hasBg) return true

    const hasShadow = /(^|\s|:)shadow(-[^\s]+)?\b/.test(text)
    return hasShadow
}

function countCardLikeNodesInNode(node, sourceFile) {
    let count = 0
    function visit(n) {
        if (ts.isJsxElement(n)) {
            const opening = n.openingElement
            const tag = getTagNameText(opening.tagName, sourceFile)
            if (CARD_TAGS.has(tag)) {
                count += 1
            } else if (CONTAINER_TAGS.has(tag)) {
                const classNameText = extractClassNameText(opening.attributes)
                if (isCardLikeClass(classNameText)) count += 1
            }
        } else if (ts.isJsxSelfClosingElement(n)) {
            const tag = getTagNameText(n.tagName, sourceFile)
            if (CARD_TAGS.has(tag)) {
                count += 1
            } else if (CONTAINER_TAGS.has(tag)) {
                const classNameText = extractClassNameText(n.attributes)
                if (isCardLikeClass(classNameText)) count += 1
            }
        }
        ts.forEachChild(n, visit)
    }
    visit(node)
    return count
}

function findFixedCardLayoutContainers(sourceFile) {
    const containers = []
    function visit(n) {
        if (ts.isJsxElement(n)) {
            const opening = n.openingElement
            const tag = getTagNameText(opening.tagName, sourceFile)
            if (CONTAINER_TAGS.has(tag)) {
                const classNameText = extractClassNameText(opening.attributes)
                if (isLikelyLayoutContainerClass(classNameText)) {
                    const cardCount = countCardLikeNodesInNode(n, sourceFile)
                    if (cardCount >= 2) {
                        const pos = opening.getStart(sourceFile, false)
                        const { line } = sourceFile.getLineAndCharacterOfPosition(pos)
                        containers.push({ line: line + 1, classNameText, cardCount })
                    }
                }
            }
        }
        ts.forEachChild(n, visit)
    }
    visit(sourceFile)
    return containers
}

function main() {
    const includeWorkspaceFiles = process.argv.includes("--include-workspace")
    const includeUiFiles = process.argv.includes("--include-ui")

    const results = []
    let totalTsxFiles = 0
    let skippedUiFiles = 0
    let skippedWorkspaceFiles = 0
    let scannedFiles = 0

    walkDir(SRC_DIR, (filePath) => {
        if (!filePath.endsWith(".tsx")) return
        const rel = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, "/")   
        const source = fs.readFileSync(filePath, "utf8")
        totalTsxFiles += 1
        if (
            !includeUiFiles &&
            (rel.startsWith("src/components/ui/") || rel.startsWith("src/components/layout/"))
        ) {
            skippedUiFiles += 1
            return
        }
        if (
            !includeWorkspaceFiles &&
            /<(SectionWorkspace|LegoDeck|PageWorkspace)\b/.test(source)
        ) {
            skippedWorkspaceFiles += 1
            return
        }
        scannedFiles += 1
        const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
        const containers = findFixedCardLayoutContainers(sf)
        if (!containers.length) return

        const sourceLines = source.split(/\r?\n/)
        for (const c of containers) {
            const lineText = sourceLines[c.line - 1] || ""
            results.push({
                file: rel,
                line: c.line,
                sample: truncate(lineText),
                cardCount: c.cardCount,
            })
        }
    })

    results.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)))

    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `lego_coverage_audit_${date}.md`)

    const lines = []
    lines.push(`# Lego Coverage Audit (${date})`)
    lines.push("")
    lines.push("> 目的：枚举“固定网格/卡片栏 + Card”热点，作为下一步把更多卡片栏/分栏拆成可拖拽 `SectionWorkspace`/`LegoDeck` 的待办清单。")
    lines.push("> 说明：这是静态扫描（TSX AST 解析：定位布局容器（grid-cols / flex-row|col）并统计其子树中的 <Card> 数量），仍可能存在误报/漏报；用于指导改造优先级，不作为门禁。")
    lines.push("")
    lines.push("## Summary")
    lines.push(`- total .tsx files: ${totalTsxFiles}`)
    lines.push(`- scanned .tsx files: ${scannedFiles}`)
    lines.push(`- skipped ui/layout .tsx files: ${skippedUiFiles}`)
    lines.push(`- skipped (already using Page/SectionWorkspace or LegoDeck): ${skippedWorkspaceFiles}`)
    lines.push(`- mode: ${includeWorkspaceFiles ? "include-workspace" : "skip-workspace"} (use --include-workspace to include all)`)
    lines.push(`- mode: ${includeUiFiles ? "include-ui" : "skip-ui"} (use --include-ui to include src/components/ui/*)`)
    lines.push(`- candidate fixed card grids: ${results.length}`)
    lines.push("")
    lines.push("## Candidates")
    if (results.length === 0) {
        lines.push("")
        lines.push("- ✅ None")
    } else {
        lines.push("")
        for (const r of results) {
            lines.push(`- \`${r.file}:${r.line}\` (${r.cardCount} cards) ${r.sample}`)
        }
    }

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[lego-coverage] total tsx files: ${totalTsxFiles}`)
    console.log(`[lego-coverage] scanned tsx files: ${scannedFiles}`)
    console.log(`[lego-coverage] skipped ui/layout tsx files: ${skippedUiFiles}`)
    console.log(`[lego-coverage] skipped workspace tsx files: ${skippedWorkspaceFiles}`)
    console.log(`[lego-coverage] candidate grids: ${results.length}`)
    console.log(`[lego-coverage] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)
}

main()
