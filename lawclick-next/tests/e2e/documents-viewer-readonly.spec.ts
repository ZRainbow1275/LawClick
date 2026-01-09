import { test, expect } from "@playwright/test"
import { Role, TenantMembershipRole } from "./prisma"

import { buildE2EUser, login, newE2EContext, registerUser, setTenantMembershipRoleByEmail, setUserRoleByEmail } from "./e2e-helpers"

test("VIEWER 成员：文档中心只读（无上传入口）", async ({ browser }) => {
    test.setTimeout(120_000)

    const viewer = buildE2EUser({ label: "documents-viewer", name: `E2E文档只读-${Date.now()}` })

    const bootstrapContext = await newE2EContext(browser)
    const bootstrapPage = await bootstrapContext.newPage()
    await registerUser(bootstrapPage, viewer)
    await bootstrapContext.close()

    await setUserRoleByEmail(viewer.email, Role.LAWYER)
    await setTenantMembershipRoleByEmail(viewer.email, TenantMembershipRole.VIEWER)

    const context = await newE2EContext(browser)
    const page = await context.newPage()
    await login(page, viewer)

    await page.goto("/documents")
    await expect(page.getByRole("heading", { name: "文档中心" })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText("只读：无上传/编辑权限", { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole("button", { name: "上传文档" })).toHaveCount(0)

    await context.close()
})
