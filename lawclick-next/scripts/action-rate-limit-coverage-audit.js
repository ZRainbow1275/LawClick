const fs = require("fs")
const path = require("path")
const ts = require("typescript")

const PROJECT_ROOT = path.join(__dirname, "..")
const REPO_ROOT = path.join(PROJECT_ROOT, "..")
const ACTIONS_DIR = path.join(PROJECT_ROOT, "src", "actions")
const SRC_DIR = path.join(PROJECT_ROOT, "src")
const OUT_DIR = path.join(REPO_ROOT, "docs", "_artifacts")

const fileTextCache = new Map()
const sourceFileCache = new Map()
const exportRateLimitCache = new Map()

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

function readFileText(filePath) {
    const cached = fileTextCache.get(filePath)
    if (typeof cached === "string") return cached
    const text = fs.readFileSync(filePath, "utf8")
    fileTextCache.set(filePath, text)
    return text
}

function createSourceFile(filePath, sourceText) {
    const kind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    return ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, kind)
}

function getSourceFileForPath(filePath) {
    const cached = sourceFileCache.get(filePath)
    if (cached) return cached
    const sf = createSourceFile(filePath, readFileText(filePath))
    sourceFileCache.set(filePath, sf)
    return sf
}

function hasModifier(node, kind) {
    return Array.isArray(node.modifiers) && node.modifiers.some((m) => m.kind === kind)
}

function isExported(node) {
    return hasModifier(node, ts.SyntaxKind.ExportKeyword)
}

function isAsync(node) {
    return hasModifier(node, ts.SyntaxKind.AsyncKeyword)
}

function getCalleeName(expr) {
    if (!expr) return null
    if (ts.isIdentifier(expr)) return expr.text
    if (ts.isPropertyAccessExpression(expr)) return expr.name.text
    return null
}

function functionBodyContainsRateLimitCall(body) {
    if (!body) return false

    let found = false
    const visit = (node) => {
        if (found) return
        if (ts.isCallExpression(node)) {
            const calleeName = getCalleeName(node.expression)
            if (
                calleeName === "checkRateLimit" ||
                calleeName === "enforceActionRateLimit" ||
                calleeName === "enforceRateLimit"
            ) {
                found = true
                return
            }
        }
        ts.forEachChild(node, visit)
    }
    visit(body)
    return found
}

function resolveImportTargetFile(fromFilePath, spec) {
    const raw = String(spec || "")
    if (!raw) return null

    let base = null
    if (raw.startsWith("@/")) {
        base = path.join(SRC_DIR, raw.slice(2))
    } else if (raw.startsWith(".")) {
        base = path.resolve(path.dirname(fromFilePath), raw)
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
    return resolved || null
}

function collectImportMapForFile(filePath) {
    const sf = getSourceFileForPath(filePath)
    const importsByLocal = new Map() // local -> { filePath, exportName }

    for (const stmt of sf.statements) {
        if (!ts.isImportDeclaration(stmt)) continue
        const spec = stmt.moduleSpecifier
        if (!ts.isStringLiteral(spec)) continue
        const resolvedFile = resolveImportTargetFile(filePath, spec.text)
        if (!resolvedFile) continue

        const clause = stmt.importClause
        if (!clause) continue
        if (clause.isTypeOnly) continue

        if (clause.name && ts.isIdentifier(clause.name)) {
            importsByLocal.set(clause.name.text, { filePath: resolvedFile, exportName: "default" })
        }

        const bindings = clause.namedBindings
        if (!bindings) continue

        if (ts.isNamedImports(bindings)) {
            for (const el of bindings.elements) {
                if (el.isTypeOnly) continue
                const exportName = el.propertyName ? el.propertyName.text : el.name.text
                const localName = el.name.text
                importsByLocal.set(localName, { filePath: resolvedFile, exportName })
            }
        } else if (ts.isNamespaceImport(bindings)) {
            importsByLocal.set(bindings.name.text, { filePath: resolvedFile, exportName: "*" })
        }
    }

    return importsByLocal
}

function collectCalledImportedRefs(body, importsByLocal) {
    if (!body) return []

    const refs = []
    const seen = new Set()

    const addRef = (filePath, exportName) => {
        const key = `${filePath}::${exportName}`
        if (seen.has(key)) return
        seen.add(key)
        refs.push({ filePath, exportName })
    }

    const visit = (node) => {
        if (ts.isCallExpression(node)) {
            const callee = node.expression
            if (ts.isIdentifier(callee)) {
                const hit = importsByLocal.get(callee.text)
                if (hit && hit.exportName !== "*") addRef(hit.filePath, hit.exportName)
            } else if (ts.isPropertyAccessExpression(callee) || ts.isPropertyAccessChain(callee)) {
                const expr = callee.expression
                if (ts.isIdentifier(expr)) {
                    const hit = importsByLocal.get(expr.text)
                    if (hit && hit.exportName === "*") addRef(hit.filePath, callee.name.text)
                }
            }
        }
        ts.forEachChild(node, visit)
    }

    visit(body)
    return refs
}

function findExportedFunctionBody(sf, exportName) {
    for (const stmt of sf.statements) {
        if (ts.isFunctionDeclaration(stmt)) {
            if (!stmt.name) continue
            if (stmt.name.text !== exportName) continue
            return stmt.body || null
        }

        if (ts.isVariableStatement(stmt)) {
            for (const decl of stmt.declarationList.declarations || []) {
                if (!ts.isIdentifier(decl.name)) continue
                if (decl.name.text !== exportName) continue
                const init = decl.initializer
                if (!init) continue
                if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
                    return init.body || null
                }
            }
        }

        if (ts.isExportDeclaration(stmt)) {
            if (!stmt.exportClause || !ts.isNamedExports(stmt.exportClause)) continue
            const spec = stmt.moduleSpecifier
            if (!spec || !ts.isStringLiteral(spec)) continue

            for (const el of stmt.exportClause.elements) {
                const exported = el.name.text
                if (exported !== exportName) continue
                const original = el.propertyName ? el.propertyName.text : el.name.text
                const fromFile = resolveImportTargetFile(sf.fileName, spec.text)
                if (!fromFile) return null
                const nextSf = getSourceFileForPath(fromFile)
                return findExportedFunctionBody(nextSf, original)
            }
        }
    }
    return null
}

function isExportRateLimited(filePath, exportName) {
    const cacheKey = `${filePath}::${exportName}`
    const cached = exportRateLimitCache.get(cacheKey)
    if (typeof cached === "boolean") return cached

    try {
        const sf = getSourceFileForPath(filePath)
        if (exportName === "default") {
            exportRateLimitCache.set(cacheKey, false)
            return false
        }

        const body = findExportedFunctionBody(sf, exportName)
        const ok = functionBodyContainsRateLimitCall(body)
        exportRateLimitCache.set(cacheKey, ok)
        return ok
    } catch {
        exportRateLimitCache.set(cacheKey, false)
        return false
    }
}

function main() {
    const exports = []

    walkDir(ACTIONS_DIR, (filePath) => {
        if (!filePath.endsWith(".ts")) return
        const rel = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, "/")
        const sf = getSourceFileForPath(filePath)
        const importsByLocal = collectImportMapForFile(filePath)

        for (const stmt of sf.statements) {
            if (ts.isFunctionDeclaration(stmt)) {
                if (!isExported(stmt) || !isAsync(stmt)) continue
                if (!stmt.name || !stmt.name.text) continue
                const rateLimitedDirect = functionBodyContainsRateLimitCall(stmt.body)
                const rateLimitedVia = rateLimitedDirect
                    ? []
                    : collectCalledImportedRefs(stmt.body, importsByLocal).filter((r) =>
                          isExportRateLimited(r.filePath, r.exportName)
                      )
                exports.push({
                    file: rel,
                    name: stmt.name.text,
                    kind: "function",
                    rateLimitedDirect,
                    rateLimitedVia,
                    rateLimited: rateLimitedDirect || rateLimitedVia.length > 0,
                })
                continue
            }

            if (ts.isVariableStatement(stmt)) {
                if (!isExported(stmt)) continue
                for (const decl of stmt.declarationList.declarations) {
                    if (!ts.isIdentifier(decl.name)) continue
                    const init = decl.initializer
                    if (!init) continue
                    if (!ts.isArrowFunction(init)) continue
                    if (!init.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) continue
                    const rateLimitedDirect = functionBodyContainsRateLimitCall(init.body)
                    const rateLimitedVia = rateLimitedDirect
                        ? []
                        : collectCalledImportedRefs(init.body, importsByLocal).filter((r) =>
                              isExportRateLimited(r.filePath, r.exportName)
                          )
                    exports.push({
                        file: rel,
                        name: decl.name.text,
                        kind: "arrow",
                        rateLimitedDirect,
                        rateLimitedVia,
                        rateLimited: rateLimitedDirect || rateLimitedVia.length > 0,
                    })
                }
            }
        }
    })

    exports.sort((a, b) => (a.file === b.file ? a.name.localeCompare(b.name) : a.file.localeCompare(b.file)))
    const offenders = exports.filter((e) => !e.rateLimited)
    const directLimited = exports.filter((e) => e.rateLimitedDirect).length
    const viaLimited = exports.filter((e) => !e.rateLimitedDirect && e.rateLimitedVia?.length).length

    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `action_rate_limit_coverage_audit_${date}.md`)

    const lines = []
    lines.push(`# Action Rate Limit Coverage Audit (${date})`)
    lines.push("")
    lines.push("> 目的：发现“导出的 Server Actions 缺少 Rate Limiting”的入口，避免在 30–300 人规模下出现滥用/高频请求导致的系统不稳定。")
    lines.push("> 方法：TypeScript AST 扫描 `src/actions/*.ts` 的导出 async 函数（function / async arrow），检查函数体内是否存在 `checkRateLimit(...)` / `enforceActionRateLimit(...)` / `enforceRateLimit(...)` 调用。")
    lines.push("> 补充：若 action 仅为薄 wrapper 且调用了 import 的 `*Impl`（或同类 server-only 函数），则进一步解析该被调用函数体内是否存在限流调用。")
    lines.push("")
    lines.push("## Summary")
    lines.push(`- action exports scanned: ${exports.length}`)
    lines.push(`- rate-limited (direct): ${directLimited}`)
    lines.push(`- rate-limited (via delegation): ${viaLimited}`)
    lines.push(`- rate-limited (total): ${exports.length - offenders.length}`)
    lines.push(`- missing rate limit: ${offenders.length}`)
    lines.push("")
    lines.push("## Missing Rate Limit")
    if (!offenders.length) {
        lines.push("")
        lines.push("- ✅ None")
    } else {
        lines.push("")
        for (const o of offenders) {
            lines.push(`- \`${o.file}\` \`${o.name}\``)
        }
    }
    lines.push("")

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[action-rate-limit] exports: ${exports.length}`)
    console.log(`[action-rate-limit] missing: ${offenders.length}`)
    console.log(`[action-rate-limit] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)

    if (offenders.length) process.exitCode = 1
}

main()
