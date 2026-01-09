import { test, expect } from "@playwright/test"
import { Role, createE2EPrismaClient } from "./prisma"
import {
    addUserToTenantByEmail,
    buildE2EUser,
    createCaseViaWizard,
    createDocumentRecordForCase,
    getEnvOrThrow,
    getUserTenantIdByEmail,
    login,
    newE2EContext,
    registerUser,
    setUserRoleByEmail,
} from "./e2e-helpers"

test("删除链路闭环：案件软删除 + 文档硬删除（UI→Actions→DB）", async ({ browser }) => {
    test.setTimeout(240_000)

    const admin = buildE2EUser({ label: "delete-admin", name: `E2E删除合伙人-${Date.now()}` })
    const lawyer = buildE2EUser({ label: "delete-lawyer", name: `E2E删除律师-${Date.now()}` })

    const bootstrap = await newE2EContext(browser)
    const bootstrapPage = await bootstrap.newPage()
    await registerUser(bootstrapPage, admin)
    await registerUser(bootstrapPage, lawyer)
    await bootstrap.close()

    await setUserRoleByEmail(admin.email, Role.PARTNER)
    await setUserRoleByEmail(lawyer.email, Role.LAWYER)
    const tenantId = await getUserTenantIdByEmail(admin.email)
    await addUserToTenantByEmail({ email: lawyer.email, tenantId })

    const context = await newE2EContext(browser)
    const page = await context.newPage()
    await login(page, admin)

    const caseTitle = `E2E删除案件-${Date.now()}`
    const { caseId } = await createCaseViaWizard(page, { title: caseTitle, handlerName: lawyer.name })

    const documentTitle = `E2E删除文档-${Date.now()}`
    const { documentId } = await createDocumentRecordForCase({ caseId, title: documentTitle, uploaderEmail: admin.email })

    await page.goto("/documents")
    await expect(page.getByRole("heading", { name: "文档中心", level: 1 })).toBeVisible({ timeout: 30_000 })
    await page.getByPlaceholder("搜索文档...").fill(documentTitle)
    await expect(page.getByText(documentTitle, { exact: true }).first()).toBeVisible({ timeout: 30_000 })

    await page.goto(`/documents/${documentId}`)
    await expect(page).toHaveURL(new RegExp(`/documents/${documentId}(?:\\?|$)`), { timeout: 30_000 })
    await expect(page.getByRole("heading", { name: documentTitle, level: 1 })).toBeVisible({ timeout: 30_000 })

    await expect(page.getByRole("button", { name: "编辑布局" })).toBeEnabled({ timeout: 30_000 })
    await page.getByRole("button", { name: "删除", exact: true }).click()
    const docDeleteDialog = page.getByRole("alertdialog")
    await expect(docDeleteDialog).toBeVisible({ timeout: 30_000 })
    await docDeleteDialog.locator("input").fill(documentTitle)
    await docDeleteDialog.getByRole("button", { name: "确认删除" }).click()

    await expect(page).toHaveURL(/\/documents(?:\?|$)/, { timeout: 30_000 })
    await page.getByPlaceholder("搜索文档...").fill(documentTitle)
    await expect(page.getByText(documentTitle, { exact: true })).toHaveCount(0)

    await page.goto(`/cases/${caseId}?tab=settings`)
    await expect(page.getByText("案件设置", { exact: true })).toBeVisible({ timeout: 30_000 })

    const caseDeleteBlock = page.locator('[data-section-block-id="b_case_settings_delete"]')
    const caseDeleteButton = caseDeleteBlock.getByRole("button", { name: "删除" })
    await expect(caseDeleteButton).toBeEnabled({ timeout: 30_000 })
    await caseDeleteButton.click()
    const caseDeleteDialog = page.getByRole("alertdialog")
    await expect(caseDeleteDialog).toBeVisible({ timeout: 30_000 })

    const token = (await caseDeleteDialog.locator("span.font-medium").textContent())?.trim() || ""
    expect(token, "案件删除 token 不应为空").not.toEqual("")

    await caseDeleteDialog.locator("input").fill(token)
    await caseDeleteDialog.getByRole("button", { name: "确认删除" }).click()
    await expect(page).toHaveURL(/\/cases(?:\?|$)/, { timeout: 30_000 })

    await page.getByPlaceholder("搜索案件标题、编号或客户...").fill(caseTitle)
    await expect(page.getByText(caseTitle, { exact: true })).toHaveCount(0)

    const prisma = createE2EPrismaClient(getEnvOrThrow("DATABASE_URL"))
    try {
        const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { id: true } })
        expect(doc, "文档应被硬删除").toBeNull()

        const row = await prisma.case.findUnique({ where: { id: caseId }, select: { deletedAt: true } })
        expect(row?.deletedAt, "案件应被软删除（deletedAt 非空）").toBeTruthy()
    } finally {
        await prisma.$disconnect()
    }

    await context.close()
})
