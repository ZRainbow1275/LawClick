const fs = require("fs")
const path = require("path")

const PROJECT_ROOT = path.join(__dirname, "..")
const REPO_ROOT = path.join(PROJECT_ROOT, "..")
const SRC_DIR = path.join(PROJECT_ROOT, "src")
const API_DIR = path.join(SRC_DIR, "app", "api")
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

function main() {
    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `api_design_audit_${date}.md`)

    const routes = []
    walkDir(API_DIR, (filePath) => {
        if (!filePath.endsWith("route.ts")) return
        const rel = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, "/")
        const source = fs.readFileSync(filePath, "utf8")

        // NextAuth handler is implemented in src/auth.ts and already contains login rate limiting.
        // This file intentionally re-exports handlers, so we treat it as OK.
        if (rel === "src/app/api/auth/[...nextauth]/route.ts") {
            routes.push({ file: rel, candidates: [] })
            return
        }

        const hasRateLimit = /\bcheckRateLimit\b/.test(source)
        const hasAuth =
            /\bgetActiveTenantContext\b/.test(source) ||
            /\bgetActiveTenantContextOrThrow\b/.test(source) ||
            /\bgetActiveTenantContextWithPermissionOrThrow\b/.test(source) ||
            /\bhandlers\b/.test(source)
        const hasZod = /\bzod\b/.test(source) || /\bz\s*\./.test(source)
        const hasRuntimeNode = /\bruntime\s*=\s*["']nodejs["']/.test(source)

        const candidates = []
        if (!hasRateLimit) candidates.push("missing-rate-limit")
        if (!hasAuth) candidates.push("missing-auth-check")
        if (!hasZod) candidates.push("missing-zod-validation")
        if (!hasRuntimeNode && source.includes("ReadableStream")) candidates.push("missing-runtime-nodejs")

        routes.push({ file: rel, candidates })
    })

    routes.sort((a, b) => a.file.localeCompare(b.file))

    const offenders = routes.filter((r) => r.candidates.length)

    const lines = []
    lines.push(`# API Design Consistency Audit (${date})`)
    lines.push("")
    lines.push("> 目的：Route Handlers（`src/app/api/**/route.ts`）在鉴权/限流/输入校验/运行时配置上保持一致。")
    lines.push("> 说明：这是启发式静态审计，用于暴露“潜在不一致风险”，不替代人工安全审计。")
    lines.push("")
    lines.push("## Summary")
    lines.push(`- route files: ${routes.length}`)
    lines.push(`- offenders: ${offenders.length}`)
    lines.push("")
    lines.push("## Results")
    lines.push("")
    for (const r of routes) {
        if (!r.candidates.length) {
            lines.push(`- \`${r.file}:1\` ✅ OK`)
        } else {
            lines.push(`- \`${r.file}:1\` ❌ ${r.candidates.join(", ")}`)
        }
    }

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[api-design] route files: ${routes.length}`)
    console.log(`[api-design] offenders: ${offenders.length}`)
    console.log(`[api-design] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)
}

main()
