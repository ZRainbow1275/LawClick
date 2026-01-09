const fs = require("fs")
const path = require("path")
const ts = require("typescript")

const PROJECT_ROOT = path.join(__dirname, "..")
const REPO_ROOT = path.join(PROJECT_ROOT, "..")
const SRC_DIR = path.join(PROJECT_ROOT, "src")
const APP_DIR = path.join(SRC_DIR, "app")
const DASHBOARD_APP_DIR = path.join(SRC_DIR, "app", "(dashboard)")
const OUT_DIR = path.join(REPO_ROOT, "docs", "_artifacts")

const LEGO_MARKERS = [
    "<SectionWorkspace",
    "<LegoDeck",
    "<PageWorkspace",
    "SectionWorkspace",
    "LegoDeck",
    "PageWorkspace",
]

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

function normalizeRouteFromPage(pageFilePath, scope) {
    const normalized = pageFilePath.replace(/\\/g, "/")
    const idx = normalized.indexOf("/src/app/")
    const after = idx >= 0 ? normalized.slice(idx + "/src/app/".length) : normalized
    const rel = after.replace(/\\/g, "/").replace(/\/page\.tsx$/, "")

    const segments = rel
        .split("/")
        .filter(Boolean)
        .filter((s) => !(s.startsWith("(") && s.endsWith(")")))
        .map((s) => {
            if (s.startsWith("[[...") && s.endsWith("]]")) return ":wildcard"
            if (s.startsWith("[...") && s.endsWith("]")) return ":wildcard"
            if (s.startsWith("[") && s.endsWith("]")) return `:${s.slice(1, -1)}`
            return s
        })

    const route = "/" + segments.join("/")
    if (scope === "dashboard" && route === "/") return "/dashboard"
    return route || "/"
}

function findFirstLine(sourceText, needle) {
    const lines = sourceText.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(needle)) return i + 1
    }
    return null
}

function hasLegoMarker(sourceText) {
    return LEGO_MARKERS.some((m) => sourceText.includes(m))
}

function findNearestLayoutWithLego(pageFilePath) {
    let dir = path.dirname(pageFilePath)
    while (dir.startsWith(APP_DIR)) {
        const layoutFile = path.join(dir, "layout.tsx")
        if (fs.existsSync(layoutFile)) {
            const evidence = traceForLegoEvidence(layoutFile)
            if (evidence) return evidence
        }
        const next = path.dirname(dir)
        if (next === dir) break
        dir = next
    }
    return null
}

function resolveModuleToFile(fromFilePath, moduleSpecifier) {
    const spec = String(moduleSpecifier || "")
    if (!spec) return null

    let base = null
    if (spec.startsWith("@/")) {
        base = path.join(SRC_DIR, spec.slice(2))
    } else if (spec.startsWith(".")) {
        base = path.resolve(path.dirname(fromFilePath), spec)
    } else {
        return null
    }

    const candidates = []
    if (base.endsWith(".ts") || base.endsWith(".tsx")) {
        candidates.push(base)
    } else {
        candidates.push(
            base + ".tsx",
            base + ".ts",
            path.join(base, "index.tsx"),
            path.join(base, "index.ts")
        )
    }

    return candidates.find((p) => fs.existsSync(p)) || null
}

function collectLocalImports(filePath, sf) {
    const namedByLocal = new Map()
    const defaultByLocal = new Map()
    const namespaceByLocal = new Map()

    for (const stmt of sf.statements) {
        if (!ts.isImportDeclaration(stmt)) continue
        if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue

        const resolved = resolveModuleToFile(filePath, stmt.moduleSpecifier.text)
        if (!resolved) continue

        const clause = stmt.importClause
        if (!clause || clause.isTypeOnly) continue

        if (clause.name) defaultByLocal.set(clause.name.text, resolved)

        const bindings = clause.namedBindings
        if (!bindings) continue
        if (ts.isNamedImports(bindings)) {
            for (const el of bindings.elements) {
                if (el.isTypeOnly) continue
                namedByLocal.set(el.name.text, resolved)
            }
        } else if (ts.isNamespaceImport(bindings)) {
            namespaceByLocal.set(bindings.name.text, resolved)
        }
    }

    return { namedByLocal, defaultByLocal, namespaceByLocal }
}

function extractJsxTagsFromReturns(root) {
    const tags = []

    const collectFromExpression = (expr) => {
        const visitExpr = (node) => {
            if (ts.isJsxElement(node)) tags.push(node.openingElement.tagName)
            if (ts.isJsxSelfClosingElement(node)) tags.push(node.tagName)
            ts.forEachChild(node, visitExpr)
        }
        visitExpr(expr)
    }

    const visit = (node) => {
        if (ts.isReturnStatement(node) && node.expression) {
            collectFromExpression(node.expression)
        }
        ts.forEachChild(node, visit)
    }

    visit(root)
    return tags
}

function resolveTagToFile(tag, imports) {
    if (!tag) return null

    if (ts.isIdentifier(tag)) {
        return (
            imports.namedByLocal.get(tag.text) ||
            imports.defaultByLocal.get(tag.text) ||
            imports.namespaceByLocal.get(tag.text) ||
            null
        )
    }

    if (ts.isJsxMemberExpression(tag)) {
        let base = tag.expression
        while (ts.isJsxMemberExpression(base)) base = base.expression
        if (ts.isIdentifier(base)) {
            return imports.namespaceByLocal.get(base.text) || imports.defaultByLocal.get(base.text) || null
        }
    }

    return null
}

function traceForLegoEvidence(entryFilePath, maxDepth = 2) {
    const queue = [{ filePath: entryFilePath, depth: 0 }]
    const visited = new Set()

    while (queue.length) {
        const item = queue.shift()
        if (!item) continue
        const { filePath, depth } = item
        if (!filePath || visited.has(filePath)) continue
        visited.add(filePath)

        if (!fs.existsSync(filePath)) continue
        const sourceText = fs.readFileSync(filePath, "utf8")
        if (hasLegoMarker(sourceText)) return filePath
        if (depth >= maxDepth) continue

        const sf = createSourceFile(filePath, sourceText)
        const imports = collectLocalImports(filePath, sf)
        const tags = extractJsxTagsFromReturns(sf)
        const nextTargets = new Set()
        for (const tag of tags) {
            const resolved = resolveTagToFile(tag, imports)
            if (!resolved) continue
            if (resolved.replace(/\\/g, "/").includes("/src/components/ui/")) continue
            nextTargets.add(resolved)
            if (nextTargets.size >= 20) break
        }
        for (const resolved of Array.from(nextTargets)) {
            queue.push({ filePath: resolved, depth: depth + 1 })
        }
    }

    return null
}

function run(scope) {
    const scanDir = scope === "all" ? APP_DIR : DASHBOARD_APP_DIR

    const pages = []
    walkDir(scanDir, (filePath) => {
        if (filePath.endsWith(`${path.sep}page.tsx`)) pages.push(filePath)
    })
    pages.sort((a, b) => a.localeCompare(b))

    const dashboardLayoutFile = path.join(DASHBOARD_APP_DIR, "layout.tsx")
    const dashboardLayoutText = fs.existsSync(dashboardLayoutFile)
        ? fs.readFileSync(dashboardLayoutFile, "utf8")
        : ""
    const dashboardLayoutLine = dashboardLayoutText
        ? findFirstLine(dashboardLayoutText, "<PageWorkspace")
        : null

    const results = []
    const layoutEvidenceFiles = new Set()
    if (scope === "all" && dashboardLayoutText && hasLegoMarker(dashboardLayoutText)) {
        layoutEvidenceFiles.add(dashboardLayoutFile)
    }
    for (const filePath of pages) {
        const rel = path.relative(REPO_ROOT, filePath).replace(/\\/g, "/")
        const route = normalizeRouteFromPage(rel, scope)
        const sourceText = fs.readFileSync(filePath, "utf8")

        const sf = createSourceFile(filePath, sourceText)
        const hasAnyJsxReturn = extractJsxTagsFromReturns(sf).length > 0
        const redirectTarget =
            !hasAnyJsxReturn && sourceText.includes("redirect(")
                ? (sourceText.match(/redirect\(\s*["']([^"']+)["']\s*\)/)?.[1] || null)
                : null
        if (redirectTarget) {
            results.push({
                route,
                page: rel,
                mode: "redirect",
                evidence: `${rel} -> ${redirectTarget}`,
            })
            continue
        }

        if (hasLegoMarker(sourceText)) {
            results.push({ route, page: rel, mode: "direct", evidence: rel })
            continue
        }

        const evidenceAbs = traceForLegoEvidence(filePath)
        if (evidenceAbs) {
            const evidenceRel = path.relative(REPO_ROOT, evidenceAbs).replace(/\\/g, "/")
            results.push({ route, page: rel, mode: "via-component", evidence: evidenceRel })
            continue
        }

        const layoutEvidenceAbs = findNearestLayoutWithLego(filePath)
        if (layoutEvidenceAbs) {
            layoutEvidenceFiles.add(layoutEvidenceAbs)
            const evidenceRel = path.relative(REPO_ROOT, layoutEvidenceAbs).replace(/\\/g, "/")
            results.push({ route, page: rel, mode: "via-layout", evidence: evidenceRel })
            continue
        }

        results.push({ route, page: rel, mode: "unknown", evidence: rel })
    }

    const direct = results.filter((r) => r.mode === "direct")
    const via = results.filter((r) => r.mode === "via-component")
    const viaLayout = results.filter((r) => r.mode === "via-layout")
    const redirectOnly = results.filter((r) => r.mode === "redirect")
    const unknown = results.filter((r) => r.mode === "unknown")

    const date = formatDate(new Date())
    const outPath = path.join(
        OUT_DIR,
        scope === "all"
            ? `lego_diy_coverage_audit_all_${date}.md`
            : `lego_diy_coverage_audit_${date}.md`
    )

    const lines = []
    lines.push(
        scope === "all"
            ? `# 全站乐高化 DIY 覆盖审计（All Pages）（${date}）`
            : `# 全站乐高化 DIY 覆盖审计（Dashboard）（${date}）`
    )
    lines.push("")
    lines.push(
        scope === "all"
            ? "> 目的：证明“不是只有任务/看板”，而是全站任意页面（含 Auth）都具备可拖拽/可记忆/可恢复的组件化 DIY 能力。"
            : "> 目的：证明“不是只有任务/看板”，而是 Dashboard 任意页面都具备可拖拽/可记忆/可恢复的组件化 DIY 能力。"
    )
    lines.push(
        "> 方法：静态扫描 + 最多两跳组件追踪 + 最近 layout.tsx 回溯。只要命中 `PageWorkspace/SectionWorkspace/LegoDeck` 即认为具备 DIY 基础能力。"
    )
    lines.push("")
    lines.push("## Global Wrapper")
    if (scope === "dashboard") {
        if (!dashboardLayoutText) {
            lines.push("")
            lines.push("- ❌ 未找到 `src/app/(dashboard)/layout.tsx`")
        } else if (!dashboardLayoutLine) {
            lines.push("")
            lines.push("- ❌ `src/app/(dashboard)/layout.tsx` 未检测到 `<PageWorkspace>`")
        } else {
            lines.push("")
            lines.push(
                `- ✅ \`lawclick-next/src/app/(dashboard)/layout.tsx:${dashboardLayoutLine}\` uses \`<PageWorkspace>\``
            )
        }
    } else {
        const layouts = Array.from(layoutEvidenceFiles)
            .map((p) => path.relative(REPO_ROOT, p).replace(/\\/g, "/"))
            .sort()
        lines.push("")
        lines.push(`- layouts with lego markers: ${layouts.length}`)
        for (const p of layouts) lines.push(`  - \`${p}\``)
    }
    lines.push("")
    lines.push("## Summary")
    lines.push(`- pages: ${results.length}`)
    lines.push(`- direct: ${direct.length}`)
    lines.push(`- via-component: ${via.length}`)
    lines.push(`- via-layout: ${viaLayout.length}`)
    lines.push(`- redirect-only: ${redirectOnly.length}`)
    lines.push(`- unknown: ${unknown.length}`)
    lines.push("")
    lines.push("## Coverage")
    lines.push("")
    lines.push("| Route | Page | Evidence | Mode |")
    lines.push("|---|---|---|---|")
    for (const r of results.sort((a, b) => a.route.localeCompare(b.route))) {
        lines.push(`| \`${r.route}\` | \`${r.page}\` | \`${r.evidence}\` | ${r.mode} |`)
    }
    lines.push("")

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[lego-diy] scope: ${scope}`)
    console.log(`[lego-diy] pages: ${results.length}`)
    console.log(`[lego-diy] direct: ${direct.length}`)
    console.log(`[lego-diy] via-component: ${via.length}`)
    console.log(`[lego-diy] via-layout: ${viaLayout.length}`)
    console.log(`[lego-diy] redirect-only: ${redirectOnly.length}`)
    console.log(`[lego-diy] unknown: ${unknown.length}`)
    console.log(`[lego-diy] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)

    if (unknown.length) process.exitCode = 1
}

function main() {
    const args = process.argv.slice(2)
    const onlyAll = args.includes("--all-app")
    const onlyDashboard = args.includes("--dashboard-only")

    if (onlyAll) {
        run("all")
        return
    }
    if (onlyDashboard) {
        run("dashboard")
        return
    }

    run("dashboard")
    run("all")
}

main()
