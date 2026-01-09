import { test, expect } from "@playwright/test"
import { createE2EPrismaClient } from "./prisma"

import { buildE2EUser, createCaseViaWizard, getEnvOrThrow, login, registerUser, selectComboboxOption } from "./e2e-helpers"

test("文档：上传→预览/下载→版本链→AI失败可追溯", async ({ page }) => {
    test.setTimeout(180_000)

    const user = buildE2EUser({ label: "docs-browser", name: `E2E文档用户-${Date.now()}` })

    await registerUser(page, user)
    await login(page, user)

    const caseTitle = `E2E案件-文档-${Date.now()}`
    await createCaseViaWizard(page, { title: caseTitle, handlerName: user.name })

    // 1) 文档中心上传
    const docTitle = `E2E文档-${Date.now()}`
    const fileName = `e2e-doc-${Date.now()}.txt`
    const fileContent = `hello-doc-${Date.now()}`
    const notes = `E2E备注-${Date.now()}`

    await page.goto("/documents")
    await expect(page.getByRole("heading", { name: "文档中心" })).toBeVisible({ timeout: 30_000 })

    const uploadDialog = page.getByRole("dialog", { name: "上传新文档" })
    let openedUploadDialog = false
    for (let i = 0; i < 10; i += 1) {
        await page.getByRole("button", { name: "上传文档" }).click()
        if (await uploadDialog.isVisible().catch(() => false)) {
            openedUploadDialog = true
            break
        }
        await page.waitForTimeout(500)
    }
    expect(openedUploadDialog).toBeTruthy()
    await expect(uploadDialog).toBeVisible({ timeout: 30_000 })

    await uploadDialog.locator("input#file").setInputFiles({
        name: fileName,
        mimeType: "text/plain",
        buffer: Buffer.from(fileContent),
    })
    await uploadDialog.locator("input#title").fill(docTitle)

    const caseField = uploadDialog.getByText("关联案件", { exact: true }).locator("..")
    const caseTrigger = caseField.locator('[data-slot="select-trigger"]').first()
    await selectComboboxOption({ page, trigger: caseTrigger, optionName: caseTitle })

    await uploadDialog.locator("textarea#notes").fill(notes)

    await uploadDialog.getByRole("button", { name: "确认上传" }).click()
    await expect(page.getByText("文档上传成功")).toBeVisible({ timeout: 60_000 })

    // 2) 进入详情页（从列表菜单进入）
    await page.getByPlaceholder("搜索文档...").fill(docTitle)
    await expect(page.getByRole("heading", { name: docTitle })).toBeVisible({ timeout: 30_000 })

    const card = page
        .getByRole("heading", { name: docTitle, exact: true })
        .locator('xpath=ancestor::div[contains(@class,"group")][1]')
    await card.locator('button[aria-haspopup="menu"]').first().click()
    await page.getByRole("menuitem", { name: "详情" }).click()
    await expect(page).toHaveURL(/\/documents\/[^/?#]+(?:\?|$)/, { timeout: 30_000 })

    const docId = new URL(page.url()).pathname.split("/").pop()
    expect(docId).toBeTruthy()

    await expect(page.getByRole("heading", { name: docTitle })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText("版本历史")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText("v1", { exact: true }).first()).toBeVisible({ timeout: 30_000 })

    // 3) 预览（浏览器新窗口打开）
    const [previewPopup] = await Promise.all([
        page.waitForEvent("popup"),
        page.getByRole("button", { name: "预览" }).first().click(),
    ])
    await previewPopup.waitForLoadState("domcontentloaded")
    await expect(previewPopup.getByText(fileContent)).toBeVisible({ timeout: 30_000 })
    await previewPopup.close()

    // 4) 下载（直接核验受控下载接口 Header，不依赖浏览器下载事件）
    const origin = new URL(page.url()).origin
    const downloadRes = await page.request.get(`${origin}/api/documents/${docId}/file?download=1`)
    expect(downloadRes.ok()).toBeTruthy()
    const disposition = downloadRes.headers()["content-disposition"] || ""
    expect(disposition.toLowerCase()).toContain("attachment")

    // 5) 上传新版本并验证版本链
    const version2Content = `hello-doc-v2-${Date.now()}`
    await page.getByRole("button", { name: "上传新版本" }).click()
    const uploadV2Dialog = page.getByRole("dialog", { name: "上传新版本" })
    await expect(uploadV2Dialog).toBeVisible({ timeout: 30_000 })
    await uploadV2Dialog.locator("input#file").setInputFiles({
        name: `e2e-doc-v2-${Date.now()}.txt`,
        mimeType: "text/plain",
        buffer: Buffer.from(version2Content),
    })
    await uploadV2Dialog.getByRole("button", { name: "确认上传" }).click()
    await expect(page.getByText("上传成功")).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText("v2", { exact: true }).first()).toBeVisible({ timeout: 30_000 })

    // 6) AI 审查：未配置 key 时应明确失败，并落库 AIInvocation 审计
    await page.goto(`/documents/${docId}/review`)
    await expect(page.getByText("生成 AI 审查结果")).toBeVisible({ timeout: 30_000 })
    await page.getByRole("button", { name: "生成 AI 审查结果" }).click()
    await expect(page.getByText("AI 审查失败")).toBeVisible({ timeout: 30_000 })

    const databaseUrl = getEnvOrThrow("DATABASE_URL")
    const prisma = createE2EPrismaClient(databaseUrl)
    try {
        const userRow = await prisma.user.findUnique({ where: { email: user.email }, select: { id: true } })
        expect(userRow?.id).toBeTruthy()

        const invocation = await prisma.aIInvocation.findFirst({
            where: { userId: userRow!.id, type: "DOCUMENT_ANALYSIS" },
            orderBy: { createdAt: "desc" },
            select: { status: true, error: true, context: true },
        })
        expect(invocation?.status).toBe("ERROR")
        expect((invocation?.error || "").toLowerCase()).toContain("openai_api_key")
        expect(JSON.stringify(invocation?.context || {})).toContain(String(docId))
    } finally {
        await prisma.$disconnect()
    }
})
