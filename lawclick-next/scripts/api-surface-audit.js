const fs = require("fs")
const path = require("path")

const PROJECT_ROOT = path.join(__dirname, "..")
const REPO_ROOT = path.join(PROJECT_ROOT, "..")

const NEXT_API_DIR = path.join(PROJECT_ROOT, "src", "app", "api")
const RUST_ROUTES_DIR = path.join(REPO_ROOT, "src", "routes")
const OUT_DIR = path.join(REPO_ROOT, "docs", "_artifacts")

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

function normalizeNextSegment(seg) {
    const s = String(seg || "").trim()
    if (!s) return s
    if (s.startsWith("[...") && s.endsWith("]")) return "*"
    if (s.startsWith("[") && s.endsWith("]")) return `:${s.slice(1, -1)}`
    return s
}

function collectNextApiRoutes() {
    const routes = []
    walkDir(NEXT_API_DIR, (filePath) => {
        if (!filePath.endsWith(`${path.sep}route.ts`)) return
        const rel = path.relative(NEXT_API_DIR, path.dirname(filePath))
        const segments = rel.split(path.sep).filter(Boolean).map(normalizeNextSegment)
        routes.push(`/api/${segments.join("/")}`.replace(/\/$/, ""))
    })
    routes.sort()
    return routes
}

function collectRustApiDocs() {
    const endpoints = []
    if (!fs.existsSync(RUST_ROUTES_DIR)) return endpoints

    const re = /^\/\/\/\s*(GET|POST|PUT|PATCH|DELETE)\s+(\/api\/v1[^\s]*)/gm
    walkDir(RUST_ROUTES_DIR, (filePath) => {
        if (!filePath.endsWith(".rs")) return
        const source = fs.readFileSync(filePath, "utf8")
        for (const m of source.matchAll(re)) {
            const method = m[1]
            const route = m[2]
            if (!method || !route) continue
            endpoints.push({ method, route })
        }
    })

    endpoints.sort((a, b) => (a.route === b.route ? a.method.localeCompare(b.method) : a.route.localeCompare(b.route)))
    return endpoints
}

function formatDate(d) {
    const pad = (n) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function main() {
    const nextRoutes = collectNextApiRoutes()
    const rustEndpoints = collectRustApiDocs()

    const nextApiV1 = nextRoutes.filter((r) => r.startsWith("/api/v1"))
    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `api_surface_audit_${date}.md`)

    const lines = []
    lines.push(`# API Surface Audit (${date})`)
    lines.push("")
    lines.push("## Next.js API Routes (`lawclick-next/src/app/api`)") 
    lines.push(`- Count: ${nextRoutes.length}`)
    if (nextRoutes.length) {
        lines.push("")
        for (const r of nextRoutes) lines.push(`- \`${r}\``)
    }
    lines.push("")
    lines.push("## Rust Prototype API Endpoints (`src/routes`)") 
    lines.push(`- Count: ${rustEndpoints.length}`)
    if (rustEndpoints.length) {
        lines.push("")
        for (const e of rustEndpoints) lines.push(`- \`${e.method} ${e.route}\``)
    }
    lines.push("")
    lines.push("## Overlap Check")
    lines.push(`- Next routes under \`/api/v1\`: ${nextApiV1.length}`)
    if (nextApiV1.length) {
        lines.push("")
        lines.push("### Conflicting Next.js routes (should be empty)")
        for (const r of nextApiV1) lines.push(`- \`${r}\``)
    }
    lines.push("")
    lines.push("> Note: Rust prototype uses `/api/v1/*` while Next.js uses `/api/*`. Production deployment should choose a single backend surface to avoid operational confusion.")

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[api-surface] next api routes: ${nextRoutes.length}`)
    console.log(`[api-surface] rust endpoints: ${rustEndpoints.length}`)
    console.log(`[api-surface] next /api/v1 conflicts: ${nextApiV1.length}`)
    console.log(`[api-surface] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)

    if (nextApiV1.length) process.exitCode = 1
}

main()

