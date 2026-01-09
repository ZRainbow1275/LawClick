import { test, expect } from "@playwright/test"
import { Role, TenantMembershipRole, TenantMembershipStatus, createE2EPrismaClient } from "./prisma"

import {
    addUserToTenantByEmail,
    buildE2EUser,
    createCaseViaWizard,
    createProjectViaDialog,
    createTaskInCase,
    createTaskInProjectKanban,
    getEnvOrThrow,
    getUserTenantIdByEmail,
    login,
    newE2EContext,
    registerUser,
    selectComboboxOption,
    setUserActiveTenantByEmail,
    setUserRoleByEmail,
} from "./e2e-helpers"

async function switchTenantById(page: Parameters<typeof login>[0], email: string, tenantId: string) {
    await setUserActiveTenantByEmail({ email, tenantId })
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 })
}

test("真多租户隔离：跨租户数据不可见/不可访问（项目→任务→看板主线）", async ({ browser }) => {
    test.setTimeout(180_000)

    const user = buildE2EUser({ label: "tenant-isolation", name: `E2E多租户用户-${Date.now()}` })

    const bootstrapContext = await newE2EContext(browser)
    const bootstrapPage = await bootstrapContext.newPage()
    await registerUser(bootstrapPage, user)
    await bootstrapContext.close()

    await setUserRoleByEmail(user.email, Role.PARTNER)
    const baselineTenantId = await getUserTenantIdByEmail(user.email)

    const context = await newE2EContext(browser)
    const page = await context.newPage()
    await login(page, user)

    const tenantSuffix = Date.now().toString(36)
    const tenantId = `e2e-tenant-${tenantSuffix}`
    const tenantName = `E2E租户-${tenantSuffix}`

    await page.goto("/admin/tenants")
    await expect(page.getByText("创建新租户", { exact: true })).toBeVisible({ timeout: 30_000 })

    const tenantIdInput = page.getByPlaceholder("tenantId（如 acme-firm）")
    const tenantNameInput = page.getByPlaceholder("租户名称")
    const createTenantButton = page.getByRole("button", { name: "创建租户" })

    await tenantIdInput.click()
    await tenantIdInput.fill(tenantId)
    await expect(tenantIdInput).toHaveValue(tenantId, { timeout: 30_000 })

    await tenantNameInput.click()
    await tenantNameInput.fill(tenantName)
    await expect(tenantNameInput).toHaveValue(tenantName, { timeout: 30_000 })

    await expect(createTenantButton).toBeEnabled({ timeout: 30_000 })
    await createTenantButton.click()
    await expect(page.getByText("已创建租户", { exact: true })).toBeVisible({ timeout: 30_000 })

    await page.goto("/tenants")
    await expect(page.getByText(tenantId, { exact: true })).toBeVisible({ timeout: 30_000 })

    await switchTenantById(page, user.email, tenantId)

    const projectTitle = `E2E隔离项目-${Date.now()}`
    const { projectId } = await createProjectViaDialog(page, { title: projectTitle })

    const taskTitle = `E2E隔离任务-${Date.now()}`
    await createTaskInProjectKanban(page, { projectId, taskTitle })

    await switchTenantById(page, user.email, baselineTenantId)

    const crossTenantRes = await page.goto(`/projects/${projectId}`)
    expect(crossTenantRes?.status()).toBe(404)

    await page.goto("/projects")
    await expect(page.getByRole("heading", { name: "项目中心" })).toBeVisible({ timeout: 30_000 })
    await page.getByPlaceholder("搜索项目名称/编号...").fill(projectTitle)
    await expect(page.getByText(projectTitle, { exact: true })).toHaveCount(0)

    await switchTenantById(page, user.email, tenantId)

    const inTenantRes = await page.goto(`/projects/${projectId}`)
    expect(inTenantRes?.ok()).toBeTruthy()
    await expect(page.getByRole("heading", { name: projectTitle })).toBeVisible({ timeout: 30_000 })

    await context.close()
})

test("离职交接：冻结账号并转移资源归属（LC-AUDIT-001）", async ({ browser }) => {
    test.setTimeout(420_000)

    const ts = Date.now()
    const owner = buildE2EUser({ label: "offboard-owner", name: `E2E离职Owner-${ts}` })
    const leaver = buildE2EUser({ label: "offboard-leaver", name: `E2E离职成员-${ts}` })

    // register owner
    const ownerBootstrap = await newE2EContext(browser)
    const ownerBootstrapPage = await ownerBootstrap.newPage()
    await registerUser(ownerBootstrapPage, owner)
    await ownerBootstrap.close()

    await setUserRoleByEmail(owner.email, Role.PARTNER)
    const tenantId = await getUserTenantIdByEmail(owner.email)

    // register leaver
    const leaverBootstrap = await newE2EContext(browser)
    const leaverBootstrapPage = await leaverBootstrap.newPage()
    await registerUser(leaverBootstrapPage, leaver)
    await leaverBootstrap.close()

    // add leaver into owner's tenant and switch active tenant
    await addUserToTenantByEmail({
        email: leaver.email,
        tenantId,
        membershipRole: TenantMembershipRole.MEMBER,
    })
    await setUserActiveTenantByEmail({ email: leaver.email, tenantId })    

    const leaverMembershipId = await (async () => {
        const databaseUrl = getEnvOrThrow("DATABASE_URL")
        const prisma = createE2EPrismaClient(databaseUrl)
        try {
            const user = await prisma.user.findUnique({ where: { email: leaver.email }, select: { id: true } })
            if (!user) throw new Error("用户不存在")
            return `tm:${tenantId}:${user.id}`
        } finally {
            await prisma.$disconnect()
        }
    })()

    // leaver creates resources in tenant
    const leaverCtx = await newE2EContext(browser)
    const leaverPage = await leaverCtx.newPage()
    await login(leaverPage, leaver)

    const projectTitle = `E2E离职项目-${ts}`
    await createProjectViaDialog(leaverPage, { title: projectTitle })

    const caseTitle = `E2E离职案件-${ts}`
    const { caseId } = await createCaseViaWizard(leaverPage, { title: caseTitle, handlerName: leaver.name })

    const taskTitle = `E2E离职任务-${ts}`
    await createTaskInCase(leaverPage, { caseId, taskTitle, assigneeName: leaver.name })

    await leaverCtx.close()

    // owner offboards leaver via UI
    const ownerCtx = await newE2EContext(browser)
    const ownerPage = await ownerCtx.newPage()
    await login(ownerPage, owner)

    await ownerPage.goto("/admin/tenants")
    await expect(ownerPage.getByText("当前租户成员", { exact: true })).toBeVisible({ timeout: 30_000 })

    const offboardButton = ownerPage.getByTestId(`tenant-member-offboard:${leaverMembershipId}`)
    await expect(offboardButton).toBeVisible({ timeout: 30_000 })
    await offboardButton.click()

    const dialog = ownerPage.getByRole("dialog", { name: "离职交接" })
    await expect(dialog).toBeVisible({ timeout: 30_000 })

    await selectComboboxOption({
        page: ownerPage,
        trigger: dialog.getByRole("combobox").first(),
        optionName: owner.name,
    })

    await dialog.getByRole("button", { name: "确认离职交接" }).click()     
    await expect(ownerPage.getByText("离职交接完成", { exact: true })).toBeVisible({ timeout: 30_000 })

    // verify DB transfer
    const databaseUrl = getEnvOrThrow("DATABASE_URL")
    const prisma = createE2EPrismaClient(databaseUrl)
    try {
        const [ownerRow, leaverRowDb] = await Promise.all([
            prisma.user.findUnique({ where: { email: owner.email }, select: { id: true } }),
            prisma.user.findUnique({ where: { email: leaver.email }, select: { id: true, isActive: true } }),
        ])

        expect(ownerRow?.id).toBeTruthy()
        expect(leaverRowDb?.id).toBeTruthy()
        expect(leaverRowDb?.isActive).toBe(false)

        const project = await prisma.project.findFirst({
            where: { tenantId, title: projectTitle, deletedAt: null },
            select: { ownerId: true },
        })
        expect(project?.ownerId).toBe(ownerRow!.id)

        const task = await prisma.task.findFirst({
            where: { tenantId, title: taskTitle },
            select: { assigneeId: true },
        })
        expect(task?.assigneeId).toBe(ownerRow!.id)

        const caseRow = await prisma.case.findFirst({
            where: { tenantId, title: caseTitle, deletedAt: null },
            select: { handlerId: true, originatorId: true },
        })
        expect(caseRow?.handlerId).toBe(ownerRow!.id)
        expect(caseRow?.originatorId).toBe(ownerRow!.id)
    } finally {
        await prisma.$disconnect()
    }

    // leaver cannot login anymore
    const leaverAfterCtx = await newE2EContext(browser)
    const leaverAfterPage = await leaverAfterCtx.newPage()
    await leaverAfterPage.goto("/auth/login")
    await leaverAfterPage.getByLabel("邮箱").fill(leaver.email)
    await leaverAfterPage.getByLabel("密码").fill(leaver.password)
    await leaverAfterPage.getByRole("button", { name: "登录" }).click()
    await expect(leaverAfterPage).toHaveURL(/\/auth\/login(?:\?|$)/, { timeout: 30_000 })
    await leaverAfterCtx.close()

    await ownerCtx.close()
})

test("停用成员：禁用后无法登录且不会被自愈写回 ACTIVE（LC-AUDIT-001）", async ({ browser }) => {
    test.setTimeout(240_000)

    const ts = Date.now()
    const owner = buildE2EUser({ label: "disable-owner", name: `E2E停用Owner-${ts}` })
    const member = buildE2EUser({ label: "disable-member", name: `E2E停用成员-${ts}` })

    const bootstrapContext = await newE2EContext(browser)
    const bootstrapPage = await bootstrapContext.newPage()
    await registerUser(bootstrapPage, owner)
    await registerUser(bootstrapPage, member)
    await bootstrapContext.close()

    await setUserRoleByEmail(owner.email, Role.PARTNER)
    const tenantId = await getUserTenantIdByEmail(owner.email)
    await addUserToTenantByEmail({ email: member.email, tenantId })
    await setUserActiveTenantByEmail({ email: member.email, tenantId })

    const memberMembershipId = await (async () => {
        const databaseUrl = getEnvOrThrow("DATABASE_URL")
        const prisma = createE2EPrismaClient(databaseUrl)
        try {
            const userRow = await prisma.user.findUnique({ where: { email: member.email }, select: { id: true } })
            if (!userRow) throw new Error("用户不存在")
            return `tm:${tenantId}:${userRow.id}`
        } finally {
            await prisma.$disconnect()
        }
    })()

    const ownerCtx = await newE2EContext(browser)
    const ownerPage = await ownerCtx.newPage()
    await login(ownerPage, owner)

    await ownerPage.goto("/admin/tenants")
    await expect(ownerPage.getByText("当前租户成员", { exact: true })).toBeVisible({ timeout: 30_000 })

    const toggleButton = ownerPage.getByTestId(`tenant-member-toggle-status:${memberMembershipId}`)
    await expect(toggleButton).toBeVisible({ timeout: 30_000 })
    await toggleButton.click()
    await expect(toggleButton).toHaveText("启用", { timeout: 30_000 })

    // verify DB: membership disabled, and isActive not flipped by "停用"
    const databaseUrl = getEnvOrThrow("DATABASE_URL")
    const prisma = createE2EPrismaClient(databaseUrl)
    try {
        const [membership, userRow] = await Promise.all([
            prisma.tenantMembership.findUnique({
                where: { tenantId_userId: { tenantId, userId: memberMembershipId.split(":").slice(-1)[0] ?? "" } },
                select: { status: true },
            }),
            prisma.user.findUnique({ where: { email: member.email }, select: { isActive: true } }),
        ])
        expect(membership?.status).toBe(TenantMembershipStatus.DISABLED)
        expect(userRow?.isActive).toBe(true)
    } finally {
        await prisma.$disconnect()
    }

    // member cannot login
    const memberCtx = await newE2EContext(browser)
    const memberPage = await memberCtx.newPage()
    await memberPage.goto("/auth/login")
    await memberPage.getByLabel("邮箱").fill(member.email.toUpperCase())
    await memberPage.getByLabel("密码").fill(member.password)
    await memberPage.getByRole("button", { name: "登录" }).click()
    await expect(memberPage).toHaveURL(/\/auth\/login(?:\?|$)/, { timeout: 30_000 })
    await memberCtx.close()

    // ensure login attempt did not self-heal membership back to ACTIVE
    const prisma2 = createE2EPrismaClient(databaseUrl)
    try {
        const userRow = await prisma2.user.findUnique({ where: { email: member.email }, select: { id: true } })
        if (!userRow) throw new Error("用户不存在")
        const membership = await prisma2.tenantMembership.findUnique({
            where: { tenantId_userId: { tenantId, userId: userRow.id } },
            select: { status: true },
        })
        expect(membership?.status).toBe(TenantMembershipStatus.DISABLED)
    } finally {
        await prisma2.$disconnect()
    }

    await ownerCtx.close()
})
