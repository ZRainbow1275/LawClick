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
    path.join(SRC_DIR, "lib"),
]

function formatDate(d) {
    const pad = (n) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function walkDir(dir, onFile) {
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

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function getLineNumber(source, index) {
    return source.slice(0, index).split("\n").length
}

function collectActionExports() {
    const exports = []

    const patterns = [
        { re: /\bexport\s+async\s+function\s+([A-Za-z0-9_]+)\s*\(/g, kind: "export async function" },
        { re: /\bexport\s+function\s+([A-Za-z0-9_]+)\s*\(/g, kind: "export function" },
        { re: /\bexport\s+const\s+([A-Za-z0-9_]+)\s*=\s*async\s*\(/g, kind: "export const = async" },
    ]

    walkDir(ACTIONS_DIR, (filePath) => {
        if (!filePath.endsWith(".ts")) return
        const rel = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, "/")
        const source = fs.readFileSync(filePath, "utf8")
        for (const { re, kind } of patterns) {
            re.lastIndex = 0
            for (const match of source.matchAll(re)) {
                const name = match[1]
                if (!name) continue
                const idx = match.index ?? 0
                exports.push({ name, file: rel, line: getLineNumber(source, idx), kind })
            }
        }
    })

    // Dedup by name+file+line (rare but safe)
    const seen = new Set()
    const dedup = []
    for (const e of exports) {
        const key = `${e.file}:${e.line}:${e.name}`
        if (seen.has(key)) continue
        seen.add(key)
        dedup.push(e)
    }

    return dedup
}

function collectTextReferences(actionNames, roots, opts) {
    const refCounts = new Map(actionNames.map((n) => [n, 0]))
    const refFiles = new Map(actionNames.map((n) => [n, new Set()]))

    if (!actionNames.length) return { refCounts, refFiles, scannedFiles: 0 }

    const combined = new RegExp(`\\b(?:${actionNames.map(escapeRegExp).join("|")})\\b`, "g")

    let scannedFiles = 0
    for (const root of roots) {
        if (!fs.existsSync(root)) continue
        walkDir(root, (filePath) => {
            const normalized = filePath.replace(/\\/g, "/")
            if (opts?.exclude && opts.exclude.some((segment) => normalized.includes(segment))) {
                return
            }
            if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) return
            scannedFiles += 1
            const rel = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, "/")
            const source = fs.readFileSync(filePath, "utf8")
            combined.lastIndex = 0
            for (const match of source.matchAll(combined)) {
                const name = match[0]
                if (!refCounts.has(name)) continue
                refCounts.set(name, (refCounts.get(name) || 0) + 1)
                refFiles.get(name)?.add(rel)
            }
        })
    }

    return { refCounts, refFiles, scannedFiles }
}

function isProbablyActionsModule(spec) {
    const s = String(spec || "")
    if (!s) return false
    if (s.startsWith("@/actions/")) return true
    if (s === "@/actions") return true
    if (s.includes("/actions/")) return true
    return false
}

function resolveActionsImportPath(fromFilePath, moduleSpecifier) {
    const spec = String(moduleSpecifier || "")
    if (!spec) return null

    if (spec.startsWith("@/")) {
        const resolved = path.join(SRC_DIR, spec.slice(2))
        return resolved.replace(/\\/g, "/")
    }

    if (spec.startsWith(".")) {
        const resolved = path.resolve(path.dirname(fromFilePath), spec)
        return resolved.replace(/\\/g, "/")
    }

    return null
}

function isActionsImport(fromFilePath, moduleSpecifier) {
    if (!isProbablyActionsModule(moduleSpecifier)) return false

    const resolved = resolveActionsImportPath(fromFilePath, moduleSpecifier)
    if (!resolved) return false
    const normalizedActionsDir = ACTIONS_DIR.replace(/\\/g, "/")
    return resolved.startsWith(normalizedActionsDir)
}

function createSourceFile(filePath, sourceText) {
    const kind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    return ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, kind)
}

function collectUiActionReferences(actionNames) {
    const refCounts = new Map(actionNames.map((n) => [n, 0]))
    const refFiles = new Map(actionNames.map((n) => [n, new Set()]))

    if (!actionNames.length) return { refCounts, refFiles, scannedFiles: 0 }

    let scannedFiles = 0

    const markRef = (name, filePath) => {
        if (!refCounts.has(name)) return
        refCounts.set(name, (refCounts.get(name) || 0) + 1)
        refFiles.get(name)?.add(filePath)
    }

    const isInTypePosition = (node) => {
        let current = node
        while (current) {
            if (ts.isTypeNode(current)) return true
            if (ts.isSourceFile(current)) return false
            current = current.parent
        }
        return false
    }

    const visit = (node, onVisit) => {
        if (onVisit(node) === false) return
        node.forEachChild((child) => visit(child, onVisit))
    }

    for (const rootDir of UI_ROOT_DIRS) {
        if (!fs.existsSync(rootDir)) continue
        walkDir(rootDir, (filePath) => {
            if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) return

            const rel = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, "/")
            const sourceText = fs.readFileSync(filePath, "utf8")

            const isLibFile = filePath.replace(/\\/g, "/").includes("/src/lib/")
            const isClientLib = isLibFile
                ? sourceText.trimStart().startsWith('"use client"') ||
                  sourceText.trimStart().startsWith("'use client'")
                : true
            if (isLibFile && !isClientLib) {
                return
            }

            scannedFiles += 1
            const sf = createSourceFile(rel, sourceText)

            const namedImportsByLocal = new Map()
            const namespaceAliases = new Set()

            for (const stmt of sf.statements) {
                if (ts.isImportDeclaration(stmt)) {
                    const spec = stmt.moduleSpecifier
                    if (!ts.isStringLiteral(spec)) continue
                    const moduleText = spec.text
                    if (!isActionsImport(filePath, moduleText)) continue

                    const importClause = stmt.importClause
                    if (!importClause) continue
                    if (importClause.isTypeOnly) continue

                    const namedBindings = importClause.namedBindings
                    if (!namedBindings) continue

                    if (ts.isNamedImports(namedBindings)) {
                        for (const el of namedBindings.elements) {
                            if (el.isTypeOnly) continue
                            const original = el.propertyName ? el.propertyName.text : el.name.text
                            const local = el.name.text
                            namedImportsByLocal.set(local, original)
                        }
                    } else if (ts.isNamespaceImport(namedBindings)) {
                        namespaceAliases.add(namedBindings.name.text)
                    }
                }
            }

            visit(sf, (node) => {
                if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return false

                if (ts.isIdentifier(node)) {
                    if (isInTypePosition(node)) return
                    const original = namedImportsByLocal.get(node.text)
                    if (original) markRef(original, rel)
                    return
                }

                if (namespaceAliases.size === 0) return
                if (!ts.isPropertyAccessExpression(node) && !ts.isPropertyAccessChain(node)) return
                if (isInTypePosition(node)) return

                const expr = node.expression
                if (!ts.isIdentifier(expr)) return
                if (!namespaceAliases.has(expr.text)) return
                markRef(node.name.text, rel)
            })
        })
    }

    return { refCounts, refFiles, scannedFiles }
}

function writeReportMarkdown(input) {
    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `actions_ui_coverage_audit_${date}.md`)

    const lines = []
    lines.push(`# Actions ↔ UI 覆盖审计（${date}）`)
    lines.push("")
    lines.push(
        "> 说明：本报告统计的是 **UI 代码对 actions 的 import/引用覆盖**（AST 解析 + 文本引用补充）。这不等价于“功能一定可达/一定有入口”，但能防止最常见的‘写了 actions 却完全没有前端接入’问题。"
    )
    lines.push("")
    lines.push("## 摘要")
    lines.push(`- actions exports: ${input.exports.length}`)
    lines.push(`- unique action names: ${input.uniqueNames.length}`)
    lines.push(`- scanned UI files: ${input.uiScannedFiles}`)
    lines.push(`- scanned src files (excluding src/actions): ${input.textScannedFiles}`)
    lines.push(`- unreferenced exports (UI imports): ${input.unreferencedUi.length}`)
    lines.push(
        `- unreferenced exports (outside actions): ${input.unreferencedOutsideActions.length}`
    )
    lines.push(`- referenced outside UI only: ${input.referencedOutsideUiOnly.length}`)

    lines.push("")
    lines.push("## 按 actions 文件分组（每个导出的 UI 引用数）")

    const byFile = new Map()
    for (const e of input.exports) {
        const list = byFile.get(e.file) || []
        list.push(e)
        byFile.set(e.file, list)
    }

    const files = Array.from(byFile.keys()).sort()
    for (const file of files) {
        const list = byFile.get(file) || []
        lines.push("")
        lines.push(`### \`${file}\``)
        for (const e of list.sort((a, b) => a.name.localeCompare(b.name))) {
            const uiFiles = Array.from(input.uiRefFiles.get(e.name) || []).sort()
            const refs = uiFiles.length
            const sample = uiFiles.slice(0, 3).map((f) => `\`${f}\``).join(", ")
            const more = uiFiles.length > 3 ? ` +${uiFiles.length - 3}` : ""
            lines.push(
                `- \`${e.name}\`（UI: ${refs}${sample ? `，例：${sample}${more}` : ""}）`
            )
        }
    }

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")
    return outPath
}

function main() {
    const exports = collectActionExports()
    const names = Array.from(new Set(exports.map((e) => e.name))).sort()

    const args = process.argv.slice(2)
    const shouldWriteReport = args.includes("--report")

    const {
        refCounts: uiRefCounts,
        refFiles: uiRefFiles,
        scannedFiles: uiScannedFiles,
    } = collectUiActionReferences(names)
    const {
        refCounts: textRefCounts,
        refFiles: textRefFiles,
        scannedFiles: textScannedFiles,
    } = collectTextReferences(
        names,
        [SRC_DIR],
        { exclude: ["/src/actions/"] }
    )

    const unreferencedUi = exports
        .filter((e) => (uiRefCounts.get(e.name) || 0) === 0)
        .sort((a, b) => (a.file === b.file ? a.name.localeCompare(b.name) : a.file.localeCompare(b.file)))

    const unreferencedOutsideActions = exports
        .filter((e) => (textRefCounts.get(e.name) || 0) === 0)
        .sort((a, b) => (a.file === b.file ? a.name.localeCompare(b.name) : a.file.localeCompare(b.file)))

    const referencedOutsideUiOnly = exports
        .filter((e) => (uiRefCounts.get(e.name) || 0) === 0 && (textRefCounts.get(e.name) || 0) > 0)
        .sort((a, b) => (a.file === b.file ? a.name.localeCompare(b.name) : a.file.localeCompare(b.file)))

    console.log(`[actions-ui-audit] actions exports: ${exports.length}`)
    console.log(`[actions-ui-audit] unique action names: ${names.length}`)
    console.log(
        `[actions-ui-audit] scanned UI files (src/app|components|hooks|store|lib(use client)): ${uiScannedFiles}`
    )
    console.log(`[actions-ui-audit] scanned src files (excluding src/actions): ${textScannedFiles}`)
    console.log(`[actions-ui-audit] unreferenced exports (UI imports): ${unreferencedUi.length}`)
    console.log(`[actions-ui-audit] unreferenced exports (outside actions): ${unreferencedOutsideActions.length}`)
    console.log(`[actions-ui-audit] referenced outside UI only: ${referencedOutsideUiOnly.length}`)

    if (unreferencedUi.length) {
        console.log("")
        console.log("[actions-ui-audit] unreferenced list (UI imports/usage based):")
        for (const e of unreferencedUi) {
            console.log(`- ${e.file}:${e.line} ${e.name}`)
        }
    }

    if (unreferencedOutsideActions.length) {
        console.log("")
        console.log("[actions-ui-audit] dead exports (not referenced outside src/actions):")
        for (const e of unreferencedOutsideActions) {
            console.log(`- ${e.file}:${e.line} ${e.name}`)
        }
    }

    if (referencedOutsideUiOnly.length) {
        console.log("")
        console.log("[actions-ui-audit] referenced outside UI only (potential missing UI entry points):")
        for (const e of referencedOutsideUiOnly) {
            console.log(`- ${e.file}:${e.line} ${e.name}`)
        }
    }

    if (shouldWriteReport) {
        const outPath = writeReportMarkdown({
            exports,
            uniqueNames: names,
            uiScannedFiles,
            textScannedFiles,
            uiRefFiles,
            textRefFiles,
            unreferencedUi,
            unreferencedOutsideActions,
            referencedOutsideUiOnly,
        })
        console.log("")
        console.log(
            `[actions-ui-audit] wrote report: ${path
                .relative(REPO_ROOT, outPath)
                .replace(/\\\\/g, "/")}`
        )
    }

    if (unreferencedUi.length || unreferencedOutsideActions.length) {
        process.exitCode = 1
    }
}

main()
