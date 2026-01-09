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

test("主线：案件→任务→任务分配通知→跳转定位", async ({ browser }) => {
    test.setTimeout(120_000)

    const creator = buildE2EUser({ label: "mainline-creator", name: "E2E创建者" })
    const assignee = buildE2EUser({ label: "mainline-assignee", name: `赵丽-${Date.now()}` })

    const bootstrapContext = await newE2EContext(browser)
    const bootstrapPage = await bootstrapContext.newPage()
    await registerUser(bootstrapPage, creator)
    await registerUser(bootstrapPage, assignee)
    await bootstrapContext.close()

    const tenantId = await getUserTenantIdByEmail(creator.email)
    await addUserToTenantByEmail({ email: assignee.email, tenantId })
    await setUserActiveTenantByEmail({ email: assignee.email, tenantId })

    const taskTitle = `E2E任务-${Date.now()}`

    const creatorContext = await newE2EContext(browser)
    const creatorPage = await creatorContext.newPage()

    await login(creatorPage, creator)

    const { caseId } = await createCaseViaWizard(creatorPage, {
        title: `E2E案件-${Date.now()}`,
        handlerName: assignee.name,
    })

    await createTaskInCase(creatorPage, {
        caseId,
        taskTitle,
        assigneeName: assignee.name,
    })

    await creatorContext.close()

    const assigneeContext = await newE2EContext(browser)
    const assigneePage = await assigneeContext.newPage()

    await login(assigneePage, assignee)

    await assigneePage.goto("/time")
    await expect(assigneePage.getByRole("heading", { name: "工时追踪" })).toBeVisible()

    const idleIndicator = assigneePage.getByText("未在计时", { exact: true })
    const stopBtn = assigneePage.getByTestId("timer-widget-stop")

    try {
        await Promise.race([
            idleIndicator.waitFor({ state: "visible", timeout: 30_000 }),
            stopBtn.waitFor({ state: "visible", timeout: 30_000 }),
        ])
    } catch {
        // ignore and let assertions below fail
    }

    if (await stopBtn.isVisible()) {
        await expect(stopBtn).toBeEnabled({ timeout: 30_000 })
        await stopBtn.click()
    }

    await expect(idleIndicator).toBeVisible({ timeout: 30_000 })

    await assigneePage.goto("/notifications")
    await expect(assigneePage.getByRole("heading", { name: "通知中心" })).toBeVisible()

    await assigneePage.getByRole("button", { name: "刷新" }).click()
    await expect(assigneePage.getByText(taskTitle)).toBeVisible({ timeout: 30_000 })

    await assigneePage.getByText(taskTitle).click()
    await expect(assigneePage).toHaveURL(/\/cases\/[^/?#]+\?tab=tasks/, { timeout: 30_000 })
    await expect(assigneePage.getByText("任务看板")).toBeVisible()

    const taskCard = assigneePage.locator("div.group", { hasText: taskTitle }).first()
    await expect(taskCard).toBeVisible({ timeout: 30_000 })

    await taskCard.getByRole("button", { name: /^计时$/ }).click()

    const floatingTimerStopButton = assigneePage.getByTestId("floating-timer-stop")
    await expect(floatingTimerStopButton).toBeEnabled({ timeout: 30_000 })
    await floatingTimerStopButton.click()

    await assigneePage.goto("/time")
    await expect(assigneePage.getByRole("heading", { name: "工时追踪" })).toBeVisible()
    const idleIndicator2 = assigneePage.getByTestId("timer-widget-idle")
    const stopBtn2 = assigneePage.getByTestId("timer-widget-stop")

    try {
        await Promise.race([
            idleIndicator2.waitFor({ state: "visible", timeout: 30_000 }),
            stopBtn2.waitFor({ state: "visible", timeout: 30_000 }),
        ])
    } catch {
        // ignore and let assertions below fail
    }

    if (await stopBtn2.isVisible()) {
        await expect(stopBtn2).toBeEnabled({ timeout: 30_000 })
        await stopBtn2.click()
    }

    await expect(idleIndicator2).toBeVisible({ timeout: 30_000 })
    await expect(assigneePage.getByText(taskTitle, { exact: true })).toBeVisible({ timeout: 30_000 })

    await assigneeContext.close()
})
