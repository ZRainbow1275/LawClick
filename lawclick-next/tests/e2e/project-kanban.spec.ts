import { test, expect } from "@playwright/test"

import { buildE2EUser, createProjectViaDialog, createTaskInProjectKanban, login, newE2EContext, registerUser } from "./e2e-helpers"

test("项目主线：项目→任务→看板→任务中心可见", async ({ browser }) => {
    test.setTimeout(120_000)

    const user = buildE2EUser({ label: "project-mainline", name: `E2E项目用户-${Date.now()}` })

    const bootstrapContext = await newE2EContext(browser)
    const bootstrapPage = await bootstrapContext.newPage()
    await registerUser(bootstrapPage, user)
    await bootstrapContext.close()

    const context = await newE2EContext(browser)
    const page = await context.newPage()

    await login(page, user)

    const { projectId } = await createProjectViaDialog(page, { title: `E2E项目-${Date.now()}` })

    const taskTitle = `E2E项目任务-${Date.now()}`
    await createTaskInProjectKanban(page, { projectId, taskTitle })

    const todoColumn = page.getByTestId("task-kanban-column-TODO")
    const todoCard = todoColumn.locator("div.group", { hasText: taskTitle }).first()
    await todoCard.click()

    const dialog = page.getByRole("dialog", { name: /任务详情/ })
    await expect(dialog).toBeVisible({ timeout: 30_000 })

    const statusTrigger = dialog.getByRole("combobox", { name: "状态" })
    await expect(statusTrigger).toBeVisible({ timeout: 30_000 })

    const targetStatusOption = page.getByRole("option", { name: "进行中" }).first()
    for (let attempt = 0; attempt < 4; attempt++) {
        if (!(await targetStatusOption.isVisible().catch(() => false))) {
            await statusTrigger.click()
        }

        try {
            await targetStatusOption.click({ timeout: 15_000, force: true })
            await expect(statusTrigger).toContainText("进行中", { timeout: 10_000 })
            break
        } catch (err) {
            if (attempt === 3) throw err
            const openListbox = page.getByRole("listbox").first()
            if (await openListbox.isVisible().catch(() => false)) {
                await page.keyboard.press("Escape").catch(() => undefined)
            }
            await page.waitForTimeout(150)
        }
    }
    await dialog.getByRole("button", { name: "保存" }).click()
    await expect(dialog).toBeHidden({ timeout: 30_000 })

    const inProgressColumn = page.getByTestId("task-kanban-column-IN_PROGRESS")
    await expect(inProgressColumn.locator("div.group", { hasText: taskTitle }).first()).toBeVisible({ timeout: 30_000 })
    await expect(todoColumn.locator("div.group", { hasText: taskTitle })).toHaveCount(0)

    await page.reload()
    const inProgressColumnAfterReload = page.getByTestId("task-kanban-column-IN_PROGRESS")
    await expect(inProgressColumnAfterReload.locator("div.group", { hasText: taskTitle }).first()).toBeVisible({
        timeout: 30_000,
    })

    await page.goto("/tasks")
    await expect(page.getByRole("heading", { name: "任务中心" })).toBeVisible({ timeout: 30_000 })
    await page.getByPlaceholder("搜索任务/案件...").fill(taskTitle)
    await expect(page.getByText(taskTitle, { exact: true })).toBeVisible({ timeout: 30_000 })

    await context.close()
})
