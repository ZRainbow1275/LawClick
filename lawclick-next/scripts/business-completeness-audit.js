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

function run(command, args) {
    const res = spawnSync(command, args, {
        cwd: PROJECT_ROOT,
        encoding: "utf8",
        shell: process.platform === "win32",
    })
    return {
        command: [command, ...args].join(" "),
        status: res.status ?? null,
        stdout: res.stdout || "",
        stderr: res.stderr || "",
    }
}

function extractWrotePaths(output) {
    const text = String(output || "")
    const out = new Set()
    for (const line of text.split(/\r?\n/)) {
        const m = line.match(/\bwrote:\s+(.*docs[\\/]+_artifacts[\\/].+\.md)\s*$/i)
        if (m && m[1]) {
            out.add(m[1].replace(/\\/g, "/").replace(/^.*?docs\//, "docs/"))
        }
    }
    return Array.from(out)
}

function main() {
    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `business_completeness_audit_${date}.md`)

    const steps = [
        { title: "Actions↔UI 真实调用覆盖", cmd: "node", args: ["scripts/actions-ui-invocation-audit.js"] },
        { title: "UI 禁用/占位按钮审计", cmd: "node", args: ["scripts/ui-disabled-actions-audit.js"] },
        { title: "Actions 限流覆盖", cmd: "node", args: ["scripts/action-rate-limit-coverage-audit.js"] },
        { title: "Actions 返回形状一致性", cmd: "node", args: ["scripts/action-result-shape-audit.js"] },
        { title: "全站乐高化 DIY 覆盖", cmd: "node", args: ["scripts/lego-diy-coverage-audit.js", "--all-app"] },
        { title: "全站乐高化 DIY 深度审计", cmd: "node", args: ["scripts/lego-diy-depth-audit.js"] },
        { title: "固定卡片网格残留审计", cmd: "node", args: ["scripts/lego-coverage-audit.js", "--include-workspace"] },
        { title: "固定堆叠卡片栏残留审计", cmd: "node", args: ["scripts/lego-freeform-coverage-audit.js", "--include-workspace"] },
        { title: "路由断链审计", cmd: "node", args: ["scripts/route-audit.js"] },
    ]

    const results = []
    const wrote = new Set()
    for (const step of steps) {
        const res = run(step.cmd, step.args)
        for (const p of extractWrotePaths(res.stdout)) wrote.add(p)
        results.push({ title: step.title, ...res })
    }

    const lines = []
    lines.push(`# Business Logic Completeness Audit (${date})`)
    lines.push("")
    lines.push("> 目的：以“功能真实闭环/前后端一致性/无占位”为标准，复跑关键门禁并汇总证据。")
    lines.push("> 说明：本脚本负责“聚合复跑”。具体问题明细请打开各自产物。")
    lines.push("")
    lines.push("## Summary")
    lines.push(`- steps: ${results.length}`)
    lines.push(`- artifacts: ${wrote.size}`)
    lines.push("")

    lines.push("## Artifacts")
    if (!wrote.size) {
        lines.push("")
        lines.push("- (none detected)")
    } else {
        lines.push("")
        for (const p of Array.from(wrote).sort()) {
            lines.push(`- \`${p}\``)
        }
    }

    lines.push("")
    lines.push("## Run Log")
    for (const r of results) {
        lines.push("")
        lines.push(`### ${r.title}`)
        lines.push("")
        lines.push(`- exit code: ${r.status === null ? "null" : r.status}`)
        lines.push("")
        lines.push("```")
        lines.push(r.command)
        lines.push("```")
        if ((r.stdout || "").trim()) {
            lines.push("")
            lines.push("#### stdout")
            lines.push("")
            lines.push("```")
            lines.push(r.stdout.trim())
            lines.push("```")
        }
        if ((r.stderr || "").trim()) {
            lines.push("")
            lines.push("#### stderr")
            lines.push("")
            lines.push("```")
            lines.push(r.stderr.trim())
            lines.push("```")
        }
    }

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[business-completeness] steps: ${results.length}`)
    console.log(`[business-completeness] artifacts: ${wrote.size}`)
    console.log(`[business-completeness] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)
}

main()
