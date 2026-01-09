const fs = require("fs")
const path = require("path")

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
        if (entry.isDirectory() && entry.name === "generated") continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            walkDir(full, onFile)
            continue
        }
        if (entry.isFile()) onFile(full)
    }
}

function getLineNumber(source, index) {
    return source.slice(0, index).split("\n").length
}

function truncate(s, max = 180) {
    const text = String(s || "").replace(/\s+/g, " ").trim()
    if (text.length <= max) return text
    return text.slice(0, Math.max(0, max - 3)) + "..."
}

function isClientFile(sourceText) {
    const trimmed = sourceText.trimStart()
    return trimmed.startsWith('"use client"') || trimmed.startsWith("'use client'")
}

function parseArgs(argv) {
    const out = { report: false, help: false }
    for (const token of argv) {
        if (!token) continue
        if (token === "--report") out.report = true
        if (token === "--help" || token === "-h") out.help = true
    }
    return out
}

function printUsage() {
    console.log(`[security-audit] Usage:

  pnpm -C lawclick-next audit:security
  pnpm -C lawclick-next audit:security -- --report

Flags:
  --report   Write markdown report to docs/_artifacts/ (optional)
  -h,--help  Show help
`)
}

function main() {
    const args = parseArgs(process.argv.slice(2))
    if (args.help) {
        printUsage()
        return
    }

    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `security_audit_${date}.md`)        

    const findings = []
    const blocking = []
    let scanned = 0

    const patterns = [
        { kind: "dangerouslySetInnerHTML", re: /dangerouslySetInnerHTML/g },
        { kind: "eval", re: /\beval\s*\(/g },
        { kind: "new-Function", re: /new\s+Function\s*\(/g },
    ]

    walkDir(SRC_DIR, (filePath) => {
        if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) return
        const rel = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, "/")
        const source = fs.readFileSync(filePath, "utf8")
        scanned += 1

        for (const p of patterns) {
            p.re.lastIndex = 0
            for (const match of source.matchAll(p.re)) {
                const idx = match.index ?? 0
                const line = getLineNumber(source, idx)
                const sample = truncate((source.split(/\r?\n/)[line - 1] || "").trim())
                findings.push({ file: rel, line, kind: p.kind, sample })
            }
        }

        if (isClientFile(source) && /\bprocess\.env\./.test(source)) {
            const matches = Array.from(source.matchAll(/\bprocess\.env\.([A-Z0-9_]+)/g))
            for (const m of matches) {
                const key = m[1] || ""
                if (!key) continue
                if (key.startsWith("NEXT_PUBLIC_")) continue
                const idx = m.index ?? source.indexOf(m[0])
                const line = getLineNumber(source, idx >= 0 ? idx : 0)
                const sample = truncate((source.split(/\r?\n/)[line - 1] || "").trim())
                findings.push({ file: rel, line, kind: "client-env-leak", sample })
            }
        }
    })

    // ----------------------------------------------------------------------
    // Critical assertions (must not regress)
    // ----------------------------------------------------------------------
    const jobHandlersRel = "src/lib/job-handlers.ts"
    const jobHandlersPath = path.join(SRC_DIR, "lib", "job-handlers.ts")
    if (!fs.existsSync(jobHandlersPath)) {
        blocking.push({
            file: jobHandlersRel,
            line: 1,
            kind: "webhook-handler-missing",
            sample: "Expected src/lib/job-handlers.ts to exist",
        })
    } else {
        const text = fs.readFileSync(jobHandlersPath, "utf8")
        const manualRedirectRe =
            /fetch\(\s*safe\.url\.toString\(\)\s*,\s*\{[\s\S]{0,800}?redirect\s*:\s*['\"]manual['\"]/m
        if (!manualRedirectRe.test(text)) {
            blocking.push({
                file: jobHandlersRel,
                line: 1,
                kind: "webhook-redirect-manual-missing",
                sample: "fetch(safe.url.toString(), { ... redirect: \"manual\" ... })",
            })
        }

        const followRedirectRe = /redirect\s*:\s*['\"]follow['\"]/m
        if (followRedirectRe.test(text)) {
            const idx = text.search(followRedirectRe)
            const line = idx >= 0 ? getLineNumber(text, idx) : 1
            const sample = truncate((text.split(/\r?\n/)[line - 1] || "").trim())
            blocking.push({
                file: jobHandlersRel,
                line,
                kind: "webhook-redirect-follow-forbidden",
                sample,
            })
        }
    }

    const prismaRel = "src/lib/prisma.ts"
    const prismaPath = path.join(SRC_DIR, "lib", "prisma.ts")
    if (!fs.existsSync(prismaPath)) {
        blocking.push({
            file: prismaRel,
            line: 1,
            kind: "tenant-scope-prisma-missing",
            sample: "Expected src/lib/prisma.ts to exist",
        })
    } else {
        const text = fs.readFileSync(prismaPath, "utf8")
        const hasEnvKey = /\bLAWCLICK_ALLOW_UNSCOPED_TENANT_QUERIES\b/.test(text)
        const hasProdGate = /\bNODE_ENV\s*===\s*['"]production['"]/.test(text)
        const hasThrow = /\bthrow\s+new\s+Error\s*\(/.test(text)
        if (!hasEnvKey || !hasProdGate || !hasThrow) {
            blocking.push({
                file: prismaRel,
                line: 1,
                kind: "tenant-scope-unscoped-prod-guard-missing",
                sample: "Expected a production guard that forbids LAWCLICK_ALLOW_UNSCOPED_TENANT_QUERIES",
            })
        }
    }

    findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)))

    const byKind = new Map()
    for (const f of findings) byKind.set(f.kind, (byKind.get(f.kind) || 0) + 1)

    const lines = []
    lines.push(`# Security Audit (${date})`)
    lines.push("")
    lines.push("> 目的：发现明显的高危模式（XSS/动态执行/客户端泄露 env）。")
    lines.push("> 说明：这是静态审计（启发式），不能替代专业渗透测试/运行态策略（CSP/WAF/审计日志）。")
    lines.push("")
    lines.push("## Summary")
    lines.push(`- scanned files: ${scanned}`)
    lines.push(`- findings: ${findings.length}`)
    lines.push(`- blocking: ${blocking.length}`)
    lines.push("")

    lines.push("## Blocking Assertions")
    if (!blocking.length) {
        lines.push("")
        lines.push("- ✅ None")
    } else {
        lines.push("")
        for (const f of blocking) {
            lines.push(`- \`${f.file}:${f.line}\` [${f.kind}] ${f.sample}`)
        }
    }

    lines.push("## Findings By Kind")
    if (!findings.length) {
        lines.push("")
        lines.push("- ✅ None")
    } else {
        lines.push("")
        for (const [kind, count] of Array.from(byKind.entries()).sort((a, b) => b[1] - a[1])) {
            lines.push(`- ${kind}: ${count}`)
        }

        lines.push("")
        lines.push("## Findings")
        lines.push("")
        for (const f of findings) {
            lines.push(`- \`${f.file}:${f.line}\` [${f.kind}] ${f.sample}`)
        }
    }

    console.log(`[security] scanned files: ${scanned}`)
    console.log(`[security] findings: ${findings.length}`)
    console.log(`[security] blocking: ${blocking.length}`)

    if (args.report) {
        fs.mkdirSync(OUT_DIR, { recursive: true })
        fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")
        console.log(`[security] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)
    }

    if (blocking.length) {
        process.exitCode = 1
    }
}

main()
