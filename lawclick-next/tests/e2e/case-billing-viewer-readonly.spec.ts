import { test, expect } from "@playwright/test"
import { Role, TenantMembershipRole } from "./prisma"

import {
    addUserToTenantByEmail,
    buildE2EUser,
    createCaseViaWizard,
    getUserTenantIdByEmail,
    login,
    newE2EContext,
    registerUser,
    setUserRoleByEmail,
    setUserActiveTenantByEmail,
} from "./e2e-helpers"

test("VIEWER 成员：案件账务可见但只读（无创建入口）", async ({ browser }) => {
    test.setTimeout(180_000)

    const creator = buildE2EUser({ label: "billing-viewer-creator", name: `E2E创建者-${Date.now()}` })
    const viewer = buildE2EUser({ label: "billing-viewer-viewer", name: `E2E只读成员-${Date.now()}` })

    const bootstrapContext = await newE2EContext(browser)
    const bootstrapPage = await bootstrapContext.newPage()
    await registerUser(bootstrapPage, creator)
    await registerUser(bootstrapPage, viewer)
    await bootstrapContext.close()

    await setUserRoleByEmail(creator.email, Role.LAWYER)
    await setUserRoleByEmail(viewer.email, Role.LAWYER)
    const tenantId = await getUserTenantIdByEmail(creator.email)
    await addUserToTenantByEmail({ email: viewer.email, tenantId })
    await setUserActiveTenantByEmail({ email: viewer.email, tenantId })

    const creatorContext = await newE2EContext(browser)
    const creatorPage = await creatorContext.newPage()
    await login(creatorPage, creator)

    const { caseId } = await createCaseViaWizard(creatorPage, {
        title: `E2E案件-${Date.now()}`,
        handlerName: viewer.name,
    })

    await creatorContext.close()

    await addUserToTenantByEmail({ email: viewer.email, tenantId, membershipRole: TenantMembershipRole.VIEWER })

    const viewerContext = await newE2EContext(browser)
    const viewerPage = await viewerContext.newPage()
    await login(viewerPage, viewer)

    await viewerPage.goto(`/cases/${caseId}?tab=billing`)
    await expect(viewerPage.getByText("案件账务", { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(viewerPage.getByText("加载中...", { exact: true })).toHaveCount(0, { timeout: 30_000 })

    await viewerPage.getByRole("tab", { name: "发票", exact: true }).click()
    await expect(viewerPage.getByRole("button", { name: "创建发票", exact: true })).toHaveCount(0)

    await viewerPage.getByRole("tab", { name: "费用", exact: true }).click()
    await expect(viewerPage.getByRole("button", { name: "记录费用", exact: true })).toHaveCount(0)

    await viewerPage.getByRole("tab", { name: "审批", exact: true }).click()
    await expect(viewerPage.getByRole("button", { name: "新建审批", exact: true })).toHaveCount(0)

    await viewerPage.getByRole("tab", { name: "合同", exact: true }).click()
    await expect(viewerPage.getByRole("button", { name: "创建合同", exact: true })).toHaveCount(0)

    await viewerContext.close()
})
