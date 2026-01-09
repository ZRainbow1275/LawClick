const fs = require("fs")
const path = require("path")
const Module = require("module")

const PROJECT_ROOT = path.join(__dirname, "..")
const REPO_ROOT = path.join(PROJECT_ROOT, "..")
const OUT_DIR = path.join(REPO_ROOT, "docs", "_artifacts")

function formatDate(d) {
    const pad = (n) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function installTsPathAlias() {
    const originalResolveFilename = Module._resolveFilename
    Module._resolveFilename = function (request, parent, isMain, options) {
        if (typeof request === "string" && request.startsWith("@/")) {
            const mapped = path.join(PROJECT_ROOT, "src", request.slice(2))
            return originalResolveFilename.call(this, mapped, parent, isMain, options)
        }
        return originalResolveFilename.call(this, request, parent, isMain, options)
    }
}

function inferKind(name) {
    const v = String(name || "").trim()
    if (!v) return "generic"
    const is = (keys) => keys.some((k) => v.includes(k))
    if (is(["起诉状", "反诉状", "上诉状", "申请书", "异议", "具结书", "辩护词"])) return "petition"
    if (is(["合同", "协议", "章程", "计划"])) return "contract"
    if (is(["会议记录", "决议"])) return "meeting"
    if (is(["律师函", "函", "通知书", "确认函", "承诺函"])) return "letter"
    if (is(["清单", "目录", "检查单", "证据册"])) return "checklist"
    if (is(["报告", "意见书", "备忘录", "回复意见"])) return "report"
    if (is(["委托书", "告知书", "确认书", "确认单", "承诺书", "登记表", "审批表", "记录单", "报销单", "笔录", "档案表", "审查表", "提纲", "回执", "模板"])) return "form"
    return "generic"
}

function minLenForKind(kind) {
    const k = String(kind || "generic")
    if (k === "contract") return 800
    if (k === "petition") return 650
    if (k === "report") return 650
    if (k === "checklist") return 550
    if (k === "meeting") return 500
    if (k === "letter") return 450
    if (k === "form") return 450
    return 400
}

function main() {
    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `template_content_audit_${date}.md`)     

    installTsPathAlias()
    // Must be registered after alias patch so that `@/` works at runtime.      
    require("ts-node").register({
        transpileOnly: true,
        compilerOptions: {
            module: "CommonJS",
            moduleResolution: "Node",
        },
    })

    const { listBuiltinDocumentTemplates } = require(path.join(
        PROJECT_ROOT,
        "src",
        "lib",
        "templates",
        "builtin",
        "builtin-document-templates.ts"
    ))

    const templates = listBuiltinDocumentTemplates()
    const banned = [
        /请在此处/g,
        /正文结构建议/g,
        /建议格式/g,
        /条目\s*1/g,
        /该模板暂无变量字段/g,
    ]

    const offenders = []
    for (const t of templates) {
        const kind = inferKind(t.name)
        const minLen = minLenForKind(kind)
        const issues = []

        const content = String(t.content || "")
        if (content.length < minLen) issues.push(`content too short (<${minLen})`)
        if (!content.includes("## 正文")) issues.push("missing section: 正文")
        if (!content.includes("## 落款/签署")) issues.push("missing section: 落款/签署")
        if (!content.includes("日期：{{date}}")) issues.push("missing signature date placeholder")
        if (!/###\s+/.test(content)) issues.push("missing subsection headings (###)")

        for (const re of banned) {
            re.lastIndex = 0
            if (re.test(content)) issues.push(`banned pattern: ${String(re)}`)
        }

        if (issues.length) {
            offenders.push({
                code: t.code,
                name: t.name,
                kind,
                length: content.length,
                issues,
            })
        }
    }

    offenders.sort((a, b) => (a.code === b.code ? 0 : a.code.localeCompare(b.code)))

    const lines = []
    lines.push(`# Template Content Audit (${date})`)
    lines.push("")
    lines.push("> 目的：确保内置文书模板“可直接使用”，避免空壳/占位文本进入生产。")
    lines.push("> 说明：此审计在 Node 环境下实际生成内置模板内容，并进行启发式检查。")
    lines.push("")
    lines.push("## Summary")
    lines.push(`- templates: ${templates.length}`)
    lines.push(`- offenders: ${offenders.length}`)
    lines.push("")
    lines.push("## Offenders")
    if (!offenders.length) {
        lines.push("")
        lines.push("- ✅ None")
    } else {
        lines.push("")
        for (const o of offenders) {
            lines.push(`- \`${o.code}\` ${o.name} (${o.kind}, len=${o.length}) -> ${o.issues.join("; ")}`)
        }
    }
    lines.push("")

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[template-content] templates: ${templates.length}`)
    console.log(`[template-content] offenders: ${offenders.length}`)
    console.log(`[template-content] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)

    if (offenders.length) process.exitCode = 1
}

main()
