import { test, expect } from "@playwright/test"
import { Role } from "./prisma"

import {
    addUserToTenantByEmail,
    buildE2EUser,
    createCaseViaWizard,
    createDocumentRecordForCase,
    getUserTenantIdByEmail,
    login,
    newE2EContext,
    registerUser,
    setUserRoleByEmail,
    setUserActiveTenantByEmail,
} from "./e2e-helpers"

test("文档列表：仅展示可见案件的文档（非成员不可见）", async ({ browser }) => {
    test.setTimeout(180_000)

    const creator = buildE2EUser({ label: "doc-visibility-creator", name: `E2E创建者-${Date.now()}` })
    const outsider = buildE2EUser({ label: "doc-visibility-outsider", name: `E2E旁观者-${Date.now()}` })

    const bootstrapContext = await newE2EContext(browser)
    const bootstrapPage = await bootstrapContext.newPage()
    await registerUser(bootstrapPage, creator)
    await registerUser(bootstrapPage, outsider)
    await bootstrapContext.close()

    await setUserRoleByEmail(creator.email, Role.LAWYER)
    await setUserRoleByEmail(outsider.email, Role.LAWYER)
    const tenantId = await getUserTenantIdByEmail(creator.email)
    await addUserToTenantByEmail({ email: outsider.email, tenantId })
    await setUserActiveTenantByEmail({ email: outsider.email, tenantId })

    const creatorContext = await newE2EContext(browser)
    const creatorPage = await creatorContext.newPage()
    await login(creatorPage, creator)

    const { caseId } = await createCaseViaWizard(creatorPage, { title: `E2E案件-${Date.now()}`, handlerName: creator.name })
    const docTitle = `E2E文档可见性-${Date.now()}`
    await createDocumentRecordForCase({ caseId, title: docTitle, uploaderEmail: creator.email })

    await creatorPage.goto("/documents")
    await expect(creatorPage.getByRole("heading", { name: "文档中心" })).toBeVisible({ timeout: 30_000 })
    await creatorPage.getByPlaceholder("搜索文档...").fill(docTitle)
    await expect(creatorPage.getByText(docTitle, { exact: true })).toBeVisible({ timeout: 30_000 })

    await creatorContext.close()

    const outsiderContext = await newE2EContext(browser)
    const outsiderPage = await outsiderContext.newPage()
    await login(outsiderPage, outsider)

    await outsiderPage.goto("/documents")
    await expect(outsiderPage.getByRole("heading", { name: "文档中心" })).toBeVisible({ timeout: 30_000 })
    await outsiderPage.getByPlaceholder("搜索文档...").fill(docTitle)
    await expect(outsiderPage.getByText(docTitle, { exact: true })).toHaveCount(0)

    await outsiderContext.close()
})
