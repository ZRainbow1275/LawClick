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

function truncate(s, max = 160) {
    const text = String(s || "").replace(/\s+/g, " ").trim()
    if (text.length <= max) return text
    return text.slice(0, Math.max(0, max - 3)) + "..."
}

function main() {
    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `maintainability_audit_${date}.md`)

    const patterns = [
        { kind: "eslint-disable", re: /eslint-disable\b/g },
        { kind: "ts-ignore", re: /@ts-ignore\b/g },
        { kind: "ts-expect-error", re: /@ts-expect-error\b/g },
        { kind: "todo-comment", re: /\/\/\s*TODO\b/g },
        { kind: "fixme-comment", re: /\/\/\s*FIXME\b/g },
        { kind: "hack-comment", re: /\/\/\s*HACK\b/g },
    ]

    const findings = []
    let scanned = 0

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
    })

    findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)))

    const byKind = new Map()
    for (const f of findings) byKind.set(f.kind, (byKind.get(f.kind) || 0) + 1)

    const lines = []
    lines.push(`# Maintainability Audit (${date})`)
    lines.push("")
    lines.push("> 目的：统一代码卫生：避免长期 eslint-disable / ts-ignore；清理 TODO/FIXME/HACK 残留。")
    lines.push("")
    lines.push("## Summary")
    lines.push(`- scanned files: ${scanned}`)
    lines.push(`- findings: ${findings.length}`)
    lines.push("")
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

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[maintainability] scanned files: ${scanned}`)
    console.log(`[maintainability] findings: ${findings.length}`)
    console.log(`[maintainability] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)
}

main()
