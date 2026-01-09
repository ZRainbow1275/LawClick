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

function getLineCol(sf, node) {
    const pos = node.getStart(sf, false)
    const { line, character } = sf.getLineAndCharacterOfPosition(pos)
    return { line: line + 1, column: character + 1 }
}

function normalizeRouteFromPage(pageFilePath) {
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
    return route || "/"
}

function getCalleeName(expr) {
    if (ts.isIdentifier(expr)) return expr.text
    if (ts.isPropertyAccessExpression(expr) || ts.isPropertyAccessChain(expr)) {
        return expr.name?.text || null
    }
    return null
}

function unwrapExpression(expr) {
    let current = expr
    while (current) {
        if (ts.isParenthesizedExpression(current)) {
            current = current.expression
            continue
        }
        if (ts.isAsExpression(current)) {
            current = current.expression
            continue
        }
        if (ts.isSatisfiesExpression(current)) {
            current = current.expression
            continue
        }
        if (ts.isNonNullExpression(current)) {
            current = current.expression
            continue
        }
        break
    }
    return current
}

function extractReturnExpression(fn) {
    if (!fn) return null
    if (ts.isArrowFunction(fn)) {
        if (ts.isBlock(fn.body)) {
            for (const stmt of fn.body.statements) {
                if (ts.isReturnStatement(stmt) && stmt.expression) return stmt.expression
            }
            return null
        }
        return fn.body
    }
    if (ts.isFunctionExpression(fn)) {
        for (const stmt of fn.body.statements) {
            if (ts.isReturnStatement(stmt) && stmt.expression) return stmt.expression
        }
    }
    return null
}

function createScopedConstResolver() {
    const envStack = [new Map()]

    const env = {
        get(name) {
            for (let i = envStack.length - 1; i >= 0; i -= 1) {
                const scope = envStack[i]
                if (scope.has(name)) return scope.get(name)
            }
            return null
        },
    }

    const enterBlockScope = () => envStack.push(new Map())
    const exitBlockScope = () => {
        if (envStack.length > 1) envStack.pop()
    }

    const recordConstInitializers = (node) => {
        if (!ts.isVariableStatement(node)) return
        const declList = node.declarationList
        if (!(declList.flags & ts.NodeFlags.Const)) return
        for (const decl of declList.declarations || []) {
            if (!ts.isIdentifier(decl.name)) continue
            if (!decl.initializer) continue
            envStack[envStack.length - 1].set(decl.name.text, decl.initializer)
        }
    }

    return { env, enterBlockScope, exitBlockScope, recordConstInitializers }
}

function resolveIdentifierToExpression(expr, env, visitedNames) {
    const unwrapped = unwrapExpression(expr)
    if (!unwrapped) return null
    if (!ts.isIdentifier(unwrapped)) return unwrapped
    const name = unwrapped.text
    if (visitedNames.has(name)) return null
    visitedNames.add(name)

    const init = env.get(name)
    if (!init) return unwrapped

    const initUnwrapped = unwrapExpression(init)
    if (initUnwrapped && ts.isCallExpression(initUnwrapped)) {
        const calleeName = getCalleeName(initUnwrapped.expression)
        if (calleeName === "useMemo") {
            const arg0 = initUnwrapped.arguments[0]
            if (arg0 && (ts.isArrowFunction(arg0) || ts.isFunctionExpression(arg0))) {
                const ret = extractReturnExpression(arg0)
                if (ret) return resolveIdentifierToExpression(ret, env, visitedNames)
            }
        }
    }

    return resolveIdentifierToExpression(initUnwrapped || init, env, visitedNames)
}

function mergeCount(a, b) {
    return {
        min: a.min + b.min,
        max: a.max + b.max,
        unknown: a.unknown || b.unknown,
    }
}

function parseArrayCount(expr, env, depth = 0) {
    if (!expr) return { min: 0, max: 0, unknown: true }
    if (depth > 8) return { min: 0, max: 0, unknown: true }

    const visited = new Set()
    const resolved = resolveIdentifierToExpression(expr, env, visited)
    const node = unwrapExpression(resolved || expr)
    if (!node) return { min: 0, max: 0, unknown: true }

    if (ts.isArrayLiteralExpression(node)) {
        let count = { min: 0, max: 0, unknown: false }
        for (const el of node.elements || []) {
            if (!el) continue
            if (ts.isSpreadElement(el)) {
                const nested = parseArrayCount(el.expression, env, depth + 1)
                count = mergeCount(count, nested)
                continue
            }
            count = mergeCount(count, { min: 1, max: 1, unknown: false })
        }
        return count
    }

    if (ts.isConditionalExpression(node)) {
        const t = parseArrayCount(node.whenTrue, env, depth + 1)
        const f = parseArrayCount(node.whenFalse, env, depth + 1)
        return {
            min: Math.min(t.min, f.min),
            max: Math.max(t.max, f.max),
            unknown: t.unknown || f.unknown,
        }
    }

    if (ts.isCallExpression(node)) {
        const calleeName = getCalleeName(node.expression)
        if (calleeName === "useMemo") {
            const arg0 = node.arguments[0]
            if (arg0 && (ts.isArrowFunction(arg0) || ts.isFunctionExpression(arg0))) {
                const ret = extractReturnExpression(arg0)
                if (ret) return parseArrayCount(ret, env, depth + 1)
            }
        }
        return { min: 0, max: 0, unknown: true }
    }

    return { min: 0, max: 0, unknown: true }
}

function getStringPropValue(attr) {
    if (!attr || !ts.isJsxAttribute(attr)) return null
    const init = attr.initializer
    if (!init) return null
    if (ts.isStringLiteral(init)) return init.text
    if (ts.isJsxExpression(init) && init.expression) {
        const expr = unwrapExpression(init.expression)
        return ts.isStringLiteral(expr) ? expr.text : null
    }
    return null
}

function getCatalogExpression(attr) {
    if (!attr || !ts.isJsxAttribute(attr)) return null
    const init = attr.initializer
    if (!init) return null
    if (ts.isJsxExpression(init)) return init.expression || null
    return null
}

function scanFile(fileAbsPath) {
    const normalized = fileAbsPath.replace(/\\/g, "/")
    if (!normalized.endsWith(".tsx")) return []
    if (normalized.includes("/src/components/ui/")) return []
    if (normalized.includes("/src/components/layout/section-workspace.tsx")) return []
    if (normalized.includes("/src/components/layout/LegoDeck.tsx")) return []
    if (normalized.includes("/.next/")) return []
    if (normalized.includes("/node_modules/")) return []

    const relToRepo = path.relative(REPO_ROOT, fileAbsPath).replace(/\\/g, "/")
    const relToProject = path.relative(PROJECT_ROOT, fileAbsPath).replace(/\\/g, "/")
    const route =
        relToRepo.includes("/src/app/") && relToRepo.endsWith("/page.tsx")
            ? normalizeRouteFromPage(relToRepo)
            : null

    const sourceText = fs.readFileSync(fileAbsPath, "utf8")
    const sf = createSourceFile(relToProject, sourceText)
    const scoped = createScopedConstResolver()

    const instances = []
    const visit = (node) => {
        let pushedScope = false
        if (ts.isBlock(node)) {
            scoped.enterBlockScope()
            pushedScope = true
        }

        scoped.recordConstInitializers(node)

        if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
            const tag = node.tagName
            const tagName = ts.isIdentifier(tag) ? tag.text : null
            if (tagName !== "SectionWorkspace" && tagName !== "LegoDeck") {
                ts.forEachChild(node, visit)
                return
            }

            const attrs = node.attributes?.properties || []
            const catalogAttr = attrs.find(
                (a) => ts.isJsxAttribute(a) && a.name?.text === "catalog"
            )
            const sectionIdAttr = attrs.find(
                (a) => ts.isJsxAttribute(a) && a.name?.text === "sectionId"
            )
            const titleAttr = attrs.find((a) => ts.isJsxAttribute(a) && a.name?.text === "title")

            const catalogExpr = catalogAttr ? getCatalogExpression(catalogAttr) : null
            const count = catalogExpr
                ? parseArrayCount(catalogExpr, scoped.env)
                : { min: 0, max: 0, unknown: true }

            const loc = getLineCol(sf, node)
            instances.push({
                kind: tagName,
                file: relToRepo,
                line: loc.line,
                column: loc.column,
                route,
                sectionId: sectionIdAttr ? getStringPropValue(sectionIdAttr) : null,
                title: titleAttr ? getStringPropValue(titleAttr) : null,
                countMin: count.min,
                countMax: count.max,
                countUnknown: count.unknown,
            })
        }
        ts.forEachChild(node, visit)

        if (pushedScope) scoped.exitBlockScope()
    }

    visit(sf)
    return instances
}

function main() {
    const instances = []
    walkDir(SRC_DIR, (filePath) => {
        if (!filePath.endsWith(".tsx")) return
        instances.push(...scanFile(filePath))
    })

    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `lego_diy_depth_audit_${date}.md`)

    const sectionWorkspaces = instances.filter((i) => i.kind === "SectionWorkspace")
    const legoDecks = instances.filter((i) => i.kind === "LegoDeck")

    const thin = instances.filter((i) => !i.countUnknown && i.countMax < 2)
    const unknownOnly = instances.filter((i) => i.countUnknown)

    const countBuckets = (list) => {
        const buckets = { unknown: 0, one: 0, two: 0, threePlus: 0 }
        for (const i of list) {
            if (i.countUnknown) buckets.unknown += 1
            else if (i.countMax <= 1) buckets.one += 1
            else if (i.countMax === 2) buckets.two += 1
            else buckets.threePlus += 1
        }
        return buckets
    }

    const swBuckets = countBuckets(sectionWorkspaces)
    const ldBuckets = countBuckets(legoDecks)

    const lines = []
    lines.push(`# 全站乐高化 DIY 深度审计（${date}）`)
    lines.push("")
    lines.push(
        "> 目的：回答“不是只有页面包一层 Workspace 就算乐高化”，而是检验各页面/组件是否真的拆成 **可拖拽/可缩放/可记忆/可恢复** 的模块（blocks）。"
    )
    lines.push(
        "> 方法：TypeScript AST 静态分析 `<SectionWorkspace ... catalog={...} />` 与 `<LegoDeck ... catalog={...} />` 的 `catalog`，尽量推导其数组长度范围（min/max）。"
    )
    lines.push("")

    lines.push("## Summary")
    lines.push(`- instances: ${instances.length}`)
    lines.push(`- SectionWorkspace: ${sectionWorkspaces.length}`)
    lines.push(`- LegoDeck: ${legoDecks.length}`)
    lines.push("")

    lines.push("## Catalog Size 分布（推导 max）")
    lines.push("")
    lines.push("| Kind | ? | 1 | 2 | >=3 |")
    lines.push("|---|---:|---:|---:|---:|")
    lines.push(
        `| SectionWorkspace | ${swBuckets.unknown} | ${swBuckets.one} | ${swBuckets.two} | ${swBuckets.threePlus} |`
    )
    lines.push(`| LegoDeck | ${ldBuckets.unknown} | ${ldBuckets.one} | ${ldBuckets.two} | ${ldBuckets.threePlus} |`)
    lines.push("")

    lines.push("## 明确薄弱点（max(catalog)<2）")
    if (!thin.length) {
        lines.push("")
        lines.push("- ✅ None")
        lines.push("")
    } else {
        lines.push("")
        lines.push("| Kind | Route | sectionId | File | Catalog |")
        lines.push("|---|---|---|---|---|")
        for (const i of thin
            .slice()
            .sort((a, b) =>
                a.kind === b.kind
                    ? a.file === b.file
                        ? a.line - b.line
                        : a.file.localeCompare(b.file)
                    : a.kind.localeCompare(b.kind)
            )) {
            const routeText = i.route ? `\`${i.route}\`` : "-"
            const sectionIdText = i.sectionId ? `\`${i.sectionId}\`` : "-"
            const fileText = `\`${i.file}:${i.line}\``
            const catalogText = i.countUnknown
                ? "?"
                : i.countMin === i.countMax
                  ? String(i.countMax)
                  : `${i.countMin}..${i.countMax}`
            lines.push(`| ${i.kind} | ${routeText} | ${sectionIdText} | ${fileText} | ${catalogText} |`)
        }
        lines.push("")
    }

    lines.push("## 需要人工确认（catalog 无法推导）")
    if (!unknownOnly.length) {
        lines.push("")
        lines.push("- ✅ None")
        lines.push("")
    } else {
        lines.push("")
        lines.push("> 说明：这些 `catalog` 往往由 `.map(...)` / 动态组合生成，静态无法得出长度；并不代表不乐高化，但建议对照 UI 进行抽样确认。")
        lines.push("")
        lines.push("| Kind | Route | sectionId | File |")
        lines.push("|---|---|---|---|")
        for (const i of unknownOnly
            .slice()
            .sort((a, b) =>
                a.kind === b.kind
                    ? a.file === b.file
                        ? a.line - b.line
                        : a.file.localeCompare(b.file)
                    : a.kind.localeCompare(b.kind)
            )
            .slice(0, 120)) {
            const routeText = i.route ? `\`${i.route}\`` : "-"
            const sectionIdText = i.sectionId ? `\`${i.sectionId}\`` : "-"
            const fileText = `\`${i.file}:${i.line}\``
            lines.push(`| ${i.kind} | ${routeText} | ${sectionIdText} | ${fileText} |`)
        }
        if (unknownOnly.length > 120) {
            lines.push("")
            lines.push(`> 仅展示前 120 条（共 ${unknownOnly.length} 条）。`)
        }
        lines.push("")
    }

    const byRoute = new Map()
    for (const i of instances) {
        if (!i.route) continue
        const arr = byRoute.get(i.route) || []
        arr.push(i)
        byRoute.set(i.route, arr)
    }

    const routes = Array.from(byRoute.keys()).sort()
    lines.push("## 路由抽样（每页 Workspace 概览）")
    if (!routes.length) {
        lines.push("")
        lines.push("- （未检测到 page.tsx）")
        lines.push("")
    } else {
        lines.push("")
        lines.push("| Route | SectionWorkspace | LegoDeck | max(catalog) min..max |")
        lines.push("|---|---:|---:|---|")
        for (const r of routes) {
            const list = byRoute.get(r) || []
            const sw = list.filter((x) => x.kind === "SectionWorkspace").length
            const ld = list.filter((x) => x.kind === "LegoDeck").length
            const knownMax = list.filter((x) => !x.countUnknown).map((x) => x.countMax)
            const minMax = knownMax.length ? `${Math.min(...knownMax)}..${Math.max(...knownMax)}` : "?"
            lines.push(`| \`${r}\` | ${sw} | ${ld} | ${minMax} |`)
        }
        lines.push("")
    }

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[lego-diy-depth] instances: ${instances.length}`)
    console.log(`[lego-diy-depth] SectionWorkspace: ${sectionWorkspaces.length}`)
    console.log(`[lego-diy-depth] LegoDeck: ${legoDecks.length}`)
    console.log(`[lego-diy-depth] thin: ${thin.length}`)
    console.log(`[lego-diy-depth] unknown: ${unknownOnly.length}`)
    console.log(`[lego-diy-depth] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)

    if (thin.length) process.exitCode = 1
}

main()
