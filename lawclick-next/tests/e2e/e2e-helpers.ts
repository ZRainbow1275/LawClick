import { expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test"
import { Role, TenantMembershipRole, TenantMembershipStatus, createE2EPrismaClient, type PrismaClient } from "./prisma"
import { hash } from "bcryptjs"
import fs from "node:fs"
import path from "node:path"

export type E2EUser = { name: string; email: string; password: string }

let e2eIpCounter = 0
const e2eIpSalt = Math.floor(Math.random() * 250)
function nextE2EForwardedFor() {
    e2eIpCounter = (e2eIpCounter % 250) + 1
    const octet = ((e2eIpSalt + e2eIpCounter) % 250) + 1
    return `203.0.113.${octet}`
}

export async function newE2EContext(browser: Browser): Promise<BrowserContext> {
    const ip = nextE2EForwardedFor()
    return browser.newContext({
        extraHTTPHeaders: {
            "x-forwarded-for": ip,
            "x-real-ip": ip,
        },
    })
}

export function buildE2EUser(input: { label: string; name: string }): E2EUser {
    const ts = Date.now()
    const rand = Math.random().toString(16).slice(2, 10)
    return {
        name: input.name,
        email: `e2e+${input.label}-${ts}-${rand}@example.com`,
        password: `E2Epass-${ts}-${rand}`,
    }
}

export async function registerUser(page: Page, user: E2EUser) {
    const databaseUrl = getEnvOrThrow("DATABASE_URL")
    const prisma = createE2EPrismaClient(databaseUrl)
    try {
        const email = user.email.trim().toLowerCase()
        const hashedPassword = await hash(user.password, 10)
        const created = await prisma.user.upsert({
            where: { email },
            update: { name: user.name, password: hashedPassword, isActive: true },
            create: { email, name: user.name, password: hashedPassword, isActive: true },
            select: { id: true, tenantId: true, activeTenantId: true },
        })

        const tenantId = (created.activeTenantId || created.tenantId || "default-tenant").trim() || "default-tenant"
        await upsertTenantAndFirmMembership({
            prisma,
            userId: created.id,
            tenantId,
            membershipRole: TenantMembershipRole.MEMBER,
        })
    } finally {
        await prisma.$disconnect()
    }

    await page.goto("/auth/login")
    await expect(page).toHaveURL(/\/auth\/login(?:\?|$)/, { timeout: 30_000 })
} 

export async function login(page: Page, input: { email: string; password: string }) {
    await page.goto("/auth/login")
    await page.getByLabel("邮箱").fill(input.email)
    await page.getByLabel("密码").fill(input.password)
    await page.getByRole("button", { name: "登录" }).click()
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 })
}

export async function selectComboboxOption(input: {
    page: Page
    trigger: Locator
    optionName: string | RegExp
}) {
    const { page, trigger, optionName } = input
    const option = page.getByRole("option", { name: optionName }).first()

    for (let attempt = 0; attempt < 4; attempt++) {
        if (!(await option.isVisible().catch(() => false))) {
            await trigger.click()
        }

        try {
            await option.scrollIntoViewIfNeeded({ timeout: 10_000 })
            await option.click({ timeout: 15_000, force: true })
            return
        } catch (err) {
            if (attempt === 3) throw err
            const openListbox = page.getByRole("listbox").first()
            if (await openListbox.isVisible().catch(() => false)) {
                await page.keyboard.press("Escape").catch(() => undefined)
            }
            await page.waitForTimeout(150)
        }
    }
}

export async function createCaseViaWizard(page: Page, input: { title: string; handlerName: string }) {
    await page.goto("/cases")
    await expect(page.getByRole("heading", { name: "案件管理", level: 1 })).toBeVisible({ timeout: 30_000 })

    await page.getByRole("button", { name: "新建案件" }).click()
    const dialog = page.getByRole("dialog", { name: "新建案件" })
    await expect(dialog).toBeVisible({ timeout: 30_000 })

    await dialog.getByPlaceholder("请输入案件名称，如：张三诉李四民间借贷纠纷").fill(input.title)
    await dialog.getByRole("button", { name: "下一步" }).click()

    await dialog.getByText("新建客户", { exact: true }).click()
    await dialog.getByPlaceholder("公司名称或个人姓名").fill(`E2E客户-${Date.now()}`)
    await dialog.getByRole("button", { name: "下一步" }).click()

    await dialog.getByRole("button", { name: "下一步" }).click()

    const handlerField = dialog.getByText("承办律师 *", { exact: true }).locator("..")
    const handlerTrigger = handlerField.getByRole("combobox").first()
    const handlerOption = page.getByRole("option", { name: input.handlerName }).first()
    for (let attempt = 0; attempt < 4; attempt++) {
        if (!(await handlerOption.isVisible().catch(() => false))) {
            await handlerTrigger.click()
        }

        try {
            await handlerOption.evaluate((el) => el.scrollIntoView({ block: "center" }))
            await handlerOption.click({ timeout: 15_000, force: true })
            await expect(handlerTrigger).toContainText(input.handlerName, { timeout: 10_000 })
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
    await dialog.getByRole("button", { name: "下一步" }).click()

    await dialog.getByRole("button", { name: "创建案件" }).click()
    await expect(dialog.getByText("案件创建成功")).toBeVisible({ timeout: 30_000 })

    await dialog.getByRole("button", { name: "查看案件详情" }).click()

    try {
        await expect(page).toHaveURL(/\/cases\/[^/?#]+(?:\?|$)/, { timeout: 3_000 })
        const caseId = new URL(page.url()).pathname.split("/").pop()
        expect(caseId).toBeTruthy()
        return { caseId: caseId as string }
    } catch {
        const databaseUrl = getEnvOrThrow("DATABASE_URL")
        const prisma = createE2EPrismaClient(databaseUrl)

        try {
            let resolvedCaseId: string | null = null
            for (let attempt = 0; attempt < 10; attempt++) {
                const row = await prisma.case.findFirst({
                    where: { title: input.title, deletedAt: null },
                    orderBy: { createdAt: "desc" },
                    select: { id: true },
                })
                if (row?.id) {
                    resolvedCaseId = row.id
                    break
                }
                await new Promise((resolve) => setTimeout(resolve, 200))
            }

            expect(resolvedCaseId).toBeTruthy()
            const caseId = resolvedCaseId as string

            await page.goto(`/cases/${caseId}`)
            await expect(page).toHaveURL(new RegExp(`/cases/${caseId}(?:\\?|$)`), { timeout: 30_000 })
            return { caseId }
        } finally {
            await prisma.$disconnect()
        }
    }
}

export async function createTaskInCase(page: Page, input: { caseId: string; taskTitle: string; assigneeName: string }) {
    await page.goto(`/cases/${input.caseId}?tab=tasks`)
    await expect(page.getByText("任务看板")).toBeVisible({ timeout: 30_000 })

    const todoColumn = page.getByTestId("task-kanban-column-TODO")
    await expect(todoColumn).toBeVisible({ timeout: 30_000 })
    await expect(todoColumn.locator("svg.animate-spin")).toHaveCount(0, { timeout: 30_000 })

    await page.getByTestId("task-kanban-add-TODO").click()
    const textarea = todoColumn.getByPlaceholder(/输入任务标题/)
    await textarea.fill(input.taskTitle)
    await textarea.press("Enter")

    const card = todoColumn.locator("div.group", { hasText: input.taskTitle }).first()
    await expect(card).toBeVisible({ timeout: 30_000 })

    await card.click()
    const detailDialog = page.getByRole("dialog", { name: "任务详情" })
    await expect(detailDialog).toBeVisible({ timeout: 30_000 })

    const assigneeTrigger = detailDialog.getByRole("combobox", { name: "负责人" })
    await expect(assigneeTrigger).toBeVisible({ timeout: 30_000 })

    const assigneeOption = page.getByRole("option", { name: input.assigneeName }).first()
    for (let attempt = 0; attempt < 4; attempt++) {
        if (!(await assigneeOption.isVisible().catch(() => false))) {
            await assigneeTrigger.click()
        }

        try {
            await assigneeOption.click({ timeout: 15_000, force: true })
            await expect(assigneeTrigger).toContainText(input.assigneeName, { timeout: 10_000 })
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

    const saveButton = detailDialog.getByRole("button", { name: "保存" })
    await saveButton.click()
    await expect(detailDialog).toBeHidden({ timeout: 30_000 })

    await expect(card).toContainText(input.assigneeName, { timeout: 30_000 })
}

export async function createProjectViaDialog(page: Page, input: { title: string }) {
    await page.goto("/projects", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "项目中心" })).toBeVisible({ timeout: 30_000 })

    await page.getByRole("button", { name: "新建项目" }).click()
    const dialog = page.getByRole("dialog", { name: "新建项目（非案件）" })
    await expect(dialog).toBeVisible({ timeout: 30_000 })

    await dialog.getByPlaceholder("例如：官网改版、市场投放、合同模板升级").fill(input.title)
    await dialog.getByRole("button", { name: "创建" }).click()

    // 新版本可能不再跳转详情页：优先从 URL 读取，否则回落到 DB 按 title 查找。
    try {
        await expect(page).toHaveURL(/\/projects\/[^/?#]+(?:\?|$)/, { timeout: 10_000 })
        const projectId = new URL(page.url()).pathname.split("/").pop()
        expect(projectId).toBeTruthy()
        return { projectId: projectId as string }
    } catch {
        const databaseUrl = getEnvOrThrow("DATABASE_URL")
        const prisma = createE2EPrismaClient(databaseUrl)
        try {
            const deadline = Date.now() + 30_000
            while (Date.now() < deadline) {
                const row = await prisma.project.findFirst({
                    where: { title: input.title, deletedAt: null },
                    orderBy: { createdAt: "desc" },
                    select: { id: true },
                })
                if (row?.id) return { projectId: row.id }
                await page.waitForTimeout(500)
            }
            throw new Error("创建项目后未找到项目记录")
        } finally {
            await prisma.$disconnect()
        }
    }
}

export async function createTaskInProjectKanban(page: Page, input: { projectId: string; taskTitle: string }) {
    await page.goto(`/projects/${input.projectId}`)
    const todoColumn = page.getByTestId("task-kanban-column-TODO")
    await expect(todoColumn).toBeVisible({ timeout: 30_000 })
    await expect(todoColumn.locator("svg.animate-spin")).toHaveCount(0, { timeout: 30_000 })

    await page.getByTestId("task-kanban-add-TODO").click()
    const textarea = todoColumn.getByPlaceholder(/输入任务标题/)
    await expect(textarea).toBeVisible({ timeout: 30_000 })
    await textarea.fill(input.taskTitle)
    await textarea.press("Enter")

    const card = todoColumn.locator("div.group", { hasText: input.taskTitle }).first()
    await expect(card).toBeVisible({ timeout: 30_000 })
}

function parseDotEnv(content: string): Record<string, string> {
    const env: Record<string, string> = {}
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith("#")) continue
        const eq = trimmed.indexOf("=")
        if (eq <= 0) continue
        const key = trimmed.slice(0, eq).trim()
        let value = trimmed.slice(eq + 1).trim()
        if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1)
        }
        env[key] = value
    }
    return env
}

let cachedLocalEnv: Record<string, string> | null = null
function readLocalEnv(): Record<string, string> {
    if (cachedLocalEnv) return cachedLocalEnv
    const envPath = path.resolve(__dirname, "../../.env")
    if (fs.existsSync(envPath)) {
        cachedLocalEnv = parseDotEnv(fs.readFileSync(envPath, "utf-8"))
        return cachedLocalEnv
    }
    cachedLocalEnv = {}
    return cachedLocalEnv
}

export function getEnvOrThrow(key: string): string {
    const direct = (process.env[key] || "").trim()
    if (direct) return direct
    const local = (readLocalEnv()[key] || "").trim()
    if (local) return local
    throw new Error(`Missing env: ${key}`)
}

async function upsertTenantAndFirmMembership(input: {
    prisma: PrismaClient
    userId: string
    tenantId: string
    membershipRole: TenantMembershipRole
}) {
    await input.prisma.tenantMembership.upsert({
        where: { tenantId_userId: { tenantId: input.tenantId, userId: input.userId } },
        update: { role: input.membershipRole, status: TenantMembershipStatus.ACTIVE },
        create: {
            id: `tm:${input.tenantId}:${input.userId}`,
            tenantId: input.tenantId,
            userId: input.userId,
            role: input.membershipRole,
            status: TenantMembershipStatus.ACTIVE,
        },
    })

    const tenant = await input.prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { firmId: true } })
    if (!tenant?.firmId) return

    await input.prisma.firmMembership.upsert({
        where: { firmId_userId: { firmId: tenant.firmId, userId: input.userId } },
        update: { role: input.membershipRole, status: TenantMembershipStatus.ACTIVE },
        create: {
            id: `fm:${tenant.firmId}:${input.userId}`,
            firmId: tenant.firmId,
            userId: input.userId,
            role: input.membershipRole,
            status: TenantMembershipStatus.ACTIVE,
        },
    })
}

export async function setUserRoleByEmail(email: string, role: Role) {
    const databaseUrl = getEnvOrThrow("DATABASE_URL")
    const prisma = createE2EPrismaClient(databaseUrl)
    try {
        const user = await prisma.user.update({
            where: { email },
            data: { role },
            select: { id: true, activeTenantId: true, tenantId: true },
        })

        const tenantId = (user.activeTenantId || user.tenantId || "default-tenant").trim() || "default-tenant"
        const membershipRole =
            role === "PARTNER"
                ? TenantMembershipRole.OWNER
                : role === "ADMIN"
                  ? TenantMembershipRole.ADMIN
                  : role === "CLIENT"
                    ? TenantMembershipRole.VIEWER
                    : TenantMembershipRole.MEMBER

        await upsertTenantAndFirmMembership({ prisma, userId: user.id, tenantId, membershipRole })
    } finally {
        await prisma.$disconnect()
    }
}

export async function getUserTenantIdByEmail(email: string): Promise<string> {
    const databaseUrl = getEnvOrThrow("DATABASE_URL")
    const prisma = createE2EPrismaClient(databaseUrl)
    try {
        const user = await prisma.user.findUnique({
            where: { email },
            select: { activeTenantId: true, tenantId: true },
        })
        if (!user) throw new Error("用户不存在")
        return (user.activeTenantId || user.tenantId || "default-tenant").trim() || "default-tenant"
    } finally {
        await prisma.$disconnect()
    }
}

export async function setUserActiveTenantByEmail(input: { email: string; tenantId: string }) {
    const databaseUrl = getEnvOrThrow("DATABASE_URL")
    const prisma = createE2EPrismaClient(databaseUrl)
    try {
        const user = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })
        if (!user) throw new Error("用户不存在")

        const membership = await prisma.tenantMembership.findUnique({
            where: { tenantId_userId: { tenantId: input.tenantId, userId: user.id } },
            select: { status: true },
        })
        if (!membership || membership.status !== TenantMembershipStatus.ACTIVE) {
            throw new Error("目标租户成员关系不存在或未激活")
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { activeTenantId: input.tenantId },
        })
    } finally {
        await prisma.$disconnect()
    }
}

export async function addUserToTenantByEmail(input: {
    email: string
    tenantId: string
    membershipRole?: TenantMembershipRole
}) {
    const databaseUrl = getEnvOrThrow("DATABASE_URL")
    const prisma = createE2EPrismaClient(databaseUrl)
    try {
        const user = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })
        if (!user) throw new Error("用户不存在")
        await upsertTenantAndFirmMembership({
            prisma,
            userId: user.id,
            tenantId: input.tenantId,
            membershipRole: input.membershipRole ?? TenantMembershipRole.MEMBER,
        })
    } finally {
        await prisma.$disconnect()
    }
}

export async function setTenantMembershipRoleByEmail(email: string, membershipRole: TenantMembershipRole) {
    const databaseUrl = getEnvOrThrow("DATABASE_URL")
    const prisma = createE2EPrismaClient(databaseUrl)
    try {
        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, activeTenantId: true, tenantId: true },
        })
        if (!user) {
            throw new Error("用户不存在")
        }

        const tenantId = (user.activeTenantId || user.tenantId || "default-tenant").trim() || "default-tenant"
        await upsertTenantAndFirmMembership({ prisma, userId: user.id, tenantId, membershipRole })
    } finally {
        await prisma.$disconnect()
    }
}

export async function createDocumentRecordForCase(input: { caseId: string; title: string; uploaderEmail: string }) {
    const databaseUrl = getEnvOrThrow("DATABASE_URL")
    const prisma = createE2EPrismaClient(databaseUrl)
    try {
        const uploader = await prisma.user.findUnique({ where: { email: input.uploaderEmail }, select: { id: true } })
        if (!uploader) throw new Error("上传人不存在")

        const doc = await prisma.document.create({
            data: {
                title: input.title,
                caseId: input.caseId,
                uploaderId: uploader.id,
                tags: [],
            },
            select: { id: true },
        })

        return { documentId: doc.id }
    } finally {
        await prisma.$disconnect()
    }
}
