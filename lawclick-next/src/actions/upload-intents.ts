"use server"

import { z } from "zod"
import { QueueStatus, UploadIntentStatus, type Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { TaskType } from "@/lib/queue"
import { QUEUE_TASK_PRIORITY } from "@/lib/queue-policy"
import { AuthError, PermissionError, getActiveTenantContextWithPermissionOrThrow } from "@/lib/server-auth"
import { OptionalNonEmptyString, PositiveInt, UuidSchema } from "@/lib/zod"
import { revalidatePath } from "next/cache"
import { randomUUID } from "node:crypto"
import type { ActionResponse } from "@/lib/action-response"

export type UploadIntentListItem = Prisma.UploadIntentGetPayload<{
    include: {
        createdBy: { select: { id: true; name: true; email: true } }
        case: { select: { id: true; title: true; caseCode: true } }
    }
}>

const GetUploadIntentsInputSchema = z
    .object({
        status: z.nativeEnum(UploadIntentStatus).optional(),
        query: OptionalNonEmptyString(200),
        take: PositiveInt().max(200).optional(),
        cursor: UuidSchema.optional(),
    })
    .strict()
    .optional()

export async function getUploadIntents(input?: {
    status?: UploadIntentStatus
    query?: string
    take?: number
    cursor?: string
}): Promise<
    ActionResponse<
        {
            data: UploadIntentListItem[]
            counts: Partial<Record<UploadIntentStatus, number>>
            nextCursor: string | null
            tenantId: string
        },
        { data: UploadIntentListItem[] }
    >
> {
    const parsed = GetUploadIntentsInputSchema.safeParse(input)
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败", data: [] as UploadIntentListItem[] }
    }
    input = parsed.data

    let tenantId: string
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("admin:settings")
        const rate = await enforceRateLimit({ ctx, action: "uploadIntents.list", limit: 600 })
        if (!rate.allowed) {
            return { success: false, error: rate.error, data: [] as UploadIntentListItem[] }
        }
        tenantId = ctx.tenantId
    } catch (error) {
        if (error instanceof AuthError) {
            return { success: false, error: "未登录", data: [] as UploadIntentListItem[] }
        }
        if (error instanceof PermissionError) {
            return { success: false, error: getPublicActionErrorMessage(error, "权限不足"), data: [] as UploadIntentListItem[] }
        }
        throw error
    }

    const take = Math.max(1, Math.min(200, input?.take ?? 100))

    const query = (input?.query || "").trim()
    const where: Prisma.UploadIntentWhereInput = {
        tenantId,
        ...(input?.status ? { status: input.status } : {}),
        ...(query
            ? {
                  OR: [
                      { filename: { contains: query, mode: "insensitive" } },
                      { key: { contains: query, mode: "insensitive" } },
                      { documentId: { contains: query, mode: "insensitive" } },
                      { case: { title: { contains: query, mode: "insensitive" } } },
                      { case: { caseCode: { contains: query, mode: "insensitive" } } },
                  ],
              }
            : {}),
    }

    try {
        const [intents, grouped] = await Promise.all([
            prisma.uploadIntent.findMany({
                where,
                take,
                ...(input?.cursor ? { skip: 1, cursor: { id: input.cursor } } : {}),
                orderBy: { createdAt: "desc" },
                include: {
                    createdBy: { select: { id: true, name: true, email: true } },
                    case: { select: { id: true, title: true, caseCode: true } },
                },
            }),
            prisma.uploadIntent.groupBy({
                by: ["status"],
                where: { tenantId },
                _count: { _all: true },
            }),
        ])

        const counts: Partial<Record<UploadIntentStatus, number>> = {}
        for (const row of grouped) {
            counts[row.status] = row._count._all
        }

        const nextCursor = intents.length === take ? intents[intents.length - 1]?.id : null
        return { success: true, data: intents, counts, nextCursor, tenantId }
    } catch (error) {
        logger.error("获取上传意图失败", error)
        return { success: false, error: "获取上传意图失败", data: [] as UploadIntentListItem[] }
    }
}

const EnqueueCleanupUploadIntentsSchema = z
    .object({
        take: PositiveInt().max(200).optional(),
        graceMinutes: PositiveInt().max(60 * 24 * 30).optional(),
        dryRun: z.boolean().optional(),
    })
    .strict()
    .optional()

function prismaErrorCode(error: unknown): string | null {
    if (!error || typeof error !== "object") return null
    const code = (error as { code?: unknown }).code
    return typeof code === "string" ? code : null
}

export async function enqueueCleanupUploadIntents(
    input?: { take?: number; graceMinutes?: number; dryRun?: boolean }
): Promise<ActionResponse<{ jobId: string }>> {
    const parsed = EnqueueCleanupUploadIntentsSchema.safeParse(input)
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
    }
    input = parsed.data

    let tenantId: string
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("admin:settings")

        const rate = await enforceRateLimit({ ctx, action: "uploadIntents.cleanup.enqueue", limit: 30 })
        if (!rate.allowed) return { success: false, error: rate.error }

        tenantId = ctx.tenantId
    } catch (error) {
        if (error instanceof AuthError) return { success: false, error: "未登录" }
        if (error instanceof PermissionError) return { success: false, error: getPublicActionErrorMessage(error, "权限不足") }
        throw error
    }

    const take = Math.max(1, Math.min(200, input?.take ?? 100))
    const graceMinutes = Math.max(0, Math.min(60 * 24 * 30, input?.graceMinutes ?? 24 * 60))
    const dryRun = Boolean(input?.dryRun)

    const hourKey = new Date().toISOString().slice(0, 13)
    const baseIdempotencyKey = `cleanup-upload-intents/${tenantId}/${hourKey}`

    try {
        const job = await prisma.taskQueue.create({
            data: {
                tenantId,
                type: TaskType.CLEANUP_UPLOAD_INTENTS,
                idempotencyKey: baseIdempotencyKey,
                payload: { take, graceMinutes, dryRun } satisfies Prisma.InputJsonValue,
                status: QueueStatus.PENDING,
                availableAt: new Date(),
                priority: QUEUE_TASK_PRIORITY[TaskType.CLEANUP_UPLOAD_INTENTS],
                maxAttempts: 3,
            },
            select: { id: true },
        })
        revalidatePath("/admin/ops/uploads")
        return { success: true, jobId: job.id }
    } catch (error) {
        if (prismaErrorCode(error) === "P2002") {
            const existing = await prisma.taskQueue.findFirst({
                where: { tenantId, idempotencyKey: baseIdempotencyKey },
                select: { id: true, status: true, availableAt: true, lockedAt: true },
            })
            if (existing && (existing.status === QueueStatus.PENDING || existing.status === QueueStatus.PROCESSING)) {
                if (existing.status === QueueStatus.PENDING && existing.availableAt.getTime() > Date.now()) {
                    // 允许手动重复触发时“加速”被退避的任务：避免运维入口/测试用例因为 availableAt 在未来而无法立即执行。
                    await prisma.taskQueue.updateMany({
                        where: { id: existing.id, tenantId, status: QueueStatus.PENDING },
                        data: { availableAt: new Date(), lockedAt: null, lockedBy: null },
                    })
                }
                if (existing.status === QueueStatus.PROCESSING) {
                    const lockedAt = existing.lockedAt
                    const staleMs = 2 * 60_000
                    const isStale = !lockedAt || lockedAt.getTime() <= Date.now() - staleMs
                    if (isStale) {
                        await prisma.taskQueue.updateMany({
                            where: { id: existing.id, tenantId, status: QueueStatus.PROCESSING },
                            data: { status: QueueStatus.PENDING, availableAt: new Date(), lockedAt: null, lockedBy: null },
                        })
                    }
                }
                revalidatePath("/admin/ops/uploads")
                return { success: true, jobId: existing.id }
            }

            // 允许重复触发：当窗口内的 job 已结束（COMPLETED/FAILED），再创建一个新 job
            const idempotencyKey = `${baseIdempotencyKey}/${randomUUID()}`
            const fresh = await prisma.taskQueue.create({
                data: {
                    tenantId,
                    type: TaskType.CLEANUP_UPLOAD_INTENTS,
                    idempotencyKey,
                    payload: { take, graceMinutes, dryRun } satisfies Prisma.InputJsonValue,
                    status: QueueStatus.PENDING,
                    availableAt: new Date(),
                    priority: QUEUE_TASK_PRIORITY[TaskType.CLEANUP_UPLOAD_INTENTS],
                    maxAttempts: 3,
                },
                select: { id: true },
            })
            revalidatePath("/admin/ops/uploads")
            return { success: true, jobId: fresh.id }
        }
        logger.error("入队清理任务失败", error)
        return { success: false, error: "入队清理任务失败" }
    }
}
