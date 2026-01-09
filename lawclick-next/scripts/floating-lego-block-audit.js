const fs = require("fs")
const path = require("path")

const PROJECT_ROOT = path.join(__dirname, "..")
const REPO_ROOT = path.join(PROJECT_ROOT, "..")
const OUT_DIR = path.join(REPO_ROOT, "docs", "_artifacts")

function formatDate(d) {
    const pad = (n) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function readTextOrNull(filePath) {
    try {
        return fs.readFileSync(filePath, "utf8")
    } catch {
        return null
    }
}

function countOccurrences(haystack, needle) {
    if (!haystack || !needle) return 0
    let count = 0
    let idx = 0
    while (true) {
        const next = haystack.indexOf(needle, idx)
        if (next === -1) break
        count += 1
        idx = next + needle.length
    }
    return count
}

function main() {
    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `floating_lego_block_audit_${date}.md`)

    const floatStorePath = path.join(PROJECT_ROOT, "src", "store", "float-store.ts")
    const floatingLayerPath = path.join(PROJECT_ROOT, "src", "components", "layout", "FloatingLayer.tsx")
    const pageWorkspacePath = path.join(PROJECT_ROOT, "src", "components", "layout", "PageWorkspace.tsx")
    const sectionWorkspacePath = path.join(PROJECT_ROOT, "src", "components", "layout", "SectionWorkspace.tsx")
    const floatingLegoBlockPath = path.join(PROJECT_ROOT, "src", "components", "floating", "FloatingLegoBlock.tsx")
    const legoRegistryStorePath = path.join(PROJECT_ROOT, "src", "store", "lego-block-registry-store.ts")
    const floatingWindowsLibPath = path.join(PROJECT_ROOT, "src", "lib", "ui", "floating-windows.ts")

    const floatStoreText = readTextOrNull(floatStorePath)
    const floatingLayerText = readTextOrNull(floatingLayerPath)
    const pageWorkspaceText = readTextOrNull(pageWorkspacePath)
    const sectionWorkspaceText = readTextOrNull(sectionWorkspacePath)
    const floatingWindowsText = readTextOrNull(floatingWindowsLibPath)

    const checks = []

    checks.push({
        id: "file:FloatingLegoBlock.tsx",
        ok: fs.existsSync(floatingLegoBlockPath),
        detail: "浮窗渲染组件存在",
    })
    checks.push({
        id: "file:lego-block-registry-store.ts",
        ok: fs.existsSync(legoRegistryStorePath),
        detail: "运行期 registry（非持久化）存在",
    })
    checks.push({
        id: "file:floating-windows.ts",
        ok: fs.existsSync(floatingWindowsLibPath),
        detail: "浮窗数据 schema（Zod）存在",
    })

    checks.push({
        id: "float-store:WindowType includes LEGO_BLOCK",
        ok: Boolean(floatStoreText && floatStoreText.includes("'LEGO_BLOCK'")),
        detail: "float store 支持 LEGO_BLOCK window type",
    })
    checks.push({
        id: "float-store:default size",
        ok: Boolean(floatStoreText && floatStoreText.includes("case 'LEGO_BLOCK':")),
        detail: "LEGO_BLOCK 默认尺寸已定义",
    })
    checks.push({
        id: "float-store:default position",
        ok: Boolean(floatStoreText && floatStoreText.includes('case "LEGO_BLOCK":')),
        detail: "LEGO_BLOCK 默认位置已定义",
    })

    checks.push({
        id: "FloatingLayer:switch case LEGO_BLOCK",
        ok: Boolean(floatingLayerText && floatingLayerText.includes("case 'LEGO_BLOCK':")),
        detail: "浮窗层能渲染 LEGO_BLOCK 内容",
    })

    const openLabelCount = countOccurrences(sectionWorkspaceText, 'aria-label="在浮窗打开"')
    checks.push({
        id: "SectionWorkspace:open button coverage",
        ok: Boolean(sectionWorkspaceText && openLabelCount >= 2),
        detail: `SectionWorkspace 内至少两处“在浮窗打开”入口（cover card/none 两种 chrome） (count=${openLabelCount})`,
    })
    checks.push({
        id: "SectionWorkspace:openWindow type",
        ok: Boolean(sectionWorkspaceText && sectionWorkspaceText.includes('"LEGO_BLOCK"')),
        detail: "SectionWorkspace 打开浮窗时使用 LEGO_BLOCK 类型",
    })

    const pageOpenLabelCount = countOccurrences(pageWorkspaceText, 'aria-label="在浮窗打开"')
    checks.push({
        id: "PageWorkspace:open button coverage",
        ok: Boolean(pageWorkspaceText && pageOpenLabelCount >= 2),
        detail: `PageWorkspace 内至少两处“在浮窗打开”入口（cover card/none 两种 chrome） (count=${pageOpenLabelCount})`,
    })
    checks.push({
        id: "PageWorkspace:openWindow type",
        ok: Boolean(pageWorkspaceText && pageWorkspaceText.includes('"LEGO_BLOCK"')),
        detail: "PageWorkspace 打开浮窗时使用 LEGO_BLOCK 类型",
    })
    checks.push({
        id: "floating-windows:SECTION_BLOCK schema",
        ok: Boolean(floatingWindowsText && floatingWindowsText.includes('kind: z.literal("SECTION_BLOCK")')),
        detail: "浮窗 data schema 使用判别字段 kind=SECTION_BLOCK",
    })
    checks.push({
        id: "floating-windows:PAGE_WIDGET schema",
        ok: Boolean(floatingWindowsText && floatingWindowsText.includes('kind: z.literal("PAGE_WIDGET")')),
        detail: "浮窗 data schema 支持 kind=PAGE_WIDGET（页面级 widget）",
    })

    const failures = checks.filter((c) => !c.ok)

    const lines = []
    lines.push(`# Floating Lego Block Audit (${date})`)
    lines.push("")
    lines.push("> 目的：用“可证据复跑”的方式证明：任意 SectionWorkspace/LegoDeck 区块都可一键“弹出为浮窗”，并复用既有磁吸/分屏（dock-snap）能力；避免只停留在“可拖拽布局”层面的伪乐高化。")
    lines.push("> 说明：该审计为静态审计（不启动 Web/DB），主要验证关键拼图是否齐备、入口是否覆盖。")
    lines.push("")
    lines.push("## Summary")
    lines.push(`- checks: ${checks.length}`)
    lines.push(`- failures: ${failures.length}`)
    lines.push("")
    lines.push("## Checks")
    lines.push("")
    for (const c of checks) {
        lines.push(`- ${c.ok ? "✅" : "❌"} ${c.id} — ${c.detail}`)
    }

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[floating-lego-block] checks: ${checks.length}`)
    console.log(`[floating-lego-block] failures: ${failures.length}`)
    console.log(`[floating-lego-block] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)

    if (failures.length > 0) process.exit(1)
}

main()
