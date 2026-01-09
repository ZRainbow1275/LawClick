import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import fs from "node:fs"
import path from "node:path"
import { Role } from "./prisma"
import {
    addUserToTenantByEmail,
    buildE2EUser,
    createCaseViaWizard,
    getUserTenantIdByEmail,
    login,
    newE2EContext,
    registerUser,
    setUserRoleByEmail,
} from "./e2e-helpers"

type AuditItem = {
    name: string
    url: string
    waitFor?: (page: Page) => Promise<void>
}

function formatDate(d: Date) {
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function getArtifactsDir() {
    const repoRoot = path.resolve(__dirname, "../../..")
    return path.join(repoRoot, "docs", "_artifacts")
}

function formatViolationsAsMarkdown(input: {
    name: string
    url: string
    violations: Array<{
        id: string
        impact?: string | null
        help: string
        helpUrl: string
        nodes: Array<{ target: string[]; html: string; failureSummary?: string }>
    }>
}) {
    const lines: string[] = []
    lines.push(`### ${input.name}`)
    lines.push("")
    lines.push(`- url: \`${input.url}\``)
    lines.push(`- violations: ${input.violations.length}`)
    if (!input.violations.length) return lines

    lines.push("")
    for (const v of input.violations) {
        lines.push(`- **${v.id}** (${v.impact || "unknown"}) ${v.help}`)
        lines.push(`  - help: ${v.helpUrl}`)
        for (const node of v.nodes.slice(0, 6)) {
            lines.push(`  - target: \`${node.target.join(" ")}\``)
            lines.push(`    - html: \`${node.html.replace(/\s+/g, " ").trim().slice(0, 260)}\``)
            if (node.failureSummary) {
                lines.push(`    - failure: \`${node.failureSummary.replace(/\s+/g, " ").trim().slice(0, 260)}\``)
            }
        }
    }
    return lines
}

test("A11y：关键页面无严重违规（critical/serious）", async ({ browser }) => {
    test.setTimeout(240_000)

    const admin = buildE2EUser({ label: "a11y-partner", name: "E2E无障碍合伙人" })
    const lawyer = buildE2EUser({ label: "a11y-lawyer", name: `赵丽-${Date.now()}` })

    const bootstrapContext = await newE2EContext(browser)
    const bootstrapPage = await bootstrapContext.newPage()
    await registerUser(bootstrapPage, admin)
    await registerUser(bootstrapPage, lawyer)
    await bootstrapContext.close()

    // 使用 PARTNER 作为“全权限角色”，避免 ADMIN 角色缺少案件权限导致关键页面无法访问。
    await setUserRoleByEmail(admin.email, Role.PARTNER)
    const tenantId = await getUserTenantIdByEmail(admin.email)
    await addUserToTenantByEmail({ email: lawyer.email, tenantId })

    const ctx = await newE2EContext(browser)
    const page = await ctx.newPage()
    await login(page, admin)

    const { caseId } = await createCaseViaWizard(page, {
        title: `E2E案件-${Date.now()}`,
        handlerName: lawyer.name,
    })

    const items: AuditItem[] = [
        { name: "仪表盘", url: "/dashboard", waitFor: async (p) => expect(p.getByRole("heading", { name: "仪表盘" }).first()).toBeVisible() },
        { name: "案件管理", url: "/cases", waitFor: async (p) => expect(p.getByRole("heading", { name: "案件管理" }).first()).toBeVisible() },
        {
            name: "案件详情",
            url: `/cases/${caseId}`,
            waitFor: async (p) =>
                expect(p.getByRole("heading", { name: /案件工作台/ }).first()).toBeVisible({ timeout: 30_000 }),
        },
        { name: "文档中心", url: "/documents", waitFor: async (p) => expect(p.getByRole("heading", { name: "文档中心" }).first()).toBeVisible() },
        { name: "任务中心", url: "/tasks", waitFor: async (p) => expect(p.getByRole("heading", { name: "任务中心" }).first()).toBeVisible() },
        { name: "日程安排", url: "/calendar", waitFor: async (p) => expect(p.getByRole("heading", { name: "日程安排" }).first()).toBeVisible() },
        { name: "调度中心", url: "/dispatch", waitFor: async (p) => expect(p.getByRole("heading", { name: "调度中心" }).first()).toBeVisible() },
        { name: "审批中心", url: "/admin/approvals", waitFor: async (p) => expect(p.getByRole("heading", { name: "审批中心" }).first()).toBeVisible() },
        { name: "财务中心", url: "/admin/finance", waitFor: async (p) => expect(p.getByRole("heading", { name: "财务中心" }).first()).toBeVisible() },
        { name: "工具箱", url: "/tools", waitFor: async (p) => expect(p.getByRole("heading", { name: "工具箱" }).first()).toBeVisible() },
    ]

    const date = formatDate(new Date())
    const artifactsDir = getArtifactsDir()
    fs.mkdirSync(artifactsDir, { recursive: true })
    const outPath = path.join(artifactsDir, `a11y_audit_${date}.md`)

    const reportLines: string[] = []
    reportLines.push(`# A11y Audit (${date})`)
    reportLines.push("")
    reportLines.push("> 规则：仅阻断 critical/serious；moderate/minor 作为后续优化项。")
    reportLines.push(`> pages: ${items.length}`)
    reportLines.push("")

    const allSevere: Array<{ name: string; url: string; violations: unknown[] }> = []

    for (const item of items) {
        await page.goto(item.url)
        await page.waitForLoadState("domcontentloaded")
        if (item.waitFor) await item.waitFor(page)

        const results = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
            .analyze()

        const severe = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious")
        allSevere.push({ name: item.name, url: item.url, violations: severe })

        reportLines.push(...formatViolationsAsMarkdown({ name: item.name, url: item.url, violations: severe }))
        reportLines.push("")
    }

    fs.writeFileSync(outPath, reportLines.join("\n"), "utf8")

    const totalSevere = allSevere.reduce((acc, item) => acc + item.violations.length, 0)
    expect(totalSevere, `发现严重无障碍问题（详见：${outPath}）`).toBe(0)

    await ctx.close()
})
