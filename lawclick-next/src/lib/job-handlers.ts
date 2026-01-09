/**
 * 任务队列处理器注册表
 * 
 * 每个任务类型对应一个处理函数
 */

import { getEmailProviderDiagnostics, sendNotificationEmail } from "@/lib/email"
import { UploadIntentStatus, type Prisma } from "@prisma/client"
import { z } from "zod"
import { JsonValueSchema } from "@/lib/zod"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { getStorageProvider } from "@/lib/s3"
import { buildUploadKeyPrefix } from "@/lib/document-upload-keys"
import { TaskType } from "@/lib/queue"
import { beginEmailDeliveryAttempt, markEmailDeliveryFailed, markEmailDeliverySent } from "@/lib/email-delivery"
import { ensureWebhookUrlSafe } from "@/lib/webhook-safety"
import { toPrismaJson } from "@/lib/prisma-json"
import { runQueueHealthCheck } from "@/lib/ops/queue-health-check"
import { runKanbanHealthCheck } from "@/lib/ops/kanban-health-check"

export type JobContext = { jobId: string; tenantId: string; idempotencyKey: string | null; attempts: number; maxAttempts: number }

// 处理器类型定义
type JobHandler = (payload: Prisma.JsonValue, context: JobContext) => Promise<Prisma.JsonValue | void>

const SendEmailPayloadSchema = z.object({
    to: z.string().email(),
    subject: z.string().min(1),
    content: z.string().optional(),
    actionUrl: z.string().optional(),
})

const AuditLogPayloadSchema = z.object({
    userId: z.string().uuid(),
    action: z.string().min(1),
    resource: z.string().min(1),
    metadata: z.record(z.string(), JsonValueSchema).optional(),
})

const CleanupUploadIntentsPayloadSchema = z
    .object({
        take: z.number().int().min(1).max(200).optional(),
        graceMinutes: z.number().int().min(0).max(60 * 24 * 30).optional(), // up to 30d
        dryRun: z.boolean().optional(),
    })
    .strict()

const TriggerToolWebhookPayloadSchema = z
    .object({
        invocationId: z.string().uuid(),
    })
    .strict()

const QueueHealthCheckPayloadSchema = z.object({}).strict()
const KanbanHealthCheckPayloadSchema = z.object({}).strict()

// 处理器注册表
const handlers: Record<string, JobHandler> = {
    // 发送邮件任务
    [TaskType.SEND_EMAIL]: async (payload, context) => {
        const parsed = SendEmailPayloadSchema.safeParse(payload)
        if (!parsed.success) {
            throw new Error(`SEND_EMAIL payload 校验失败：${parsed.error.message}`)
        }

        const idempotencyKey = (context.idempotencyKey || "").trim()
        if (!idempotencyKey) {
            throw new Error("SEND_EMAIL 缺少幂等键（拒绝执行）")
        }

        const emailPayload = {
            to: parsed.data.to,
            subject: parsed.data.subject,
            content: parsed.data.content || "",
            actionUrl: parsed.data.actionUrl,
        }

        const providerDiag = getEmailProviderDiagnostics()
        const provider = providerDiag.provider === "unconfigured" ? "unconfigured" : "resend"

        const deliveryAttempt = await beginEmailDeliveryAttempt({
            tenantId: context.tenantId,
            idempotencyKey,
            payload: emailPayload,
            provider,
        })

        if (deliveryAttempt.outcome === "ALREADY_SENT") {
            return {
                skipped: true,
                reason: "ALREADY_SENT",
                deliveryId: deliveryAttempt.deliveryId,
                messageId: deliveryAttempt.messageId,
            } satisfies Prisma.JsonValue
        }

        const result = await sendNotificationEmail(parsed.data.to, parsed.data.subject, parsed.data.content || "", parsed.data.actionUrl, {
            idempotencyKey,
        })

        if (!result.success) {
            const message =
                providerDiag.provider === "unconfigured"
                    ? `邮件服务未配置：${providerDiag.reason}`
                    : result.error || "SEND_EMAIL 执行失败"

            try {
                await markEmailDeliveryFailed({ tenantId: context.tenantId, deliveryId: deliveryAttempt.deliveryId, error: message })
            } catch (error) {
                logger.error("[SEND_EMAIL] 标记 EmailDelivery FAILED 失败", error, { deliveryId: deliveryAttempt.deliveryId })
            }

            throw new Error(message)
        }

        await markEmailDeliverySent({ tenantId: context.tenantId, deliveryId: deliveryAttempt.deliveryId, messageId: result.messageId || null })

        return {
            deliveryId: deliveryAttempt.deliveryId,
            messageId: result.messageId || null,
        } satisfies Prisma.JsonValue
    },

    // 审计日志任务
    [TaskType.AUDIT_LOG]: async (payload, context) => {
        void context
        const parsed = AuditLogPayloadSchema.safeParse(payload)
        if (!parsed.success) {
            throw new Error(`AUDIT_LOG payload 校验失败：${parsed.error.message}`)
        }
        logger.info("[AUDIT_LOG] 审计任务触发", {
            userId: parsed.data.userId,
            action: parsed.data.action,
            resource: parsed.data.resource,
        })
        // 审计日志直接落库（同步写入），此处为异步备份/外发场景预留
    },

    [TaskType.TRIGGER_TOOL_WEBHOOK]: async (payload, context) => {
        const parsed = TriggerToolWebhookPayloadSchema.safeParse(payload)
        if (!parsed.success) {
            throw new Error(`TRIGGER_TOOL_WEBHOOK payload 校验失败：${parsed.error.message}`)
        }

        const invocation = await prisma.toolInvocation.findFirst({
            where: { id: parsed.data.invocationId, tenantId: context.tenantId },
            select: { id: true, status: true, payload: true, toolModuleId: true },
        })
        if (!invocation) {
            return { skipped: true, reason: "INVOCATION_NOT_FOUND" } satisfies Prisma.JsonValue
        }

        if (invocation.status === "SUCCESS" || invocation.status === "ERROR") {
            return { skipped: true, reason: "ALREADY_FINAL", status: invocation.status } satisfies Prisma.JsonValue
        }

        const toolModule = await prisma.toolModule.findFirst({
            where: { id: invocation.toolModuleId, tenantId: context.tenantId },
            select: { id: true, name: true, isActive: true, webhookUrl: true },
        })

        if (!toolModule || !toolModule.isActive) {
            await prisma.toolInvocation.updateMany({
                where: { id: invocation.id, tenantId: context.tenantId },
                data: { status: "ERROR", error: "模块不存在或已停用" },
            })
            return { ok: false, error: "模块不存在或已停用" } satisfies Prisma.JsonValue
        }

        if (!toolModule.webhookUrl) {
            await prisma.toolInvocation.updateMany({
                where: { id: invocation.id, tenantId: context.tenantId },
                data: { status: "ERROR", error: "该模块未配置 Webhook" },
            })
            return { ok: false, error: "该模块未配置 Webhook" } satisfies Prisma.JsonValue
        }

        const safe = await ensureWebhookUrlSafe(toolModule.webhookUrl)
        if (safe.ok === false) {
            await prisma.toolInvocation.updateMany({
                where: { id: invocation.id, tenantId: context.tenantId },
                data: { status: "ERROR", error: safe.error },
            })
            return { ok: false, error: safe.error } satisfies Prisma.JsonValue
        }

        const willRetry = context.attempts < context.maxAttempts

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15_000)

        try {
            const response = await fetch(safe.url.toString(), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(invocation.payload ?? {}),
                redirect: "manual",
                signal: controller.signal,
            })

            const contentType = response.headers.get("content-type") || ""
            const body = contentType.includes("application/json")
                ? await response.json().catch(() => undefined)
                : await response.text().catch(() => undefined)
            const bodyJson = toPrismaJson(body)

            if (response.ok) {
                await prisma.toolInvocation.updateMany({
                    where: { id: invocation.id, tenantId: context.tenantId },
                    data: { status: "SUCCESS", response: bodyJson, error: null },
                })
                return { ok: true, httpStatus: response.status } satisfies Prisma.JsonValue
            }

            const message = `Webhook 返回 ${response.status}`
            const isRetryable = response.status >= 500 && response.status < 600
            const status = isRetryable && willRetry ? "PENDING" : "ERROR"

            await prisma.toolInvocation.updateMany({
                where: { id: invocation.id, tenantId: context.tenantId },
                data: { status, response: bodyJson, error: message },
            })

            if (isRetryable) {
                throw new Error(message)
            }

            return { ok: false, httpStatus: response.status, error: message } satisfies Prisma.JsonValue
        } catch (error: unknown) {
            const message = (() => {
                if (error instanceof Error) {
                    if (error.name === "AbortError") return "Webhook 调用超时"
                    return error.message || "Webhook 调用失败"
                }
                return "Webhook 调用失败"
            })()

            await prisma.toolInvocation.updateMany({
                where: { id: invocation.id, tenantId: context.tenantId },
                data: { status: willRetry ? "PENDING" : "ERROR", error: message },
            })

            throw new Error(message)
        } finally {
            clearTimeout(timeout)
        }
    },

    [TaskType.QUEUE_HEALTH_CHECK]: async (payload, context) => {
        const parsed = QueueHealthCheckPayloadSchema.safeParse(payload)
        if (!parsed.success) {
            throw new Error(`QUEUE_HEALTH_CHECK payload 校验失败：${parsed.error.message}`)
        }
        void parsed

        const result = await runQueueHealthCheck({ tenantId: context.tenantId })
        return result satisfies Prisma.JsonValue
    },

    [TaskType.KANBAN_HEALTH_CHECK]: async (payload, context) => {
        const parsed = KanbanHealthCheckPayloadSchema.safeParse(payload)
        if (!parsed.success) {
            throw new Error(`KANBAN_HEALTH_CHECK payload 校验失败：${parsed.error.message}`)
        }
        void parsed

        const result = await runKanbanHealthCheck({ tenantId: context.tenantId })
        return result satisfies Prisma.JsonValue
    },

    // 上传意图清理：回收未 finalize 的孤儿对象（通过队列运行，便于运维触发与审计）
    [TaskType.CLEANUP_UPLOAD_INTENTS]: async (payload, context) => {
        const parsed = CleanupUploadIntentsPayloadSchema.safeParse(payload)
        if (!parsed.success) {
            throw new Error(`CLEANUP_UPLOAD_INTENTS payload 校验失败：${parsed.error.message}`)
        }

        const take = parsed.data.take ?? 100
        const graceMinutes = parsed.data.graceMinutes ?? 24 * 60
        const dryRun = parsed.data.dryRun ?? false

        const cutoff = new Date(Date.now() - graceMinutes * 60 * 1000)

        const intents = await prisma.uploadIntent.findMany({
            where: {
                tenantId: context.tenantId,
                status: { in: [UploadIntentStatus.INITIATED, UploadIntentStatus.FAILED] },
                expiresAt: { lt: cutoff },
            },
            orderBy: { expiresAt: "asc" },
            take,
            select: {
                id: true,
                caseId: true,
                documentId: true,
                expectedVersion: true,
                key: true,
                status: true,
                expiresAt: true,
            },
        })

        if (intents.length === 0) return

        const storage = getStorageProvider()
        let finalizedRecovered = 0
        let cleaned = 0
        let expired = 0
        let failed = 0
        let deletedBytes = 0

        for (const intent of intents) {
            const now = new Date()
            const prefix = buildUploadKeyPrefix({
                caseId: intent.caseId,
                documentId: intent.documentId,
                expectedVersion: intent.expectedVersion,
            })

            if (!intent.key.startsWith(prefix)) {
                failed += 1
                await prisma.uploadIntent.updateMany({
                    where: { id: intent.id, tenantId: context.tenantId },
                    data: {
                        status: UploadIntentStatus.FAILED,
                        lastError: "清理拒绝：key 前缀不匹配（疑似篡改/越权）",
                        result: {
                            error: "KEY_PREFIX_MISMATCH",
                            key: intent.key,
                            expectedPrefix: prefix,
                            checkedAt: now.toISOString(),
                        },
                    },
                })
                continue
            }

            // 若已被文档版本引用（或 finalize 已完成但意图未更新），则补偿标记为 FINALIZED
            const versionRow = await prisma.documentVersion.findFirst({
                where: {
                    documentId: intent.documentId,
                    version: intent.expectedVersion,
                    document: { caseId: intent.caseId, case: { tenantId: context.tenantId } },
                },
                select: { id: true, fileKey: true },
            })
            if (versionRow?.fileKey === intent.key) {
                finalizedRecovered += 1
                await prisma.uploadIntent.updateMany({
                    where: { id: intent.id, tenantId: context.tenantId },
                    data: {
                        status: UploadIntentStatus.FINALIZED,
                        finalizedAt: now,
                        documentVersionId: versionRow.id,
                        lastError: null,
                        cleanedAt: null,
                        result: {
                            recovered: true,
                            documentVersionId: versionRow.id,
                            checkedAt: now.toISOString(),
                        },
                    },
                })
                continue
            }

            const docRow = await prisma.document.findFirst({
                where: { id: intent.documentId, caseId: intent.caseId, case: { tenantId: context.tenantId } },
                select: { id: true, caseId: true, version: true, fileUrl: true },
            })
            if (docRow?.fileUrl === intent.key && docRow.version === intent.expectedVersion) {
                finalizedRecovered += 1
                await prisma.uploadIntent.updateMany({
                    where: { id: intent.id, tenantId: context.tenantId },
                    data: {
                        status: UploadIntentStatus.FINALIZED,
                        finalizedAt: now,
                        lastError: null,
                        cleanedAt: null,
                        result: {
                            recovered: true,
                            checkedAt: now.toISOString(),
                            note: "document 指针已指向该 key（补偿 FINALIZED）",
                        },
                    },
                })
                continue
            }

            const head = await storage.headObject(intent.key)
            if (!head) {
                expired += 1
                await prisma.uploadIntent.updateMany({
                    where: { id: intent.id, tenantId: context.tenantId },
                    data: {
                        status: UploadIntentStatus.EXPIRED,
                        cleanedAt: now,
                        lastError: null,
                        result: {
                            expired: true,
                            checkedAt: now.toISOString(),
                            note: "对象不存在（无需删除）",
                        },
                    },
                })
                continue
            }

            if (dryRun) {
                await prisma.uploadIntent.updateMany({
                    where: { id: intent.id, tenantId: context.tenantId },
                    data: {
                        lastError: null,
                        result: {
                            dryRun: true,
                            wouldDelete: true,
                            contentLength: head.contentLength,
                            contentType: head.contentType || null,
                            checkedAt: now.toISOString(),
                        },
                    },
                })
                continue
            }

            await storage.deleteObject(intent.key)
            cleaned += 1
            deletedBytes += head.contentLength

            await prisma.uploadIntent.updateMany({
                where: { id: intent.id, tenantId: context.tenantId },
                data: {
                    status: UploadIntentStatus.CLEANED,
                    cleanedAt: now,
                    lastError: null,
                    result: {
                        deleted: true,
                        deletedBytes: head.contentLength,
                        contentType: head.contentType || null,
                        checkedAt: now.toISOString(),
                    },
                },
            })
        }

        logger.info("[CLEANUP_UPLOAD_INTENTS] 执行完成", {
            tenantId: context.tenantId,
            take,
            cutoff: cutoff.toISOString(),
            dryRun,
            recovered: finalizedRecovered,
            cleaned,
            expired,
            failed,
            deletedBytes,
        })

        return {
            take,
            cutoff: cutoff.toISOString(),
            dryRun,
            recovered: finalizedRecovered,
            cleaned,
            expired,
            failed,
            deletedBytes,
        } satisfies Prisma.JsonValue
    },
}

/**
 * 获取任务处理器
 */
export function getJobHandler(type: string): JobHandler {
    const handler = handlers[type]
    if (!handler) {
        throw new Error(`未知任务类型: ${type}`)
    }
    return handler
}

/**
 * 注册自定义处理器（扩展用）
 */
export function registerJobHandler(type: string, handler: JobHandler) {
    handlers[type] = handler
}
