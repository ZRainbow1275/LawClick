const fs = require("fs")
const path = require("path")
const ts = require("typescript")

const PROJECT_ROOT = path.join(__dirname, "..")
const REPO_ROOT = path.join(PROJECT_ROOT, "..")
const SRC_DIR = path.join(PROJECT_ROOT, "src")
const ACTIONS_DIR = path.join(SRC_DIR, "actions")
const OUT_DIR = path.join(REPO_ROOT, "docs", "_artifacts")

const UI_ROOT_DIRS = [
    path.join(SRC_DIR, "app"),
    path.join(SRC_DIR, "components"),
    path.join(SRC_DIR, "hooks"),
    path.join(SRC_DIR, "store"),
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

function getLineCol(sf, node) {
    const pos = node.getStart(sf, false)
    const { line, character } = sf.getLineAndCharacterOfPosition(pos)
    return { line: line + 1, column: character + 1 }
}

function createSourceFile(filePath, sourceText) {
    const kind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    return ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, kind)
}

function hasModifier(node, kind) {
    return Boolean(node.modifiers?.some((m) => m.kind === kind))
}

function collectActionExports() {
    const exports = []
    walkDir(ACTIONS_DIR, (filePath) => {
        if (!filePath.endsWith(".ts")) return
        const rel = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, "/")
        const sourceText = fs.readFileSync(filePath, "utf8")
        const sf = createSourceFile(filePath, sourceText)

        for (const stmt of sf.statements) {
            if (ts.isFunctionDeclaration(stmt)) {
                if (!stmt.name) continue
                if (!hasModifier(stmt, ts.SyntaxKind.ExportKeyword)) continue
                const loc = getLineCol(sf, stmt)
                exports.push({ file: rel, name: stmt.name.text, line: loc.line, column: loc.column })
                continue
            }

            if (ts.isVariableStatement(stmt)) {
                if (!hasModifier(stmt, ts.SyntaxKind.ExportKeyword)) continue
                for (const decl of stmt.declarationList.declarations || []) {
                    if (!ts.isIdentifier(decl.name)) continue
                    const init = decl.initializer
                    if (!init) continue
                    if (!ts.isArrowFunction(init) && !ts.isFunctionExpression(init)) continue
                    const loc = getLineCol(sf, decl)
                    exports.push({ file: rel, name: decl.name.text, line: loc.line, column: loc.column })
                }
            }
        }
    })

    const seen = new Set()
    const dedup = []
    for (const e of exports) {
        const key = `${e.file}::${e.name}::${e.line}::${e.column}`
        if (seen.has(key)) continue
        seen.add(key)
        dedup.push(e)
    }
    dedup.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)))
    return dedup
}

function isActionsPath(filePath) {
    const normalized = filePath.replace(/\\/g, "/")
    const actionsDir = ACTIONS_DIR.replace(/\\/g, "/")
    return normalized.startsWith(actionsDir + "/")
}

function isUiPath(filePath) {
    const normalized = filePath.replace(/\\/g, "/")
    return UI_ROOT_DIRS.some((root) => normalized.startsWith(root.replace(/\\/g, "/") + "/"))
}

function isLibPath(filePath) {
    return filePath.replace(/\\/g, "/").includes("/src/lib/")
}

function detectScope(filePath, sourceText) {
    if (isActionsPath(filePath)) return "actions"
    if (isUiPath(filePath)) return "ui"
    if (isLibPath(filePath)) {
        const trimmed = sourceText.trimStart()
        const isClient = trimmed.startsWith('"use client"') || trimmed.startsWith("'use client'")
        return isClient ? "ui" : "server"
    }
    return "server"
}

function isProbablyActionsModule(spec) {
    const s = String(spec || "")
    if (!s) return false
    if (s.startsWith("@/actions/")) return true
    if (s.includes("/actions/")) return true
    return false
}

function resolveActionsModuleFile(fromFilePath, moduleSpecifier) {
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
        candidates.push(base + ".ts", base + ".tsx", path.join(base, "index.ts"), path.join(base, "index.tsx"))
    }

    const resolved = candidates.find((p) => fs.existsSync(p))
    if (!resolved) return null

    const normalizedActionsDir = ACTIONS_DIR.replace(/\\/g, "/")
    const normalizedResolved = resolved.replace(/\\/g, "/")
    if (!normalizedResolved.startsWith(normalizedActionsDir)) return null

    return path.relative(PROJECT_ROOT, resolved).replace(/\\/g, "/")
}

function ensureUsage(usageByKey, key) {
    const existing = usageByKey.get(key)
    if (existing) return existing
    const next = {
        ui: { invoked: new Set(), referenced: new Set() },
        server: { invoked: new Set(), referenced: new Set() },
        actions: { invoked: new Set(), referenced: new Set() },
    }
    usageByKey.set(key, next)
    return next
}

function loadTsProgram() {
    const configPath =
        ts.findConfigFile(PROJECT_ROOT, ts.sys.fileExists, "tsconfig.json") ||
        path.join(PROJECT_ROOT, "tsconfig.json")

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
    if (configFile.error) {
        throw new Error(
            ts.formatDiagnostic(configFile.error, {
                getCanonicalFileName: (f) => f,
                getCurrentDirectory: () => PROJECT_ROOT,
                getNewLine: () => "\n",
            })
        )
    }

    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, PROJECT_ROOT)
    const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options })
    const checker = program.getTypeChecker()

    return { program, checker }
}

function canonicalSymbol(checker, symbol) {
    if (!symbol) return null
    try {
        if (symbol.flags & ts.SymbolFlags.Alias) return checker.getAliasedSymbol(symbol)
    } catch {
        // ignore
    }
    return symbol
}

function main() {
    const args = process.argv.slice(2)
    const shouldWriteReport = args.includes("--report")

    const { program, checker } = loadTsProgram()

    const exports = collectActionExports()
    const exportKeys = new Set(exports.map((e) => `${e.file}::${e.name}`))      

    const usageByKey = new Map()
    let scannedFiles = 0

    const srcDirNormalized = SRC_DIR.replace(/\\/g, "/").toLowerCase()

    for (const sf of program.getSourceFiles()) {
        const filePath = sf.fileName
        if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) continue
        if (filePath.endsWith(".d.ts")) continue

        const normalized = filePath.replace(/\\/g, "/").toLowerCase()
        if (!normalized.startsWith(srcDirNormalized + "/")) continue
        if (normalized.includes("/node_modules/")) continue
        if (normalized.includes("/.next/")) continue

        const rel = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, "/")
        const sourceText = sf.text || ""
        const scope = detectScope(filePath, sourceText)

        scannedFiles += 1

        const namedImportsByCanonical = new Map() // canonicalSymbol -> { file, name }
        const namespaceImportsByCanonical = new Map() // canonicalSymbol -> actions file rel

        for (const stmt of sf.statements) {
            if (!ts.isImportDeclaration(stmt)) continue
            const spec = stmt.moduleSpecifier
            if (!ts.isStringLiteral(spec)) continue
            if (!isProbablyActionsModule(spec.text)) continue

            const resolvedActionsFile = resolveActionsModuleFile(filePath, spec.text)
            if (!resolvedActionsFile) continue

            const importClause = stmt.importClause
            if (!importClause) continue
            if (importClause.isTypeOnly) continue

            const namedBindings = importClause.namedBindings
            if (!namedBindings) continue

            if (ts.isNamedImports(namedBindings)) {
                for (const el of namedBindings.elements) {
                    if (el.isTypeOnly) continue
                    const original = el.propertyName ? el.propertyName.text : el.name.text
                    const localSymbol = checker.getSymbolAtLocation(el.name)
                    const canonical = canonicalSymbol(checker, localSymbol)
                    if (!canonical) continue
                    namedImportsByCanonical.set(canonical, { file: resolvedActionsFile, name: original })
                }
            } else if (ts.isNamespaceImport(namedBindings)) {
                const nsSymbol = checker.getSymbolAtLocation(namedBindings.name)
                const canonical = canonicalSymbol(checker, nsSymbol)
                if (!canonical) continue
                namespaceImportsByCanonical.set(canonical, resolvedActionsFile)
            }
        }

        if (namedImportsByCanonical.size === 0 && namespaceImportsByCanonical.size === 0) continue

        const isInTypePosition = (node) => {
            let current = node
            while (current) {
                if (ts.isTypeNode(current)) return true
                if (ts.isSourceFile(current)) return false
                current = current.parent
            }
            return false
        }

        const markReferenced = (ref, fileRel) => {
            const key = `${ref.file}::${ref.name}`
            if (!exportKeys.has(key)) return
            ensureUsage(usageByKey, key)[scope].referenced.add(fileRel)
        }

        const markInvoked = (ref, fileRel) => {
            const key = `${ref.file}::${ref.name}`
            if (!exportKeys.has(key)) return
            const bucket = ensureUsage(usageByKey, key)[scope]
            bucket.invoked.add(fileRel)
            bucket.referenced.add(fileRel)
        }

        const resolveNamedRef = (identifierNode) => {
            const sym = checker.getSymbolAtLocation(identifierNode)
            const canonical = canonicalSymbol(checker, sym)
            if (!canonical) return null
            return namedImportsByCanonical.get(canonical) || null
        }

        const resolveNamespaceRef = (expr, name) => {
            if (!ts.isIdentifier(expr)) return null
            const sym = checker.getSymbolAtLocation(expr)
            const canonical = canonicalSymbol(checker, sym)
            if (!canonical) return null
            const actionsFile = namespaceImportsByCanonical.get(canonical)
            if (!actionsFile) return null
            return { file: actionsFile, name }
        }

        const visit = (node, onVisit) => {
            if (onVisit(node) === false) return
            node.forEachChild((child) => visit(child, onVisit))
        }

        visit(sf, (node) => {
            if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return false

            if (ts.isIdentifier(node)) {
                if (isInTypePosition(node)) return
                const ref = resolveNamedRef(node)
                if (ref) markReferenced(ref, rel)
                return
            }

            if (ts.isPropertyAccessExpression(node) || ts.isPropertyAccessChain(node)) {
                if (isInTypePosition(node)) return
                const ref = resolveNamespaceRef(node.expression, node.name.text)
                if (ref) markReferenced(ref, rel)
                return
            }

            if (ts.isJsxAttribute(node)) {
                const attrName = node.name?.text || ""
                if (attrName !== "action" && attrName !== "formAction") return
                const init = node.initializer
                if (!init || !ts.isJsxExpression(init) || !init.expression) return

                const expr = init.expression
                if (ts.isIdentifier(expr)) {
                    const ref = resolveNamedRef(expr)
                    if (ref) markInvoked(ref, rel)
                    return
                }
                if (ts.isPropertyAccessExpression(expr) || ts.isPropertyAccessChain(expr)) {
                    const ref = resolveNamespaceRef(expr.expression, expr.name.text)
                    if (ref) markInvoked(ref, rel)
                }
                return
            }

            if (ts.isCallExpression(node)) {
                const callee = node.expression

                if (ts.isIdentifier(callee)) {
                    const ref = resolveNamedRef(callee)
                    if (ref) markInvoked(ref, rel)
                    return
                }

                if (ts.isPropertyAccessExpression(callee) || ts.isPropertyAccessChain(callee)) {
                    // action.bind(...)
                    if (callee.name?.text === "bind") {
                        const base = callee.expression
                        if (ts.isIdentifier(base)) {
                            const ref = resolveNamedRef(base)
                            if (ref) markInvoked(ref, rel)
                            return
                        }
                        if (ts.isPropertyAccessExpression(base) || ts.isPropertyAccessChain(base)) {
                            const ref = resolveNamespaceRef(base.expression, base.name.text)
                            if (ref) markInvoked(ref, rel)
                            return
                        }
                    }

                    // ns.action(...)
                    const ref = resolveNamespaceRef(callee.expression, callee.name.text)
                    if (ref) markInvoked(ref, rel)
                }
            }
        })
    }

    const withUiInvoked = []
    const uiReferencedOnly = []
    const noUiUsage = []

    for (const e of exports) {
        const key = `${e.file}::${e.name}`
        const usage = usageByKey.get(key) || {
            ui: { invoked: new Set(), referenced: new Set() },
            server: { invoked: new Set(), referenced: new Set() },
            actions: { invoked: new Set(), referenced: new Set() },
        }

        if (usage.ui.invoked.size > 0) {
            withUiInvoked.push(e)
            continue
        }
        if (usage.ui.referenced.size > 0) {
            uiReferencedOnly.push(e)
            continue
        }
        noUiUsage.push(e)
    }

    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `actions_ui_invocation_audit_${date}.md`)

    const renderSample = (set) => Array.from(set).sort().slice(0, 3)
    const getUsage = (key) =>
        usageByKey.get(key) || {
            ui: { invoked: new Set(), referenced: new Set() },
            server: { invoked: new Set(), referenced: new Set() },
            actions: { invoked: new Set(), referenced: new Set() },
        }

    const lines = []
    lines.push(`# Actions ↔ UI 调用覆盖审计（${date}）`)
    lines.push("")
    lines.push(
        "> 目的：枚举「Server Actions 已导出但 UI 未真实调用/绑定」的缺口，避免仅 import/仅引用导致的“伪覆盖”。"
    )
    lines.push(
        "> 方法：TypeScript AST 扫描。统计以下“调用入口”：直接调用 `action()`、绑定 `action.bind()`、JSX `action/formAction` 属性。"
    )
    lines.push("")
    lines.push("## Summary")
    lines.push(`- actions exports: ${exports.length}`)
    lines.push(`- scanned src files: ${scannedFiles}`)
    lines.push(`- UI-invoked exports: ${withUiInvoked.length}`)
    lines.push(`- UI-referenced-only exports: ${uiReferencedOnly.length}`)
    lines.push(`- no UI usage exports: ${noUiUsage.length}`)
    lines.push("")

    const renderList = (title, list, mode) => {
        lines.push(`## ${title}`)
        if (!list.length) {
            lines.push("")
            lines.push("- ✅ None")
            lines.push("")
            return
        }

        const grouped = new Map()
        for (const item of list) {
            const arr = grouped.get(item.file) || []
            arr.push(item)
            grouped.set(item.file, arr)
        }

        const files = Array.from(grouped.keys()).sort()
        for (const file of files) {
            lines.push("")
            lines.push(`### \`${file}\``)
            const items = grouped.get(file) || []
            items.sort((a, b) => a.name.localeCompare(b.name))
            for (const item of items) {
                const key = `${item.file}::${item.name}`
                const usage = getUsage(key)
                const samples =
                    mode === "ref"
                        ? renderSample(usage.ui.referenced)
                        : mode === "none"
                          ? []
                          : renderSample(usage.ui.invoked)
                const sampleText = samples.length ? `，例：${samples.map((s) => `\`${s}\``).join(", ")}` : ""
                lines.push(`- \`${item.name}\` \`${item.file}:${item.line}:${item.column}\`${sampleText}`)
            }
        }
        lines.push("")
    }

    renderList("⚠️ UI 仅引用未调用（可能缺接线）", uiReferencedOnly, "ref")
    renderList("❌ 无 UI 使用（可能缺入口/或应取消导出）", noUiUsage, "none")

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[actions-ui-invoke] actions exports: ${exports.length}`)
    console.log(`[actions-ui-invoke] scanned src files: ${scannedFiles}`)
    console.log(`[actions-ui-invoke] UI-invoked: ${withUiInvoked.length}`)
    console.log(`[actions-ui-invoke] UI-referenced-only: ${uiReferencedOnly.length}`)
    console.log(`[actions-ui-invoke] no UI usage: ${noUiUsage.length}`)
    console.log(`[actions-ui-invoke] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)

    if (shouldWriteReport) {
        // already wrote the report above; keep flag for symmetry with other audits
    }

    if (uiReferencedOnly.length || noUiUsage.length) process.exitCode = 1
}

main()
