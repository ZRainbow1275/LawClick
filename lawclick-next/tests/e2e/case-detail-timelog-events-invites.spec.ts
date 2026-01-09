import { test, expect } from "@playwright/test"

import {
    addUserToTenantByEmail,
    buildE2EUser,
    createCaseViaWizard,
    getUserTenantIdByEmail,
    login,
    newE2EContext,
    registerUser,
    setUserActiveTenantByEmail,
} from "./e2e-helpers"

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

test("案件详情：记工时 + 新建日程 + 邀请可响应", async ({ browser }) => {
    test.setTimeout(180_000)

    const creator = buildE2EUser({ label: "case-detail-creator", name: `E2E创建者-${Date.now()}` })
    const invitee = buildE2EUser({ label: "case-detail-invitee", name: `E2E承办-${Date.now()}` })

    const bootstrapContext = await newE2EContext(browser)
    const bootstrapPage = await bootstrapContext.newPage()
    await registerUser(bootstrapPage, creator)
    await registerUser(bootstrapPage, invitee)
    await bootstrapContext.close()

    const tenantId = await getUserTenantIdByEmail(creator.email)
    await addUserToTenantByEmail({ email: invitee.email, tenantId })
    await setUserActiveTenantByEmail({ email: invitee.email, tenantId })

    const creatorContext = await newE2EContext(browser)
    const creatorPage = await creatorContext.newPage()
    await login(creatorPage, creator)

    const { caseId } = await createCaseViaWizard(creatorPage, {
        title: `E2E案件-CaseDetail-${Date.now()}`,
        handlerName: invitee.name,
    })

    // 1) 工时：从案件详情“记工时”落库并回显
    const timeLogDesc = `E2E工时-${Date.now()}`
    await creatorPage.goto(`/cases/${caseId}?tab=timelog`)
    await expect(creatorPage.getByTestId("case-detail-add-timelog")).toBeVisible({ timeout: 30_000 })

    await creatorPage.getByTestId("case-detail-add-timelog").click()
    const timelogDialog = creatorPage.getByRole("dialog", { name: "记录工时" })
    await expect(timelogDialog).toBeVisible({ timeout: 30_000 })

    await timelogDialog.getByLabel("工作内容").fill(timeLogDesc)
    await timelogDialog.getByLabel("持续分钟").fill("30")
    await timelogDialog.getByRole("button", { name: "确认记录" }).click()

    await expect(creatorPage.getByText("工时已记录")).toBeVisible({ timeout: 30_000 })
    await expect(creatorPage.getByText(timeLogDesc)).toBeVisible({ timeout: 30_000 })

    // 2) 日程：从案件详情“新建日程”落库并回显，同时邀请参与人生成协作邀请
    const eventTitle = `E2E会议-${Date.now()}`
    await creatorPage.goto(`/cases/${caseId}?tab=events`)
    await expect(creatorPage.getByText("相关日程")).toBeVisible({ timeout: 30_000 })

    await creatorPage.getByTestId("case-detail-add-event").click()
    const eventDialog = creatorPage.getByRole("dialog", { name: "新建日程" })
    await expect(eventDialog).toBeVisible({ timeout: 30_000 })

    await eventDialog.getByLabel("标题").fill(eventTitle)
    await eventDialog.getByText(invitee.name).click()
    await eventDialog.getByRole("button", { name: "创建日程" }).click()

    await expect(creatorPage.getByText("已创建日程")).toBeVisible({ timeout: 30_000 })
    await expect(creatorPage.getByText(eventTitle)).toBeVisible({ timeout: 30_000 })

    await creatorContext.close()

    // 3) 被邀请人：通知中心跳转到 /invites 并可接受邀请（不依赖 /dispatch 角色门禁）
    const inviteeContext = await newE2EContext(browser)
    const inviteePage = await inviteeContext.newPage()
    await login(inviteePage, invitee)

    await inviteePage.goto("/notifications")
    await expect(inviteePage.getByRole("heading", { name: "通知中心" })).toBeVisible({ timeout: 30_000 })
    await inviteePage.getByRole("button", { name: "刷新" }).click()
    await expect(inviteePage.getByText(eventTitle)).toBeVisible({ timeout: 30_000 })

    await inviteePage
        .getByRole("link", { name: new RegExp(escapeRegExp(eventTitle)) })
        .first()
        .click()

    await expect(inviteePage).toHaveURL(/\/invites(?:\?|$)/, { timeout: 30_000 })
    await expect(inviteePage.getByText(eventTitle).first()).toBeVisible({ timeout: 30_000 })

    await inviteePage.getByRole("button", { name: "接受" }).click()
    await expect(inviteePage.getByText("已接受邀请")).toBeVisible({ timeout: 30_000 })

    await inviteeContext.close()

    // 4) 发起人：收到“邀请已接受”回执通知，点击跳转到可访问页面（会议→日程）
    const creatorContext2 = await newE2EContext(browser)
    const creatorPage2 = await creatorContext2.newPage()
    await login(creatorPage2, creator)

    await creatorPage2.goto("/notifications")
    await expect(creatorPage2.getByRole("heading", { name: "通知中心" })).toBeVisible({ timeout: 30_000 })
    await creatorPage2.getByRole("button", { name: "刷新" }).click()
    await expect(creatorPage2.getByText("邀请已接受：会议")).toBeVisible({ timeout: 30_000 })
    await expect(creatorPage2.getByText(eventTitle)).toBeVisible({ timeout: 30_000 })

    const acceptText = creatorPage2.getByText("邀请已接受：会议").first()
    const acceptAnchor = acceptText.locator("xpath=ancestor::a[1]")
    if (await acceptAnchor.count()) {
        await acceptAnchor.first().click()
    } else {
        await acceptText.click()
    }
    await expect(creatorPage2).toHaveURL(/\/calendar(?:\?|$)/, { timeout: 30_000 })

    await creatorContext2.close()
})
