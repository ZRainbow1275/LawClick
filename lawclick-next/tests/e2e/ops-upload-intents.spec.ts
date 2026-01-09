import { test, expect } from "@playwright/test"
import { CreateBucketCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { QueueStatus, UploadIntentStatus, createE2EPrismaClient } from "./prisma"
import { randomUUID } from "node:crypto"

import {
    addUserToTenantByEmail,
    buildE2EUser,
    createCaseViaWizard,
    getEnvOrThrow,
    getUserTenantIdByEmail,
    login,
    newE2EContext,
    registerUser,
    selectComboboxOption,
    setUserRoleByEmail,
} from "./e2e-helpers"

function createS3Client() {
    const endpoint = getEnvOrThrow("S3_ENDPOINT")
    const accessKeyId = getEnvOrThrow("S3_ACCESS_KEY")
    const secretAccessKey = getEnvOrThrow("S3_SECRET_KEY")
    return new S3Client({
        region: "us-east-1",
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true,
    })
}

async function ensureBucket(client: S3Client, bucket: string) {
    try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }))
    } catch {
        await client.send(new CreateBucketCommand({ Bucket: bucket }))
    }
}

test("后台运维：UploadIntent 审计可见 + 过期孤儿对象可回收", async ({ browser, page }) => {
    test.setTimeout(180_000)

    const operator = buildE2EUser({ label: "ops-partner", name: `E2E运维-${Date.now()}` })
    const handler = buildE2EUser({ label: "ops-handler", name: `E2E承办-${Date.now()}` })

    const bootstrapContext = await newE2EContext(browser)
    const bootstrapPage = await bootstrapContext.newPage()
    await registerUser(bootstrapPage, operator)
    await registerUser(bootstrapPage, handler)
    await bootstrapContext.close()

    await setUserRoleByEmail(operator.email, "PARTNER")
    const operatorTenantId = await getUserTenantIdByEmail(operator.email)
    await addUserToTenantByEmail({ email: handler.email, tenantId: operatorTenantId })

    await login(page, operator)

    const caseTitle = `E2E案件-上传审计-${Date.now()}`
    const { caseId } = await createCaseViaWizard(page, { title: caseTitle, handlerName: handler.name })

    // 1) UI 上传文档（无论 presigned 成功或 fallback，均应写入 UploadIntent 并 FINALIZED）
    const uploadedFileName = `e2e-upload-${Date.now()}.txt`
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
        name: uploadedFileName,
        mimeType: "text/plain",
        buffer: Buffer.from(`hello-${Date.now()}`),
    })
    await uploadDialog.locator("input#title").fill(`E2E文档-${Date.now()}`)

    const caseField = uploadDialog.getByText("关联案件", { exact: true }).locator("..")
    const caseTrigger = caseField.locator('[data-slot="select-trigger"]').first()
    await selectComboboxOption({ page, trigger: caseTrigger, optionName: caseTitle })

    await uploadDialog.getByRole("button", { name: "确认上传" }).click()
    await expect(page.getByText("文档上传成功")).toBeVisible({ timeout: 60_000 })

    await page.goto(`/admin/ops/uploads?q=${encodeURIComponent(uploadedFileName)}`)
    const uploadedRow = page.locator("tr", { hasText: uploadedFileName }).first()
    await expect(uploadedRow).toBeVisible({ timeout: 30_000 })
    await expect(uploadedRow.getByText("已落库")).toBeVisible({ timeout: 30_000 })

    // 2) 构造一个“过期未 finalize + 对象存在”的孤儿意图，验证队列清理会删除对象并标记 CLEANED
    const databaseUrl = getEnvOrThrow("DATABASE_URL")
    const prisma = createE2EPrismaClient(databaseUrl)
    const client = createS3Client()
    const bucket = getEnvOrThrow("S3_BUCKET_NAME")
    await ensureBucket(client, bucket)

    const caseRow = await prisma.case.findUnique({ where: { id: caseId }, select: { tenantId: true } })
    expect(caseRow?.tenantId).toBeTruthy()
    const tenantId = caseRow!.tenantId

    const orphanDocId = randomUUID()
    const orphanFileName = `e2e-orphan-${Date.now()}.txt`
    const orphanKey = `cases/${caseId}/documents/${orphanDocId}/v1/${new Date().toISOString().replace(/[:.]/g, "-")}-${orphanFileName}`
    const orphanBody = Buffer.from(`orphan-${Date.now()}`)

    try {
        await client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: orphanKey,
                Body: orphanBody,
                ContentType: "text/plain",
            })
        )

        // sanity: 对象必须存在
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: orphanKey }))

        await prisma.uploadIntent.create({
            data: {
                tenantId,
                kind: "DOCUMENT",
                caseId,
                documentId: orphanDocId,
                key: orphanKey,
                filename: orphanFileName,
                contentType: "text/plain",
                expectedFileSize: orphanBody.length,
                expectedVersion: 1,
                status: UploadIntentStatus.INITIATED,
                expiresAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
                result: { test: true },
            },
        })

        await page.goto(`/admin/ops/uploads?q=${encodeURIComponent(orphanFileName)}`)
        await expect(page.getByText(orphanFileName, { exact: true })).toBeVisible({ timeout: 30_000 })
        await expect(page.getByTestId("upload-intents-hydrated")).toHaveAttribute("data-hydrated", "1", { timeout: 30_000 })
        const orphanRow = page.locator("tr", { hasText: orphanFileName }).first()
        await expect(orphanRow.getByText("已初始化")).toBeVisible({ timeout: 30_000 })

        // 先入队（确保队列任务已落库），再执行队列，避免“执行在入队之前”的竞态
        await page.getByRole("button", { name: "入队清理任务" }).click()

        let cleanupJobId: string | null = null
        for (let i = 0; i < 20; i += 1) {
            const job = await prisma.taskQueue.findFirst({
                where: {
                    tenantId,
                    type: "CLEANUP_UPLOAD_INTENTS",
                    status: { in: [QueueStatus.PENDING, QueueStatus.PROCESSING] },
                },
                orderBy: { createdAt: "desc" },
                select: { id: true },
            })
            if (job?.id) {
                cleanupJobId = job.id
                break
            }
            await page.waitForTimeout(500)
        }
        expect(cleanupJobId).toBeTruthy()

        const queueResponsePromise = page.waitForResponse((res) => {
            if (res.request().method() !== "POST") return false
            return res.url().includes("/api/queue/process")
        })
        await page.getByRole("button", { name: "立即执行队列" }).click()
        const queueResponse = await queueResponsePromise
        expect(queueResponse.ok()).toBeTruthy()

        // 等待该清理任务完成（优先从 DB 确认，避免纯靠 UI 刷新导致的脆弱性）
        let cleanupCompleted = false
        for (let i = 0; i < 30; i += 1) {
            const job = await prisma.taskQueue.findUnique({
                where: { id: cleanupJobId! },
                select: { status: true, lastError: true },
            })
            if (job?.status === QueueStatus.COMPLETED) {
                cleanupCompleted = true
                break
            }
            if (job?.status === QueueStatus.FAILED) {
                throw new Error(job.lastError || "清理任务执行失败")
            }
            await page.waitForTimeout(1000)
        }
        expect(cleanupCompleted).toBeTruthy()

        // 等待清理生效（轮询刷新直到变为“已回收”）
        let cleanedOk = false
        for (let i = 0; i < 10; i += 1) {
            await page.reload()
            await expect(page.getByText(orphanFileName, { exact: true })).toBeVisible({ timeout: 30_000 })
            const orphanRowAfter = page.locator("tr", { hasText: orphanFileName }).first()
            if (await orphanRowAfter.getByText("已回收").isVisible().catch(() => false)) {
                cleanedOk = true
                break
            }
            await page.waitForTimeout(3000)
        }
        expect(cleanedOk).toBeTruthy()

        // 对象应被删除
        let stillExists = true
        try {
            await client.send(new HeadObjectCommand({ Bucket: bucket, Key: orphanKey }))
        } catch {
            stillExists = false
        }
        expect(stillExists).toBeFalsy()
    } finally {
        await prisma.$disconnect()
    }
})

test("队列入口：secret 模式必须通过 IP allowlist 第二道防线", async ({ page }) => {
    const secret = (process.env.QUEUE_PROCESS_SECRET || "e2e-queue-secret").trim()
    expect(secret).toBeTruthy()

    const allowedIp = "203.0.113.10"
    const blockedIp = "8.8.8.8"

    const allowed = await page.request.post("/api/queue/process?max=1", {
        headers: {
            "x-lawclick-queue-secret": secret,
            "x-forwarded-for": allowedIp,
            "x-real-ip": allowedIp,
        },
    })
    expect(allowed.status()).toBe(400)
    expect(await allowed.json()).toMatchObject({ error: expect.stringContaining("tenantId") })

    const blocked = await page.request.post("/api/queue/process?max=1", {
        headers: {
            "x-lawclick-queue-secret": secret,
            "x-forwarded-for": blockedIp,
            "x-real-ip": blockedIp,
        },
    })
    expect(blocked.status()).toBe(403)
    expect(await blocked.json()).toMatchObject({ error: expect.stringContaining("未授权") })
})

test("工具箱：Webhook 配置在创建阶段前置校验（allowlist/SSRF）", async ({ browser }) => {
    test.setTimeout(90_000)

    const operator = buildE2EUser({ label: "tools-partner", name: `E2E工具管理员-${Date.now()}` })

    const bootstrapContext = await newE2EContext(browser)
    const bootstrapPage = await bootstrapContext.newPage()
    await registerUser(bootstrapPage, operator)
    await bootstrapContext.close()

    await setUserRoleByEmail(operator.email, "PARTNER")

    const ctx = await newE2EContext(browser)
    const page = await ctx.newPage()
    await login(page, operator)

    await page.goto("/tools")
    await expect(page.getByRole("heading", { name: "工具箱" })).toBeVisible({ timeout: 30_000 })

    await page.getByRole("tab", { name: /管理/ }).click()
    await page.getByRole("button", { name: /新建模块/ }).click()

    const dialog = page.getByRole("dialog", { name: "新建工具模块" })
    await expect(dialog).toBeVisible({ timeout: 30_000 })

    const nameField = dialog.getByText("名称", { exact: true }).locator("..")
    await nameField.getByRole("textbox").fill(`E2E模块-${Date.now()}`)

    const webhookField = dialog.getByText(/Webhook URL/).locator("..")
    await webhookField.getByRole("textbox").fill("https://localhost/hook")

    await dialog.getByRole("button", { name: /确认创建/ }).click()
    await expect(page.getByText("创建失败")).toBeVisible({ timeout: 30_000 })

    await ctx.close()
})
