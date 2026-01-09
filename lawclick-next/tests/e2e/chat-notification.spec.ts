import { test, expect } from "@playwright/test"

import {
    addUserToTenantByEmail,
    buildE2EUser,
    getUserTenantIdByEmail,
    login,
    newE2EContext,
    registerUser,
    setUserActiveTenantByEmail,
} from "./e2e-helpers"

test("同页：Header 通知跳转 /chat?threadId 定位", async ({ browser }) => {
    test.setTimeout(120_000)

    const sender = buildE2EUser({ label: "chat-sender", name: "E2E发送者" })
    const receiver = buildE2EUser({ label: "chat-receiver", name: "E2E接收者" })

    const messageText = `E2E消息-${Date.now()}`

    const bootstrapContext = await newE2EContext(browser)
    const bootstrapPage = await bootstrapContext.newPage()
    await registerUser(bootstrapPage, sender)
    await registerUser(bootstrapPage, receiver)
    await bootstrapContext.close()

    const tenantId = await getUserTenantIdByEmail(sender.email)
    await addUserToTenantByEmail({ email: receiver.email, tenantId })
    await setUserActiveTenantByEmail({ email: receiver.email, tenantId })

    const receiverJoinContext = await newE2EContext(browser)
    const receiverJoinPage = await receiverJoinContext.newPage()
    await login(receiverJoinPage, receiver)
    await receiverJoinPage.goto("/chat")
    await expect(receiverJoinPage.getByText("消息", { exact: true })).toBeVisible({ timeout: 30_000 })
    await receiverJoinContext.close()

    const senderContext = await newE2EContext(browser)
    const senderPage = await senderContext.newPage()

    await login(senderPage, sender)

    await senderPage.goto("/chat")
    await expect(senderPage.getByText("消息", { exact: true })).toBeVisible({ timeout: 30_000 })

    await senderPage.getByPlaceholder("搜索会话...").fill("团队群聊")
    await senderPage.getByText("团队群聊").first().click()

    await senderPage.getByPlaceholder("输入消息...").fill(messageText)
    await senderPage.getByPlaceholder("输入消息...").press("Enter")
    await expect(senderPage.getByText(messageText).first()).toBeVisible({ timeout: 30_000 })

    await senderContext.close()

    const receiverContext = await newE2EContext(browser)
    const receiverPage = await receiverContext.newPage()

    await login(receiverPage, receiver)

    await receiverPage.goto("/chat")
    await expect(receiverPage.getByText("消息", { exact: true })).toBeVisible({ timeout: 30_000 })

    await receiverPage.getByTestId("header-notifications-trigger").click()
    await expect(receiverPage.getByText(messageText).first()).toBeVisible({ timeout: 30_000 })
    await receiverPage.getByText(messageText).first().click()

    await expect(receiverPage).toHaveURL(/\/chat\?threadId=/, { timeout: 30_000 })
    await expect(receiverPage.getByText(messageText).first()).toBeVisible({ timeout: 30_000 })

    await receiverContext.close()
})
