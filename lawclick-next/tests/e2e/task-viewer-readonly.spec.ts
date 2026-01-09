import { test, expect } from "@playwright/test"
import { Role, TenantMembershipRole } from "./prisma"

import {
    addUserToTenantByEmail,
    buildE2EUser,
    createCaseViaWizard,
    createTaskInCase,
    getUserTenantIdByEmail,
    login,
    newE2EContext,
    registerUser,
    setUserRoleByEmail,
    setUserActiveTenantByEmail,
} from "./e2e-helpers"

test("VIEWER 成员：任务可见但只读（不可新建/不可保存）", async ({ browser }) => {
    test.setTimeout(180_000)

    const creator = buildE2EUser({ label: "task-viewer-creator", name: `E2E创建者-${Date.now()}` })
    const viewer = buildE2EUser({ label: "task-viewer-viewer", name: `E2E只读成员-${Date.now()}` })

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

    const { caseId } = await createCaseViaWizard(creatorPage, { title: `E2E案件-${Date.now()}`, handlerName: viewer.name })

    const taskTitle = `E2E只读任务-${Date.now()}`
    await createTaskInCase(creatorPage, { caseId, taskTitle, assigneeName: viewer.name })

    await creatorContext.close()

    await addUserToTenantByEmail({ email: viewer.email, tenantId, membershipRole: TenantMembershipRole.VIEWER })

    const viewerContext = await newE2EContext(browser)
    const viewerPage = await viewerContext.newPage()
    await login(viewerPage, viewer)

    await viewerPage.goto(`/cases/${caseId}?tab=tasks`)
    await expect(viewerPage.getByText("任务看板", { exact: true })).toBeVisible({ timeout: 30_000 })

    const todoColumn = viewerPage.getByTestId("task-kanban-column-TODO")
    await expect(todoColumn).toBeVisible({ timeout: 30_000 })
    await expect(todoColumn.locator("svg.animate-spin")).toHaveCount(0, { timeout: 30_000 })

    await expect(viewerPage.getByText("只读：无任务编辑权限", { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(viewerPage.getByTestId("task-kanban-add-TODO")).toHaveCount(0)

    const card = todoColumn.locator("div.group", { hasText: taskTitle }).first()
    await expect(card).toBeVisible({ timeout: 30_000 })

    await card.click()
    const detailDialog = viewerPage.getByRole("dialog", { name: "任务详情" })
    await expect(detailDialog).toBeVisible({ timeout: 30_000 })

    await expect(detailDialog.getByRole("button", { name: "保存" })).toHaveCount(0)
    await expect(detailDialog.getByRole("button", { name: "删除" })).toHaveCount(0)

    await detailDialog.getByRole("button", { name: "关闭" }).click()
    await expect(detailDialog).toHaveCount(0)

    await viewerContext.close()
})
