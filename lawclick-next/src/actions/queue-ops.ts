"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { QueueStatus, type Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { AuthError, PermissionError, getActiveTenantContextWithPermissionOrThrow } from "@/lib/server-auth"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { OptionalNonEmptyString, PositiveInt, UuidSchema } from "@/lib/zod"
import { computeQueueHealthSnapshot } from "@/lib/queue-health"
import type { ActionResponse } from "@/lib/action-response"

export type QueueJobListItem = Prisma.TaskQueueGetPayload<{
    select: {
        id: true
        tenantId: true
        type: true
        status: true
        idempotencyKey: true
        priority: true
        availableAt: true
        lockedAt: true
        lockedBy: true
        attempts: true
        maxAttempts: true
        lastError: true
        payload: true
        result: true
        createdAt: true
        updatedAt: true
    }
}>

export type QueueTypeStatsItem = {
    type: string
    total: number
    counts: Partial<Record<QueueStatus, number>>
}

export type { QueueHealthSnapshot } from "@/lib/queue-health"

const GetQueueJobsInputSchema = z
    .object({
        status: z.nativeEnum(QueueStatus).optional(),
        type: OptionalNonEmptyString(80),
        query: OptionalNonEmptyString(200),
        take: PositiveInt().max(200).optional(),
        cursor: UuidSchema.optional(),
    })
    .strict()
    .optional()

export async function getQueueJobs(input?: {
    status?: QueueStatus
    type?: string
    query?: string
    take?: number
    cursor?: string
}): Promise<
    ActionResponse<
        {
            data: QueueJobListItem[]
            counts: Partial<Record<QueueStatus, number>>
            typeStats: QueueTypeStatsItem[]
            nextCursor: string | null
            health: import("@/lib/queue-health").QueueHealthSnapshot
        },
        { data: QueueJobListItem[] }
    >
> {
    const parsed = GetQueueJobsInputSchema.safeParse(input)
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败", data: [] as QueueJobListItem[] }
    }
    input = parsed.data

    let ctx: Awaited<ReturnType<typeof getActiveTenantContextWithPermissionOrThrow>>
    try {
        ctx = await getActiveTenantContextWithPermissionOrThrow("admin:settings")
    } catch (error) {
        if (error instanceof AuthError) {
            return { success: false, error: "未登录", data: [] as QueueJobListItem[] }
        }
        if (error instanceof PermissionError) {
            return { success: false, error: getPublicActionErrorMessage(error, "权限不足"), data: [] as QueueJobListItem[] }
        }
        throw error
    }

    const rate = await enforceRateLimit({ ctx, action: "ops.queue.jobs.list", limit: 240 })
    if (!rate.allowed) {
        return { success: false, error: rate.error, data: [] as QueueJobListItem[] }
    }

    const tenantId = ctx.tenantId

    const take = Math.max(1, Math.min(200, input?.take ?? 100))
    const query = (input?.query || "").trim()
    const type = (input?.type || "").trim()

    const where: Prisma.TaskQueueWhereInput = {
        tenantId,
        ...(input?.status ? { status: input.status } : {}),
        ...(type ? { type } : {}),
        ...(query
            ? {
                  OR: [
                      { id: { contains: query, mode: "insensitive" } },
                      { idempotencyKey: { contains: query, mode: "insensitive" } },
                      { type: { contains: query, mode: "insensitive" } },
                  ],
              }
            : {}),
    }

    try {
        const [jobs, grouped, groupedByType, health] = await Promise.all([
            prisma.taskQueue.findMany({
                where,
                take,
                ...(input?.cursor ? { skip: 1, cursor: { id: input.cursor } } : {}),
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    tenantId: true,
                    type: true,
                    status: true,
                    idempotencyKey: true,
                    priority: true,
                    availableAt: true,
                    lockedAt: true,
                    lockedBy: true,
                    attempts: true,
                    maxAttempts: true,
                    lastError: true,
                    payload: true,
                    result: true,
                    createdAt: true,
                    updatedAt: true,
                },
            }),
            prisma.taskQueue.groupBy({
                by: ["status"],
                where: { tenantId },
                _count: { _all: true },
            }),
            prisma.taskQueue.groupBy({
                by: ["type", "status"],
                where: { tenantId },
                _count: { _all: true },
            }),
            computeQueueHealthSnapshot({ tenantId }),
        ])

        const counts: Partial<Record<QueueStatus, number>> = {}
        for (const row of grouped) {
            counts[row.status] = row._count._all
        }

        const typeMap = new Map<string, QueueTypeStatsItem>()
        for (const row of groupedByType) {
            const type = row.type
            const item = typeMap.get(type) || { type, total: 0, counts: {} }
            item.counts[row.status] = row._count._all
            item.total += row._count._all
            typeMap.set(type, item)
        }

        const typeStats = Array.from(typeMap.values())
            .sort((a, b) => b.total - a.total)
            .slice(0, 12)

        const nextCursor = jobs.length === take ? jobs[jobs.length - 1]?.id : null

        return { success: true, data: jobs, counts, typeStats, nextCursor, health }
    } catch (error) {
        logger.error("获取队列任务失败", error)
        return { success: false, error: "获取队列任务失败", data: [] as QueueJobListItem[] }
    }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

export async function requeueJob(jobId: string): Promise<ActionResponse> {
    const parsed = z.object({ jobId: UuidSchema }).strict().safeParse({ jobId })
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
    jobId = parsed.data.jobId

    let ctx: Awaited<ReturnType<typeof getActiveTenantContextWithPermissionOrThrow>>
    try {
        ctx = await getActiveTenantContextWithPermissionOrThrow("admin:settings")
    } catch (error) {
        if (error instanceof AuthError) return { success: false, error: "未登录" }
        if (error instanceof PermissionError) return { success: false, error: getPublicActionErrorMessage(error, "权限不足") }
        throw error
    }

    const rate = await enforceRateLimit({ ctx, action: "ops.queue.job.requeue", limit: 120, extraKey: jobId })
    if (!rate.allowed) {
        return { success: false, error: rate.error }
    }

    const tenantId = ctx.tenantId
    const userId = ctx.user.id

    const job = await prisma.taskQueue.findFirst({
        where: { id: jobId, tenantId },
        select: { id: true, attempts: true, lastError: true, result: true, type: true, status: true },
    })
    if (!job) return { success: false, error: "任务不存在" }

    const nowIso = new Date().toISOString()
    const prev = job.result
    const base = isPlainRecord(prev) ? prev : prev === null || prev === undefined ? {} : { previousResult: prev }
    const result = {
        ...base,
        requeuedAt: nowIso,
        requeuedBy: userId,
        previousAttempts: job.attempts,
        previousLastError: job.lastError ?? null,
    } satisfies Prisma.InputJsonValue

    await prisma.taskQueue.updateMany({
        where: { id: job.id, tenantId },
        data: {
            status: QueueStatus.PENDING,
            availableAt: new Date(),
            lockedAt: null,
            lockedBy: null,
            attempts: 0,
            lastError: null,
            result,
        },
    })

    revalidatePath("/admin/ops/queue")
    return { success: true }
}

export async function cancelJob(jobId: string): Promise<ActionResponse> {
    const parsed = z.object({ jobId: UuidSchema }).strict().safeParse({ jobId })
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
    jobId = parsed.data.jobId

    let ctx: Awaited<ReturnType<typeof getActiveTenantContextWithPermissionOrThrow>>
    try {
        ctx = await getActiveTenantContextWithPermissionOrThrow("admin:settings")
    } catch (error) {
        if (error instanceof AuthError) return { success: false, error: "未登录" }
        if (error instanceof PermissionError) return { success: false, error: getPublicActionErrorMessage(error, "权限不足") }
        throw error
    }
    const tenantId = ctx.tenantId
    const userId = ctx.user.id

    const job = await prisma.taskQueue.findFirst({
        where: { id: jobId, tenantId },
        select: { id: true, attempts: true, lastError: true, result: true, type: true, status: true },
    })
    if (!job) return { success: false, error: "任务不存在" }

    const nowIso = new Date().toISOString()
    const prev = job.result
    const base = isPlainRecord(prev) ? prev : prev === null || prev === undefined ? {} : { previousResult: prev }
    const result = {
        ...base,
        cancelledAt: nowIso,
        cancelledBy: userId,
        previousAttempts: job.attempts,
        previousLastError: job.lastError ?? null,
    } satisfies Prisma.InputJsonValue

    const rate = await enforceRateLimit({ ctx, action: "ops.queue.job.cancel", limit: 120, extraKey: jobId })
    if (!rate.allowed) {
        return { success: false, error: rate.error }
    }

    await prisma.taskQueue.updateMany({
        where: { id: job.id, tenantId },
        data: {
            status: QueueStatus.FAILED,
            lockedAt: null,
            lockedBy: null,
            lastError: "已由运维手动取消",
            result,
        },
    })

    revalidatePath("/admin/ops/queue")
    return { success: true }
}
