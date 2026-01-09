const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")

const PROJECT_ROOT = path.join(__dirname, "..")
const REPO_ROOT = path.join(PROJECT_ROOT, "..")
const OUT_DIR = path.join(REPO_ROOT, "docs", "_artifacts")

function formatDate(d) {
    const pad = (n) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function run(cmd, args) {
    const res = spawnSync(cmd, args, {
        cwd: PROJECT_ROOT,
        encoding: "utf8",
        shell: process.platform === "win32",
    })
    return {
        command: [cmd, ...args].join(" "),
        status: res.status ?? null,
        stdout: res.stdout || "",
        stderr: res.stderr || "",
    }
}

function main() {
    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `deps_health_audit_${date}.md`)

    const auditJson = run("pnpm", ["audit", "--json"])
    const outdated = run("pnpm", ["outdated"])

    const lines = []
    lines.push(`# Dependency Health Audit (${date})`)
    lines.push("")
    lines.push("> 目的：依赖项健康度审计（漏洞/过期）。")
    lines.push("> 说明：依赖审计结果与 registry/锁文件有关；本文件记录“当下”输出，供后续升级闭环。")
    lines.push("")

    lines.push("## pnpm audit --json")
    lines.push("")
    lines.push(`- exit code: ${auditJson.status === null ? "null" : auditJson.status}`)
    lines.push("")
    lines.push("```")
    lines.push(auditJson.command)
    lines.push("```")
    lines.push("")
    if ((auditJson.stdout || "").trim()) {
        lines.push("### stdout")
        lines.push("")
        lines.push("```json")
        lines.push(auditJson.stdout.trim())
        lines.push("```")
        lines.push("")
    }
    if ((auditJson.stderr || "").trim()) {
        lines.push("### stderr")
        lines.push("")
        lines.push("```")
        lines.push(auditJson.stderr.trim())
        lines.push("```")
        lines.push("")
    }

    lines.push("## pnpm outdated")
    lines.push("")
    lines.push(`- exit code: ${outdated.status === null ? "null" : outdated.status}`)
    lines.push("")
    lines.push("```")
    lines.push(outdated.command)
    lines.push("```")
    lines.push("")
    if ((outdated.stdout || "").trim()) {
        lines.push("### stdout")
        lines.push("")
        lines.push("```")
        lines.push(outdated.stdout.trim())
        lines.push("```")
        lines.push("")
    }
    if ((outdated.stderr || "").trim()) {
        lines.push("### stderr")
        lines.push("")
        lines.push("```")
        lines.push(outdated.stderr.trim())
        lines.push("```")
        lines.push("")
    }

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[deps-health] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)
    console.log(`[deps-health] pnpm audit exit: ${auditJson.status}`)
    console.log(`[deps-health] pnpm outdated exit: ${outdated.status}`)
}

main()

