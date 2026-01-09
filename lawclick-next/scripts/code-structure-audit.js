const fs = require("fs")
const path = require("path")

const PROJECT_ROOT = path.join(__dirname, "..")
const REPO_ROOT = path.join(PROJECT_ROOT, "..")
const SRC_DIR = path.join(PROJECT_ROOT, "src")
const ACTIONS_DIR = path.join(SRC_DIR, "actions")
const COMPONENTS_DIR = path.join(SRC_DIR, "components")
const APP_DIR = path.join(SRC_DIR, "app")
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

function countLines(filePath) {
    try {
        const text = fs.readFileSync(filePath, "utf8")
        return text.split(/\r?\n/).length
    } catch {
        return 0
    }
}

function isKebabFileName(name) {
    return /^[a-z0-9-]+\.ts$/.test(name)
}

function isPascalComponentFileName(name) {
    if (!name.endsWith(".tsx")) return false
    if (name === "page.tsx" || name === "layout.tsx" || name === "loading.tsx") return true
    if (name === "error.tsx" || name === "not-found.tsx") return true
    return /^[A-Z][A-Za-z0-9]*\.tsx$/.test(name)
}

function main() {
    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `code_structure_audit_${date}.md`)

    const sourceFiles = []
    walkDir(SRC_DIR, (filePath) => {
        if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) return
        const rel = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, "/")
        sourceFiles.push({ filePath, rel, lines: countLines(filePath) })
    })

    const largeFiles = sourceFiles
        .filter((f) => f.lines >= 900)
        .sort((a, b) => b.lines - a.lines)
        .slice(0, 30)

    const nonKebabActions = []
    walkDir(ACTIONS_DIR, (filePath) => {
        if (!filePath.endsWith(".ts")) return
        const base = path.basename(filePath)
        if (!isKebabFileName(base)) {
            nonKebabActions.push(path.relative(PROJECT_ROOT, filePath).replace(/\\/g, "/"))
        }
    })

    const nonPascalComponents = []
    walkDir(COMPONENTS_DIR, (filePath) => {
        if (!filePath.endsWith(".tsx")) return
        const base = path.basename(filePath)
        if (!isPascalComponentFileName(base)) {
            nonPascalComponents.push(path.relative(PROJECT_ROOT, filePath).replace(/\\/g, "/"))
        }
    })

    const appSpecialFiles = []
    walkDir(APP_DIR, (filePath) => {
        if (!filePath.endsWith(".tsx")) return
        const base = path.basename(filePath)
        if (!isPascalComponentFileName(base)) {
            const rel = path.relative(PROJECT_ROOT, filePath).replace(/\\/g, "/")
            appSpecialFiles.push(rel)
        }
    })

    const lines = []
    lines.push(`# Code Structure Audit (${date})`)
    lines.push("")
    lines.push("> 目的：以“可维护性/一致性/规模化(30–300人)”为目标，对代码结构做轻量静态审计。")
    lines.push("> 说明：这是结构审计（非功能门禁）。发现项用于指导重构与治理优先级。")
    lines.push("")
    lines.push("## Summary")
    lines.push(`- scanned source files: ${sourceFiles.length}`)
    lines.push(`- large files (>=900 lines): ${largeFiles.length}`)
    lines.push(`- non-kebab action files: ${nonKebabActions.length}`)
    lines.push(`- non-pascal component files: ${nonPascalComponents.length}`)
    lines.push(`- non-pascal app special files: ${appSpecialFiles.length}`)
    lines.push("")

    lines.push("## Large Files (>=900 lines)")
    if (!largeFiles.length) {
        lines.push("")
        lines.push("- ✅ None")
    } else {
        lines.push("")
        for (const f of largeFiles) {
            lines.push(`- \`${f.rel}\` (${f.lines} lines)`)
        }
    }

    lines.push("")
    lines.push("## Action File Naming (kebab-case.ts)")
    if (!nonKebabActions.length) {
        lines.push("")
        lines.push("- ✅ None")
    } else {
        lines.push("")
        for (const rel of nonKebabActions.sort()) lines.push(`- \`${rel}\``)
    }

    lines.push("")
    lines.push("## Component File Naming (PascalCase.tsx)")
    if (!nonPascalComponents.length) {
        lines.push("")
        lines.push("- ✅ None")
    } else {
        lines.push("")
        for (const rel of nonPascalComponents.sort()) lines.push(`- \`${rel}\``)
    }

    lines.push("")
    lines.push("## App Route Special Files (allowed)")
    if (!appSpecialFiles.length) {
        lines.push("")
        lines.push("- ✅ None")
    } else {
        lines.push("")
        for (const rel of appSpecialFiles.sort()) lines.push(`- \`${rel}\``)
    }

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[code-structure] scanned source files: ${sourceFiles.length}`)
    console.log(`[code-structure] large files: ${largeFiles.length}`)
    console.log(`[code-structure] non-kebab actions: ${nonKebabActions.length}`)
    console.log(`[code-structure] non-pascal components: ${nonPascalComponents.length}`)
    console.log(`[code-structure] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)
}

main()
