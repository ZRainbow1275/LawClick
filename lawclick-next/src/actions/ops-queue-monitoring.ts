"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { OpsAlertSeverity, OpsAlertStatus, OpsAlertType, OpsMetricKind, type Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { AuthError, PermissionError, getActiveTenantContextWithPermissionOrThrow } from "@/lib/server-auth"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { queue, TaskType } from "@/lib/queue"
import { QUEUE_TASK_PRIORITY } from "@/lib/queue-policy"
import { UuidSchema } from "@/lib/zod"

const QueueHealthSnapshotSchema = z
    .object({
        tenantId: z.string().trim().min(1),
        duePending: z.number().int().min(0),
        scheduledPending: z.number().int().min(0),
        oldestDuePendingAt: z.string().datetime().nullable(),
        oldestDuePendingAgeSeconds: z.number().int().min(0).nullable(),
        staleProcessing: z.number().int().min(0),
        failed24h: z.number().int().min(0),
        latestFailure: z
            .object({
                jobId: z.string().uuid(),
                type: z.string().trim().min(1),
                updatedAt: z.string().datetime(),
                lastError: z.string().nullable(),
            })
            .nullable(),
        processing24h: z
            .object({
                total: z.number().int().min(0),
                completed: z.number().int().min(0),
                failed: z.number().int().min(0),
                p50Seconds: z.number().min(0).nullable(),
                p95Seconds: z.number().min(0).nullable(),
                avgSeconds: z.number().min(0).nullable(),
                failureRate: z.number().min(0).max(1).nullable(),
            })
            .strict()
            .nullable()
            .optional(),
    })
    .strict()

export type OpsAlertListItem = {
    id: string
    type: OpsAlertType
    severity: OpsAlertSeverity
    status: OpsAlertStatus
    title: string
    message: string
    firstSeenAt: string
    lastSeenAt: string
    lastNotifiedAt: string | null
    snoozedUntil: string | null
    acknowledgedAt: string | null
    acknowledgedById: string | null
    resolvedAt: string | null
    resolvedById: string | null
}

export type OpsQueueSnapshotListItem = {
    id: string
    capturedAt: string
    metrics: z.infer<typeof QueueHealthSnapshotSchema> | null
    metricsRaw: Prisma.JsonValue
}

const GetQueueMonitoringInputSchema = z
    .object({
        includeResolved: z.boolean().optional(),
        alertsTake: z.number().int().min(1).max(200).optional(),
        snapshotsTake: z.number().int().min(1).max(200).optional(),
    })
    .strict()
    .optional()

export async function getQueueMonitoring(input?: { includeResolved?: boolean; alertsTake?: number; snapshotsTake?: number }) {
    const parsed = GetQueueMonitoringInputSchema.safeParse(input)
    if (!parsed.success) {
        return {
            success: false as const,
            error: parsed.error.issues[0]?.message || "输入校验失败",
            data: { alerts: [] as OpsAlertListItem[], snapshots: [] as OpsQueueSnapshotListItem[] },
        }
    }
    input = parsed.data

    let tenantId: string
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("admin:settings")
        const rate = await enforceRateLimit({ ctx, action: "ops.queue.monitoring.get", limit: 240 })
        if (!rate.allowed) {
            return {
                success: false as const,
                error: rate.error,
                data: {
                    alerts: [] as OpsAlertListItem[],
                    snapshots: [] as OpsQueueSnapshotListItem[],
                },
            }
        }
        tenantId = ctx.tenantId
    } catch (error) {
        if (error instanceof AuthError) {
            return {
                success: false as const,
                error: "未登录",
                data: { alerts: [] as OpsAlertListItem[], snapshots: [] as OpsQueueSnapshotListItem[] },
            }
        }
        if (error instanceof PermissionError) {
            return {
                success: false as const,
                error: getPublicActionErrorMessage(error, "权限不足"),
                data: { alerts: [] as OpsAlertListItem[], snapshots: [] as OpsQueueSnapshotListItem[] },
            }
        }
        throw error
    }

    const includeResolved = Boolean(input?.includeResolved)
    const alertsTake = input?.alertsTake ?? 50
    const snapshotsTake = input?.snapshotsTake ?? 24

    try {
        const [alerts, snapshots] = await Promise.all([
            prisma.opsAlert.findMany({
                where: {
                    tenantId,
                    type: {
                        in: [OpsAlertType.QUEUE_BACKLOG, OpsAlertType.QUEUE_STALE_PROCESSING, OpsAlertType.QUEUE_FAILURE_SPIKE],
                    },
                    ...(includeResolved ? {} : { status: { not: OpsAlertStatus.RESOLVED } }),
                },
                orderBy: [{ status: "asc" }, { severity: "asc" }, { lastSeenAt: "desc" }],
                take: alertsTake,
                select: {
                    id: true,
                    type: true,
                    severity: true,
                    status: true,
                    title: true,
                    message: true,
                    firstSeenAt: true,
                    lastSeenAt: true,
                    lastNotifiedAt: true,
                    snoozedUntil: true,
                    acknowledgedAt: true,
                    acknowledgedById: true,
                    resolvedAt: true,
                    resolvedById: true,
                },
            }),
            prisma.opsMetricSnapshot.findMany({
                where: { tenantId, kind: OpsMetricKind.QUEUE_HEALTH },
                orderBy: { capturedAt: "desc" },
                take: snapshotsTake,
                select: { id: true, capturedAt: true, metrics: true },
            }),
        ])

        const alertItems: OpsAlertListItem[] = alerts.map((row) => ({
            id: row.id,
            type: row.type,
            severity: row.severity,
            status: row.status,
            title: row.title,
            message: row.message,
            firstSeenAt: row.firstSeenAt.toISOString(),
            lastSeenAt: row.lastSeenAt.toISOString(),
            lastNotifiedAt: row.lastNotifiedAt ? row.lastNotifiedAt.toISOString() : null,
            snoozedUntil: row.snoozedUntil ? row.snoozedUntil.toISOString() : null,
            acknowledgedAt: row.acknowledgedAt ? row.acknowledgedAt.toISOString() : null,
            acknowledgedById: row.acknowledgedById ?? null,
            resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
            resolvedById: row.resolvedById ?? null,
        }))

        const snapshotItems: OpsQueueSnapshotListItem[] = snapshots.map((row) => {
            const parsedMetrics = QueueHealthSnapshotSchema.safeParse(row.metrics)
            return {
                id: row.id,
                capturedAt: row.capturedAt.toISOString(),
                metrics: parsedMetrics.success ? parsedMetrics.data : null,
                metricsRaw: row.metrics,
            }
        })

        return { success: true as const, data: { alerts: alertItems, snapshots: snapshotItems } }
    } catch (error) {
        logger.error("获取队列监控数据失败", error)
        return { success: false as const, error: "获取队列监控数据失败", data: { alerts: [] as OpsAlertListItem[], snapshots: [] as OpsQueueSnapshotListItem[] } }
    }
}

export async function enqueueQueueHealthCheck() {
    let tenantId: string
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("admin:settings")
        const rate = await enforceRateLimit({ ctx, action: "ops.queue.healthCheck.enqueue", limit: 60 })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        tenantId = ctx.tenantId
    } catch (error) {
        if (error instanceof AuthError) return { success: false as const, error: "未登录" }
        if (error instanceof PermissionError)
            return { success: false as const, error: getPublicActionErrorMessage(error, "权限不足") }
        throw error
    }

    const now = new Date()
    const minuteKey = now.toISOString().slice(0, 16)

    try {
        const job = await queue.enqueue(TaskType.QUEUE_HEALTH_CHECK, {}, {
            tenantId,
            priority: QUEUE_TASK_PRIORITY[TaskType.QUEUE_HEALTH_CHECK],
            idempotencyKey: `queue-health/${minuteKey}`,
            maxAttempts: 3,
        })
        revalidatePath("/admin/ops/queue")
        return { success: true as const, data: { jobId: job.id } }
    } catch (error) {
        logger.error("入队健康检查失败", error)
        return { success: false as const, error: "入队健康检查失败" }
    }
}

export async function ackOpsAlert(alertId: string) {
    const parsed = z.object({ alertId: UuidSchema }).strict().safeParse({ alertId })
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
    alertId = parsed.data.alertId

    let tenantId: string
    let userId: string
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("admin:settings")
        const rate = await enforceRateLimit({ ctx, action: "ops.alert.ack", limit: 120, extraKey: alertId })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        tenantId = ctx.tenantId
        userId = ctx.user.id
    } catch (error) {
        if (error instanceof AuthError) return { success: false as const, error: "未登录" }
        if (error instanceof PermissionError)
            return { success: false as const, error: getPublicActionErrorMessage(error, "权限不足") }
        throw error
    }

    const updated = await prisma.opsAlert.updateMany({
        where: { id: alertId, tenantId },
        data: {
            status: OpsAlertStatus.ACKED,
            acknowledgedAt: new Date(),
            acknowledgedById: userId,
            snoozedUntil: null,
        },
    })

    if (updated.count === 0) return { success: false as const, error: "告警不存在" }
    revalidatePath("/admin/ops/queue")
    revalidatePath("/admin/ops/kanban")
    return { success: true as const }
}

export async function snoozeOpsAlert(alertId: string, minutes: number) {
    const parsed = z
        .object({
            alertId: UuidSchema,
            minutes: z.number().int().min(5).max(60 * 24 * 30),
        })
        .strict()
        .safeParse({ alertId, minutes })
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
    alertId = parsed.data.alertId
    minutes = parsed.data.minutes

    let tenantId: string
    let userId: string
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("admin:settings")
        const rate = await enforceRateLimit({ ctx, action: "ops.alert.snooze", limit: 120, extraKey: `${alertId}:${minutes}` })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        tenantId = ctx.tenantId
        userId = ctx.user.id
    } catch (error) {
        if (error instanceof AuthError) return { success: false as const, error: "未登录" }
        if (error instanceof PermissionError)
            return { success: false as const, error: getPublicActionErrorMessage(error, "权限不足") }
        throw error
    }

    const until = new Date(Date.now() + minutes * 60_000)

    const updated = await prisma.opsAlert.updateMany({
        where: { id: alertId, tenantId },
        data: {
            status: OpsAlertStatus.SNOOZED,
            snoozedUntil: until,
            acknowledgedAt: new Date(),
            acknowledgedById: userId,
        },
    })

    if (updated.count === 0) return { success: false as const, error: "告警不存在" }
    revalidatePath("/admin/ops/queue")
    revalidatePath("/admin/ops/kanban")
    return { success: true as const }
}

export async function unsnoozeOpsAlert(alertId: string) {
    const parsed = z.object({ alertId: UuidSchema }).strict().safeParse({ alertId })
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
    alertId = parsed.data.alertId

    let tenantId: string
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("admin:settings")
        const rate = await enforceRateLimit({ ctx, action: "ops.alert.unsnooze", limit: 120, extraKey: alertId })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        tenantId = ctx.tenantId
    } catch (error) {
        if (error instanceof AuthError) return { success: false as const, error: "未登录" }
        if (error instanceof PermissionError)
            return { success: false as const, error: getPublicActionErrorMessage(error, "权限不足") }
        throw error
    }

    const updated = await prisma.opsAlert.updateMany({
        where: { id: alertId, tenantId },
        data: {
            status: OpsAlertStatus.OPEN,
            snoozedUntil: null,
        },
    })

    if (updated.count === 0) return { success: false as const, error: "告警不存在" }
    revalidatePath("/admin/ops/queue")
    revalidatePath("/admin/ops/kanban")
    return { success: true as const }
}

export async function resolveOpsAlert(alertId: string) {
    const parsed = z.object({ alertId: UuidSchema }).strict().safeParse({ alertId })
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
    alertId = parsed.data.alertId

    let tenantId: string
    let userId: string
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("admin:settings")
        const rate = await enforceRateLimit({ ctx, action: "ops.alert.resolve", limit: 120, extraKey: alertId })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        tenantId = ctx.tenantId
        userId = ctx.user.id
    } catch (error) {
        if (error instanceof AuthError) return { success: false as const, error: "未登录" }
        if (error instanceof PermissionError)
            return { success: false as const, error: getPublicActionErrorMessage(error, "权限不足") }
        throw error
    }

    const updated = await prisma.opsAlert.updateMany({
        where: { id: alertId, tenantId },
        data: {
            status: OpsAlertStatus.RESOLVED,
            resolvedAt: new Date(),
            resolvedById: userId,
            snoozedUntil: null,
        },
    })

    if (updated.count === 0) return { success: false as const, error: "告警不存在" }
    revalidatePath("/admin/ops/queue")
    revalidatePath("/admin/ops/kanban")
    return { success: true as const }
}
