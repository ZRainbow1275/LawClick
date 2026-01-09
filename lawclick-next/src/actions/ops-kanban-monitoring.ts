"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { OpsAlertSeverity, OpsAlertStatus, OpsAlertType, OpsMetricKind, TaskStatus, TenantSignalKind, type Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { AuthError, PermissionError, getActiveTenantContextWithPermissionOrThrow } from "@/lib/server-auth"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { queue, TaskType } from "@/lib/queue"
import { QUEUE_TASK_PRIORITY } from "@/lib/queue-policy"
import { getTenantSignalSourceDiagnostics, type TenantSignalSourcePollerDiagnostics } from "@/lib/realtime/tenant-signal-source"

const KanbanHealthSnapshotSchema = z
    .object({
        tenantId: z.string().trim().min(1),
        totalTasks: z.number().int().min(0),
        openTasks: z.number().int().min(0),
        orphanTasks: z.number().int().min(0),
        perStatus: z
            .object({
                TODO: z.number().int().min(0),
                IN_PROGRESS: z.number().int().min(0),
                REVIEW: z.number().int().min(0),
                DONE: z.number().int().min(0),
            })
            .strict(),
        maxColumn: z
            .object({
                status: z.nativeEnum(TaskStatus),
                count: z.number().int().min(0),
            })
            .strict(),
        topProjects: z
            .array(
                z
                    .object({
                        projectId: z.string().trim().min(1),
                        title: z.string().trim().min(1),
                        projectCode: z.string().trim().min(1),
                        count: z.number().int().min(0),
                    })
                    .strict()
            )
            .max(20),
        topCases: z
            .array(
                z
                    .object({
                        caseId: z.string().trim().min(1),
                        title: z.string().trim().min(1),
                        caseCode: z.string().trim().nullable(),
                        count: z.number().int().min(0),
                    })
                    .strict()
            )
            .max(20),
        oldestOpenUpdatedAt: z.string().datetime().nullable(),
        oldestOpenAgeHours: z.number().int().min(0).nullable(),
        tasksChangedSignalUpdatedAt: z.string().datetime().nullable().optional(),
        tasksChangedSignalVersion: z.number().int().min(0).nullable().optional(),
        tasksChangedSignalAgeSeconds: z.number().int().min(0).nullable().optional(),
        tasksChangedSignalAction: z.string().trim().min(1).nullable().optional(),
        tasksChangedSignalReindexed: z.boolean().nullable().optional(),
        tasksChangedSignalReindexedTaskCount: z.number().int().min(0).nullable().optional(),
        queryMs: z.record(z.string(), z.number().int().min(0)).optional(),
        runMs: z.number().int().min(0).optional(),
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

export type OpsKanbanSnapshotListItem = {
    id: string
    capturedAt: string
    metrics: z.infer<typeof KanbanHealthSnapshotSchema> | null
    metricsRaw: Prisma.JsonValue
}

export type OpsKanbanRealtimeDiagnostics = {
    tenantSignalPollers: TenantSignalSourcePollerDiagnostics[]
}

export type OpsKanbanAutoHealthCheck = {
    thresholdMinutes: number
    latestSnapshotAt: string | null
    latestSnapshotAgeMinutes: number | null
    enqueuedJobId: string | null
}

export type OpsKanbanMonitoringData = {
    alerts: OpsAlertListItem[]
    snapshots: OpsKanbanSnapshotListItem[]
    realtime: OpsKanbanRealtimeDiagnostics
    autoHealthCheck: OpsKanbanAutoHealthCheck
}

function buildEmptyKanbanMonitoringData(): OpsKanbanMonitoringData {
    return {
        alerts: [],
        snapshots: [],
        realtime: { tenantSignalPollers: [] },
        autoHealthCheck: {
            thresholdMinutes: 10,
            latestSnapshotAt: null,
            latestSnapshotAgeMinutes: null,
            enqueuedJobId: null,
        },
    }
}

const GetKanbanMonitoringInputSchema = z
    .object({
        includeResolved: z.boolean().optional(),
        alertsTake: z.number().int().min(1).max(200).optional(),
        snapshotsTake: z.number().int().min(1).max(200).optional(),
    })
    .strict()
    .optional()

export async function getKanbanMonitoring(input?: { includeResolved?: boolean; alertsTake?: number; snapshotsTake?: number }) {
    const parsed = GetKanbanMonitoringInputSchema.safeParse(input)
    if (!parsed.success) {
        return {
            success: false as const,
            error: parsed.error.issues[0]?.message || "输入校验失败",
            data: {
                alerts: [] as OpsAlertListItem[],
                snapshots: [] as OpsKanbanSnapshotListItem[],
                realtime: { tenantSignalPollers: [] },
                autoHealthCheck: { thresholdMinutes: 10, latestSnapshotAt: null, latestSnapshotAgeMinutes: null, enqueuedJobId: null },
            },
        }
    }
    input = parsed.data

    let tenantId: string
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("admin:settings")
        const rate = await enforceRateLimit({ ctx, action: "ops.kanban.monitoring.get", limit: 240 })
        if (!rate.allowed) {
            return {
                success: false as const,
                error: rate.error,
                data: buildEmptyKanbanMonitoringData(),
            }
        }
        tenantId = ctx.tenantId
    } catch (error) {
        if (error instanceof AuthError) {
            return {
                success: false as const,
                error: "未登录",
                data: {
                    alerts: [] as OpsAlertListItem[],
                    snapshots: [] as OpsKanbanSnapshotListItem[],
                    realtime: { tenantSignalPollers: [] },
                    autoHealthCheck: { thresholdMinutes: 10, latestSnapshotAt: null, latestSnapshotAgeMinutes: null, enqueuedJobId: null },
                },
            }
        }
        if (error instanceof PermissionError) {
            return {
                success: false as const,
                error: getPublicActionErrorMessage(error, "权限不足"),
                data: {
                    alerts: [] as OpsAlertListItem[],
                    snapshots: [] as OpsKanbanSnapshotListItem[],
                    realtime: { tenantSignalPollers: [] },
                    autoHealthCheck: { thresholdMinutes: 10, latestSnapshotAt: null, latestSnapshotAgeMinutes: null, enqueuedJobId: null },
                },
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
                    type: { in: [OpsAlertType.KANBAN_BACKLOG] },
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
                where: { tenantId, kind: OpsMetricKind.KANBAN_HEALTH },
                orderBy: { capturedAt: "desc" },
                take: snapshotsTake,
                select: { id: true, capturedAt: true, metrics: true },
            }),
        ])

        const autoHealthCheckThresholdMinutes = 10
        const latestSnapshotAt = snapshots[0]?.capturedAt ?? null
        const latestSnapshotAgeMinutes =
            latestSnapshotAt ? Math.max(0, Math.floor((Date.now() - latestSnapshotAt.getTime()) / 60_000)) : null

        let autoHealthCheckJobId: string | null = null
        if (!latestSnapshotAt || (latestSnapshotAgeMinutes !== null && latestSnapshotAgeMinutes >= autoHealthCheckThresholdMinutes)) {
            const now = new Date()
            const minuteKey = now.toISOString().slice(0, 16)
            try {
                const job = await queue.enqueue(
                    TaskType.KANBAN_HEALTH_CHECK,
                    {},
                    {
                        tenantId,
                        priority: QUEUE_TASK_PRIORITY[TaskType.KANBAN_HEALTH_CHECK],
                        idempotencyKey: `kanban-health/${minuteKey}`,
                        maxAttempts: 3,
                    }
                )
                autoHealthCheckJobId = job.id
            } catch (error) {
                logger.error("自动入队看板健康检查失败", error)
            }
        }

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
            acknowledgedById: row.acknowledgedById,
            resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
            resolvedById: row.resolvedById,
        }))

        const snapshotItems: OpsKanbanSnapshotListItem[] = snapshots.map((row) => {
            const parsed = KanbanHealthSnapshotSchema.safeParse(row.metrics)
            return {
                id: row.id,
                capturedAt: row.capturedAt.toISOString(),
                metrics: parsed.success ? parsed.data : null,
                metricsRaw: row.metrics,
            }
        })

        const realtime = getTenantSignalSourceDiagnostics({ tenantId, kind: TenantSignalKind.TASKS_CHANGED })

        return {
            success: true as const,
            data: {
                alerts: alertItems,
                snapshots: snapshotItems,
                realtime: { tenantSignalPollers: realtime.pollers },
                autoHealthCheck: {
                    thresholdMinutes: autoHealthCheckThresholdMinutes,
                    latestSnapshotAt: latestSnapshotAt ? latestSnapshotAt.toISOString() : null,
                    latestSnapshotAgeMinutes,
                    enqueuedJobId: autoHealthCheckJobId,
                },
            },
        }
    } catch (error) {
        logger.error("获取看板监控失败", error)
        return {
            success: false as const,
            error: "获取看板监控失败",
            data: {
                alerts: [] as OpsAlertListItem[],
                snapshots: [] as OpsKanbanSnapshotListItem[],
                realtime: { tenantSignalPollers: [] },
                autoHealthCheck: { thresholdMinutes: 10, latestSnapshotAt: null, latestSnapshotAgeMinutes: null, enqueuedJobId: null },
            },
        }
    }
}

export async function enqueueKanbanHealthCheck() {
    let tenantId: string
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("admin:settings")
        const rate = await enforceRateLimit({ ctx, action: "ops.kanban.healthCheck.enqueue", limit: 60 })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        tenantId = ctx.tenantId
    } catch (error) {
        if (error instanceof AuthError) return { success: false as const, error: "未登录" }
        if (error instanceof PermissionError) return { success: false as const, error: getPublicActionErrorMessage(error, "权限不足") }
        throw error
    }

    const now = new Date()
    const minuteKey = now.toISOString().slice(0, 16)

    try {
        const job = await queue.enqueue(
            TaskType.KANBAN_HEALTH_CHECK,
            {},
            {
                tenantId,
                priority: QUEUE_TASK_PRIORITY[TaskType.KANBAN_HEALTH_CHECK],
                idempotencyKey: `kanban-health/${minuteKey}`,
                maxAttempts: 3,
            }
        )
        revalidatePath("/admin/ops/kanban")
        return { success: true as const, data: { jobId: job.id } }
    } catch (error) {
        logger.error("入队看板健康检查失败", error)
        return { success: false as const, error: "入队看板健康检查失败" }
    }
}
