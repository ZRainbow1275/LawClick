const fs = require("fs")
const path = require("path")
const ts = require("typescript")

const PROJECT_ROOT = path.join(__dirname, "..")
const REPO_ROOT = path.join(PROJECT_ROOT, "..")

const TS_PERMISSIONS_FILE = path.join(PROJECT_ROOT, "src", "lib", "permissions.ts")
const RUST_PERMISSIONS_FILE = path.join(REPO_ROOT, "src", "security", "permissions.rs")

function createSourceFile(filePath, sourceText) {
    return ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function visit(node, fn) {
    fn(node)
    node.forEachChild((child) => visit(child, fn))
}

function extractTsPermissions() {
    if (!fs.existsSync(TS_PERMISSIONS_FILE)) {
        throw new Error(`TS permissions file not found: ${TS_PERMISSIONS_FILE}`)
    }
    const sourceText = fs.readFileSync(TS_PERMISSIONS_FILE, "utf8")
    const sf = createSourceFile("permissions.ts", sourceText)

    let found = false
    const out = new Set()

    visit(sf, (node) => {
        if (!ts.isVariableDeclaration(node)) return
        if (!ts.isIdentifier(node.name)) return
        if (node.name.text !== "ALL_PERMISSIONS") return
        if (!node.initializer) return

        let init = node.initializer
        // Handle `as const` / `satisfies` wrappers
        // - `[...] as const`
        // - `([...]) satisfies ReadonlyArray<...>`
        // - `([...]) as const satisfies ...`
        while (true) {
            if (ts.isParenthesizedExpression(init)) {
                init = init.expression
                continue
            }
            if (ts.isAsExpression(init) || (ts.isTypeAssertionExpression && ts.isTypeAssertionExpression(init))) {
                init = init.expression
                continue
            }
            if (ts.isSatisfiesExpression && ts.isSatisfiesExpression(init)) {
                init = init.expression
                continue
            }
            break
        }

        if (!ts.isArrayLiteralExpression(init)) return
        found = true
        for (const el of init.elements) {
            if (!ts.isStringLiteral(el)) continue
            out.add(el.text)
        }
    })

    if (!found) {
        throw new Error(`ALL_PERMISSIONS not found in ${TS_PERMISSIONS_FILE}`)
    }
    return out
}

function extractRustPermissions() {
    if (!fs.existsSync(RUST_PERMISSIONS_FILE)) {
        throw new Error(`Rust permissions file not found: ${RUST_PERMISSIONS_FILE}`)
    }
    const sourceText = fs.readFileSync(RUST_PERMISSIONS_FILE, "utf8")
    const out = new Set()

    const re = /=>\s*"([^"]+)"/g
    for (const match of sourceText.matchAll(re)) {
        const value = match[1]
        if (!value) continue
        out.add(value)
    }

    return out
}

function main() {
    const tsPermissions = extractTsPermissions()
    const rustPermissions = extractRustPermissions()

    const missingInRust = [...tsPermissions].filter((p) => !rustPermissions.has(p)).sort()
    const extraInRust = [...rustPermissions].filter((p) => !tsPermissions.has(p)).sort()

    console.log(`[permissions-sync] ts permissions: ${tsPermissions.size}`)
    console.log(`[permissions-sync] rust permissions: ${rustPermissions.size}`)
    console.log(`[permissions-sync] missing in Rust: ${missingInRust.length}`)
    console.log(`[permissions-sync] extra in Rust: ${extraInRust.length}`)

    if (missingInRust.length) {
        console.log("")
        console.log("[permissions-sync] missing in Rust:")
        for (const p of missingInRust) console.log(`- ${p}`)
    }

    if (extraInRust.length) {
        console.log("")
        console.log("[permissions-sync] extra in Rust:")
        for (const p of extraInRust) console.log(`- ${p}`)
    }

    if (missingInRust.length || extraInRust.length) {
        process.exitCode = 1
    }
}

main()
