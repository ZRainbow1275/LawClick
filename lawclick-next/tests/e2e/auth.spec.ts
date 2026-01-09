import { test, expect } from "@playwright/test"
import { createE2EPrismaClient } from "./prisma"

import { buildE2EUser, getEnvOrThrow, newE2EContext, registerUser } from "./e2e-helpers"

test("has title", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveTitle(/LawClick/)
})

test("root redirects to login page", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveURL(/.*\/auth\/login/)
})

test("注册：生产环境关闭开放注册（LC-AUDIT-002）", async ({ page }) => {
    const ts = Date.now()
    await page.goto("/auth/register")
    await expect(page).toHaveURL(/\/auth\/register(?:\?|$)/, { timeout: 30_000 })

    await page.locator('input[name="name"]').fill(`E2E注册-${ts}`)
    await page.locator('input[name="email"]').fill(`e2e+register-block-${ts}@example.com`)
    await page.locator('input[name="password"]').fill(`E2Epass-${ts}`)
    await page.getByRole("button", { name: "立即注册" }).click()

    await expect(page.getByText("生产环境已关闭开放注册，请联系管理员加入")).toBeVisible({ timeout: 30_000 })
})

test("登录：password=null 不可登录且不写回密码（LC-AUDIT-003）", async ({ browser }) => {
    test.setTimeout(120_000)

    const ts = Date.now()
    const user = buildE2EUser({ label: "password-null", name: `E2E密码空-${ts}` })

    const bootstrap = await newE2EContext(browser)
    const bootstrapPage = await bootstrap.newPage()
    await registerUser(bootstrapPage, user)
    await bootstrap.close()

    const databaseUrl = getEnvOrThrow("DATABASE_URL")
    const prisma = createE2EPrismaClient(databaseUrl)
    try {
        await prisma.user.update({ where: { email: user.email }, data: { password: null } })
    } finally {
        await prisma.$disconnect()
    }

    const ctx = await newE2EContext(browser)
    const page = await ctx.newPage()
    await page.goto("/auth/login")
    await page.getByLabel("邮箱").fill(user.email)
    await page.getByLabel("密码").fill(`any-${Date.now()}`)
    await page.getByRole("button", { name: "登录" }).click()
    await expect(page).toHaveURL(/\/auth\/login(?:\?|$)/, { timeout: 30_000 })
    await ctx.close()

    const prisma2 = createE2EPrismaClient(databaseUrl)
    try {
        const row = await prisma2.user.findUnique({ where: { email: user.email }, select: { password: true } })
        expect(row?.password).toBeNull()
    } finally {
        await prisma2.$disconnect()
    }
})

test("登录：email 大小写归一化一致（LC-AUDIT-008）", async ({ browser }) => {
    test.setTimeout(120_000)

    const ts = Date.now()
    const user = buildE2EUser({ label: "email-normalize", name: `E2E邮箱归一化-${ts}` })
    const dirtyEmail = user.email.toUpperCase()

    const bootstrap = await newE2EContext(browser)
    const bootstrapPage = await bootstrap.newPage()
    await registerUser(bootstrapPage, user)
    await bootstrap.close()

    const databaseUrl = getEnvOrThrow("DATABASE_URL")
    const prisma = createE2EPrismaClient(databaseUrl)
    try {
        await prisma.user.update({ where: { email: user.email }, data: { email: dirtyEmail } })
    } finally {
        await prisma.$disconnect()
    }

    const ctx = await newE2EContext(browser)
    const page = await ctx.newPage()
    await page.goto("/auth/login")
    await page.getByLabel("邮箱").fill(user.email)
    await page.getByLabel("密码").fill(user.password)
    await page.getByRole("button", { name: "登录" }).click()
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 })
    await ctx.close()

    const prisma2 = createE2EPrismaClient(databaseUrl)
    try {
        const [normalized, dirty] = await Promise.all([
            prisma2.user.findUnique({ where: { email: user.email }, select: { email: true } }),
            prisma2.user.findUnique({ where: { email: dirtyEmail }, select: { email: true } }),
        ])
        expect(normalized?.email).toBe(user.email)
        expect(dirty).toBeNull()
    } finally {
        await prisma2.$disconnect()
    }
})
