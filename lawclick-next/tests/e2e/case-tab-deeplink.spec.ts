import { test, expect } from "@playwright/test"

import {
    addUserToTenantByEmail,
    buildE2EUser,
    createCaseViaWizard,
    createTaskInCase,
    getUserTenantIdByEmail,
    login,
    newE2EContext,
    registerUser,
    setUserActiveTenantByEmail,
} from "./e2e-helpers"

test("同页：任务通知跳转 /cases/:id?tab=tasks 定位", async ({ browser }) => {
    test.setTimeout(120_000)

    const creator = buildE2EUser({ label: "case-deeplink-creator", name: "E2E创建者" })
    const assignee = buildE2EUser({ label: "case-deeplink-assignee", name: `赵丽-${Date.now()}` })

    const bootstrapContext = await newE2EContext(browser)
    const bootstrapPage = await bootstrapContext.newPage()
    await registerUser(bootstrapPage, creator)
    await registerUser(bootstrapPage, assignee)
    await bootstrapContext.close()

    const tenantId = await getUserTenantIdByEmail(creator.email)
    await addUserToTenantByEmail({ email: assignee.email, tenantId })
    await setUserActiveTenantByEmail({ email: assignee.email, tenantId })

    const taskTitle = `E2E定位任务-${Date.now()}`

    const creatorContext = await newE2EContext(browser)
    const creatorPage = await creatorContext.newPage()

    await login(creatorPage, creator)
    const { caseId } = await createCaseViaWizard(creatorPage, { title: `E2E案件-${Date.now()}`, handlerName: assignee.name })
    await createTaskInCase(creatorPage, { caseId, taskTitle, assigneeName: assignee.name })

    await creatorContext.close()

    const assigneeContext = await newE2EContext(browser)
    const assigneePage = await assigneeContext.newPage()

    await login(assigneePage, assignee)

    await assigneePage.goto(`/cases/${caseId}`)
    await expect(assigneePage).toHaveURL(new RegExp(`/cases/${caseId}(?:\\?|$)`), { timeout: 30_000 })

    const documentsTab = assigneePage.getByRole("tab", { name: "文档", exact: true })
    await documentsTab.click()
    await expect(documentsTab).toHaveAttribute("aria-selected", "true", { timeout: 30_000 })

    await assigneePage.getByTestId("header-notifications-trigger").click()
    await expect(assigneePage.getByText(taskTitle)).toBeVisible({ timeout: 30_000 })

    await assigneePage.getByText(taskTitle).click()
    await expect(assigneePage).toHaveURL(new RegExp(`/cases/${caseId}\\?tab=tasks`), { timeout: 30_000 })
    await expect(assigneePage.getByText("任务看板")).toBeVisible({ timeout: 30_000 })

    await assigneeContext.close()
})
