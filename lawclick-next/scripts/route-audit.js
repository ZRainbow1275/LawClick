const fs = require("fs")
const path = require("path")

const PROJECT_ROOT = path.join(__dirname, "..")
const APP_DIR = path.join(PROJECT_ROOT, "src", "app")
const SRC_DIR = path.join(PROJECT_ROOT, "src")

function isRouteGroupSegment(name) {
    return name.startsWith("(") && name.endsWith(")")
}

function isParallelRouteSegment(name) {
    return name.startsWith("@")
}

function normalizeRoutePath(value) {
    if (!value) return null
    let p = String(value).trim()
    if (!p.startsWith("/")) return null
    if (p.startsWith("//")) return null

    const hashIdx = p.indexOf("#")
    if (hashIdx !== -1) p = p.slice(0, hashIdx)
    const queryIdx = p.indexOf("?")
    if (queryIdx !== -1) p = p.slice(0, queryIdx)

    p = p.replace(/\$\{[^}]+\}/g, "[id]")
    p = p.replace(/:[^/]+/g, "[id]")

    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1)
    return p
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

function collectAppRoutes() {
    const routes = new Set()

    function walkApp(currentDir, segments) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true })
        for (const entry of entries) {
            const full = path.join(currentDir, entry.name)
            if (entry.isDirectory()) {
                if (isParallelRouteSegment(entry.name)) continue
                if (isRouteGroupSegment(entry.name)) {
                    walkApp(full, segments)
                } else {
                    walkApp(full, [...segments, entry.name])
                }
                continue
            }

            if (!entry.isFile()) continue
            if (entry.name !== "page.tsx" && entry.name !== "route.ts") continue

            const route = `/${segments.join("/")}`.replace(/\/+$/g, "") || "/"
            routes.add(route === "" ? "/" : route)
        }
    }

    walkApp(APP_DIR, [])
    return routes
}

function collectRouteReferences() {
    const references = []

    const PATTERNS = [
        { label: "router.push", re: /router\.push\(\s*(['"`])(\/[^'"`]*?)\1\s*\)/g },
        { label: "redirect", re: /redirect\(\s*(['"`])(\/[^'"`]*?)\1\s*\)/g },
        { label: "href:", re: /href:\s*(['"`])(\/[^'"`]*?)\1/g },
        { label: "href=", re: /href=\s*(['"`])(\/[^'"`]*?)\1/g },
        { label: "actionUrl:", re: /actionUrl:\s*(['"`])(\/[^'"`]*?)\1/g },
        { label: "url:", re: /url:\s*(['"`])(\/[^'"`]*?)\1/g },
        { label: "callbackUrl:", re: /callbackUrl:\s*(['"`])(\/[^'"`]*?)\1/g },
    ]

    walkDir(SRC_DIR, (filePath) => {
        if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) return
        const text = fs.readFileSync(filePath, "utf8")
        for (const { label, re } of PATTERNS) {
            re.lastIndex = 0
            let match
            while ((match = re.exec(text))) {
                const raw = match[2]
                const normalized = normalizeRoutePath(raw)
                if (!normalized) continue
                references.push({
                    file: path.relative(PROJECT_ROOT, filePath),
                    label,
                    raw,
                    normalized,
                })
            }
        }
    })

    return references
}

function main() {
    if (!fs.existsSync(APP_DIR)) {
        console.error(`未找到 app 目录：${APP_DIR}`)
        process.exit(2)
    }

    const appRoutes = collectAppRoutes()
    const refs = collectRouteReferences()

    const missing = []
    for (const ref of refs) {
        if (!appRoutes.has(ref.normalized)) {
            missing.push(ref)
        }
    }

    const uniqueRefs = new Map()
    for (const ref of refs) {
        uniqueRefs.set(`${ref.label}:${ref.normalized}`, ref)
    }

    console.log(`[route-audit] app routes: ${appRoutes.size}`)
    console.log(`[route-audit] route refs: ${refs.length} (unique: ${uniqueRefs.size})`)

    if (missing.length === 0) {
        console.log("[route-audit] OK: 未发现断链路由引用")
        return
    }

    console.log(`\n[route-audit] FAIL: 发现 ${missing.length} 条路由引用未找到对应 page/route`)
    for (const ref of missing) {
        console.log(`- ${ref.normalized}  (${ref.label})  <- ${ref.file}  raw=${JSON.stringify(ref.raw)}`)
    }
    process.exit(1)
}

main()
