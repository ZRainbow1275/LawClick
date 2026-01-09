const fs = require("fs")
const path = require("path")
const ts = require("typescript")

const PROJECT_ROOT = path.join(__dirname, "..")
const REPO_ROOT = path.join(PROJECT_ROOT, "..")
const OUT_DIR = path.join(REPO_ROOT, "docs", "_artifacts")
const TS_CONFIG_PATH = path.join(PROJECT_ROOT, "tsconfig.json")
const ACTIONS_DIR = path.join(PROJECT_ROOT, "src", "actions")

function formatDate(d) {
    const pad = (n) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function loadTsConfig() {
    if (!fs.existsSync(TS_CONFIG_PATH)) {
        throw new Error(`未找到 tsconfig.json：${path.relative(PROJECT_ROOT, TS_CONFIG_PATH)}`)
    }

    const configFile = ts.readConfigFile(TS_CONFIG_PATH, ts.sys.readFile)
    if (configFile.error) {
        throw new Error(`读取 tsconfig.json 失败：${configFile.error.messageText}`)
    }

    const parsed = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        PROJECT_ROOT,
        undefined,
        TS_CONFIG_PATH
    )

    if (parsed.errors?.length) {
        const first = parsed.errors[0]
        throw new Error(`解析 tsconfig.json 失败：${first.messageText}`)
    }

    return parsed
}

function isUnderActions(filePath) {
    const normalized = filePath.replace(/\\/g, "/")
    const normalizedActions = ACTIONS_DIR.replace(/\\/g, "/")
    return normalized.startsWith(normalizedActions + "/")
}

function getLineCol(sf, node) {
    const pos = node.getStart(sf, false)
    const { line, character } = sf.getLineAndCharacterOfPosition(pos)
    return { line: line + 1, column: character + 1 }
}

function unwrapPromiseLike(checker, type) {
    const promised = checker.getPromisedTypeOfPromise(type)
    return promised || type
}

function analyzeSuccessDiscriminant(checker, awaitedType) {
    const successType = checker.getTypeOfPropertyOfType(awaitedType, "success")
    if (!successType) return { kind: "no-success" }

    if (!awaitedType.isUnion()) {
        const s = checker.typeToString(successType)
        if (s === "boolean") return { kind: "collapsed", detail: "success 类型为 boolean（需要显式联合返回类型或 as const）" }
        return { kind: "ok" }
    }

    let hasTrue = false
    let hasFalse = false
    let hasBoolean = false
    let missing = 0

    for (const member of awaitedType.types) {
        const st = checker.getTypeOfPropertyOfType(member, "success")
        if (!st) {
            missing += 1
            continue
        }
        const s = checker.typeToString(st)
        if (s === "true") hasTrue = true
        else if (s === "false") hasFalse = true
        else if (s === "boolean") hasBoolean = true
    }

    if (missing > 0) {
        return { kind: "nonstandard", detail: `返回联合中有 ${missing} 个分支缺少 success 字段` }
    }
    if (hasBoolean) {
        return { kind: "nonstandard", detail: "返回联合中存在 success: boolean 的分支（无法作为判别联合）" }
    }
    if (!hasTrue && !hasFalse) {
        return { kind: "nonstandard", detail: "返回类型包含 success 字段，但无法识别 true/false 判别值" }
    }
    return { kind: "ok" }
}

function isExportedValueSymbol(symbol) {
    return Boolean(symbol && (symbol.flags & ts.SymbolFlags.Value))
}

function findExportedActionFunctions(program) {
    const checker = program.getTypeChecker()
    const results = []

    for (const sf of program.getSourceFiles()) {
        if (!sf.fileName) continue
        if (!isUnderActions(sf.fileName)) continue
        if (sf.isDeclarationFile) continue

        const moduleSymbol = checker.getSymbolAtLocation(sf)
        if (!moduleSymbol) continue

        const exports = checker.getExportsOfModule(moduleSymbol)
        for (const sym of exports) {
            if (!isExportedValueSymbol(sym)) continue

            const decl = sym.valueDeclaration || sym.declarations?.find((d) => ts.isFunctionDeclaration(d) || ts.isVariableDeclaration(d))
            if (!decl) continue

            const type = checker.getTypeOfSymbolAtLocation(sym, decl)
            const sig = type.getCallSignatures()[0]
            if (!sig) continue

            const returnType = sig.getReturnType()
            const awaited = unwrapPromiseLike(checker, returnType)

            const analysis = analyzeSuccessDiscriminant(checker, awaited)
            if (analysis.kind === "ok" || analysis.kind === "no-success") continue

            const loc = getLineCol(sf, decl)
            results.push({
                file: path.relative(PROJECT_ROOT, sf.fileName).replace(/\\/g, "/"),
                name: sym.getName(),
                line: loc.line,
                column: loc.column,
                issue: analysis.detail || "未知问题",
                returnType: checker.typeToString(awaited),
            })
        }
    }

    results.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)))
    return results
}

function main() {
    const parsed = loadTsConfig()
    const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options })

    const offenders = findExportedActionFunctions(program)

    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `action_result_shape_audit_${date}.md`)

    const lines = []
    lines.push(`# Action Result Shape Audit (${date})`)
    lines.push("")
    lines.push(
        "> 目的：发现 Server Actions 返回类型中 `success` 被推断/声明为 `boolean` 的情况（会导致判别联合失效，进而出现 UI 侧 Extract/类型收窄为 never 的隐患）。"
    )
    lines.push("> 方法：基于 TypeScript Program/TypeChecker 分析 `src/actions/*` 模块导出的 value symbols。")
    lines.push("")
    lines.push("## Summary")
    lines.push(`- offenders: ${offenders.length}`)
    lines.push("")
    lines.push("## Offenders")
    if (offenders.length === 0) {
        lines.push("")
        lines.push("- ✅ None")
    } else {
        lines.push("")
        for (const o of offenders) {
            lines.push(
                `- \`${o.file}:${o.line}:${o.column}\` \`${o.name}\` ${o.issue} | return: \`${o.returnType}\``
            )
        }
    }

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[action-result-shape] offenders: ${offenders.length}`)
    console.log(`[action-result-shape] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)

    if (offenders.length > 0) process.exit(1)
}

main()
