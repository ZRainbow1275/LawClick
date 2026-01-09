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
const WORKSPACE_TAGS = new Set(["SectionWorkspace", "LegoDeck", "PageWorkspace"])
const CARD_TAGS = new Set(["Card", "StatCard"])

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

function getTagNameText(tagName, sourceFile) {
    if (!tagName) return ""
    return tagName.getText(sourceFile)
}

function isFreeformLayoutClass(classNameText) {
    const text = String(classNameText || "")
    if (!text) return false

    if (text.includes("space-y-") || text.includes("space-x-")) return true
    if (text.includes("divide-y") || text.includes("divide-x")) return true

    const hasFlex = /(^|\\s|:)flex\\b/.test(text)
    const hasFlexDir = /(^|\\s|:)flex-(col|row|wrap)\\b/.test(text)
    const hasGap = /(^|\\s|:)gap-/.test(text)
    if (hasFlex && hasFlexDir && hasGap) return true

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

function countCardTagsExcludingWorkspaces(rootNode, sourceFile) {
    let count = 0

    function visit(node) {
        if (ts.isJsxElement(node)) {
            const tag = getTagNameText(node.openingElement.tagName, sourceFile)
            if (WORKSPACE_TAGS.has(tag)) return
            if (CARD_TAGS.has(tag)) {
                count += 1
            } else if (CONTAINER_TAGS.has(tag)) {
                const classNameText = extractClassNameText(node.openingElement.attributes)
                if (isCardLikeClass(classNameText)) count += 1
            }
            for (const child of node.children) visit(child)
            return
        }

        if (ts.isJsxSelfClosingElement(node)) {
            const tag = getTagNameText(node.tagName, sourceFile)
            if (WORKSPACE_TAGS.has(tag)) return
            if (CARD_TAGS.has(tag)) {
                count += 1
            } else if (CONTAINER_TAGS.has(tag)) {
                const classNameText = extractClassNameText(node.attributes)
                if (isCardLikeClass(classNameText)) count += 1
            }
            return
        }

        ts.forEachChild(node, visit)
    }

    visit(rootNode)
    return count
}

function findFreeformCardStacks(sourceFile) {
    const candidates = []

    function visit(node) {
        if (ts.isJsxElement(node)) {
            const opening = node.openingElement
            const tag = getTagNameText(opening.tagName, sourceFile)
            if (!WORKSPACE_TAGS.has(tag) && CONTAINER_TAGS.has(tag)) {
                const classNameText = extractClassNameText(opening.attributes)
                if (isFreeformLayoutClass(classNameText)) {
                    const cardCount = countCardTagsExcludingWorkspaces(node, sourceFile)
                    if (cardCount >= 2) {
                        const pos = opening.getStart(sourceFile, false)
                        const { line } = sourceFile.getLineAndCharacterOfPosition(pos)
                        candidates.push({ line: line + 1, cardCount })
                    }
                }
            }

            ts.forEachChild(node, visit)
            return
        }

        if (ts.isJsxSelfClosingElement(node)) {
            ts.forEachChild(node, visit)
            return
        }

        ts.forEachChild(node, visit)
    }

    visit(sourceFile)
    return candidates
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
        totalTsxFiles += 1

        if (!includeUiFiles) {
            if (rel.startsWith("src/components/ui/") || rel.startsWith("src/components/layout/")) {
                skippedUiFiles += 1
                return
            }
        }

        const source = fs.readFileSync(filePath, "utf8")
        if (
            !includeWorkspaceFiles &&
            /<(SectionWorkspace|LegoDeck|PageWorkspace)\b/.test(source)
        ) {
            skippedWorkspaceFiles += 1
            return
        }

        scannedFiles += 1
        const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
        const stacks = findFreeformCardStacks(sf)
        if (!stacks.length) return

        const sourceLines = source.split(/\r?\n/)
        for (const stack of stacks) {
            results.push({
                file: rel,
                line: stack.line,
                cardCount: stack.cardCount,
                sample: truncate(sourceLines[stack.line - 1] || "", 180),
            })
        }
    })

    results.sort((a, b) => {
        return a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)
    })

    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `lego_freeform_coverage_audit_${date}.md`)

    const lines = []
    lines.push(`# Lego Freeform Coverage Audit (${date})`)
    lines.push("")
    lines.push(
        "> 目的：发现“非 grid 的固定卡片堆叠/分栏”（如 space-y/divide-y/flex-col）作为下一步把这些分区拆成可拖拽 `SectionWorkspace`/`LegoDeck` blocks 的待办清单。"
    )
    lines.push(
        "> 说明：这是静态扫描（TSX AST：定位容器布局 className，并统计其子树内 `<Card>`（排除 `SectionWorkspace`/`LegoDeck`/`PageWorkspace` 子树）），仍可能存在误报/漏报；用于指引改造优先级，不作为门禁。"
    )
    lines.push("")
    lines.push("## Summary")
    lines.push(`- total .tsx files: ${totalTsxFiles}`)
    lines.push(`- scanned .tsx files: ${scannedFiles}`)
    lines.push(`- skipped ui/layout .tsx files: ${skippedUiFiles}`)
    lines.push(`- skipped workspace .tsx files: ${skippedWorkspaceFiles}`)
    lines.push(`- mode: ${includeWorkspaceFiles ? "include-workspace" : "skip-workspace"} (use --include-workspace to include all)`)
    lines.push(`- mode: ${includeUiFiles ? "include-ui" : "skip-ui"} (use --include-ui to include src/components/ui/*)`)
    lines.push(`- candidates: ${results.length}`)
    lines.push("")
    lines.push("## Candidates")

    if (!results.length) {
        lines.push("")
        lines.push("- ✅ None")
    } else {
        lines.push("")
        for (const r of results) {
            lines.push(`- \`${r.file}:${r.line}\` (cards:${r.cardCount}) ${r.sample}`)
        }
    }

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[lego-freeform] total tsx files: ${totalTsxFiles}`)
    console.log(`[lego-freeform] scanned tsx files: ${scannedFiles}`)
    console.log(`[lego-freeform] skipped ui/layout tsx files: ${skippedUiFiles}`)
    console.log(`[lego-freeform] skipped workspace tsx files: ${skippedWorkspaceFiles}`)
    console.log(`[lego-freeform] candidates: ${results.length}`)
    console.log(`[lego-freeform] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)
}

main()
