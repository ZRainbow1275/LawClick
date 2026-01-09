import "server-only"

import { prisma } from "@/lib/prisma"
import { QUEUE_LOCK_TIMEOUT_MS } from "@/lib/queue-constants"
import { Prisma, QueueStatus, type Prisma as PrismaTypes } from "@prisma/client"

const MANUAL_CANCEL_LAST_ERROR = "已由运维手动取消"

type QueueProcessingStats24h = {
    total: number
    completed: number
    failed: number
    p50Seconds: number | null
    p95Seconds: number | null
    avgSeconds: number | null
    failureRate: number | null
}

export type QueueHealthSnapshot = {
    tenantId: string
    duePending: number
    scheduledPending: number
    oldestDuePendingAt: string | null
    oldestDuePendingAgeSeconds: number | null
    staleProcessing: number
    failed24h: number
    latestFailure: { jobId: string; type: string; updatedAt: string; lastError: string | null } | null
    processing24h: QueueProcessingStats24h | null
}

type QueueHealthDb = Pick<PrismaTypes.TransactionClient, "taskQueue" | "$queryRaw"> | Pick<typeof prisma, "taskQueue" | "$queryRaw">

function toFiniteNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null
    if (typeof value === "number") return Number.isFinite(value) ? value : null
    if (typeof value === "bigint") return Number.isFinite(Number(value)) ? Number(value) : null
    if (typeof value === "string") {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
    }
    return null
}

function toNonNegativeInt(value: unknown): number {
    const parsed = toFiniteNumberOrNull(value)
    if (parsed === null) return 0
    return Math.max(0, Math.floor(parsed))
}

function toNonNegativeSeconds(value: unknown): number | null {
    const parsed = toFiniteNumberOrNull(value)
    if (parsed === null) return null
    if (parsed < 0) return 0
    return Math.round(parsed * 100) / 100
}

export async function computeQueueHealthSnapshot(input: { tenantId: string; now?: Date; db?: QueueHealthDb }): Promise<QueueHealthSnapshot> {
    const tenantId = input.tenantId.trim()
    if (!tenantId) {
        return {
            tenantId: "default-tenant",
            duePending: 0,
            scheduledPending: 0,
            oldestDuePendingAt: null,
            oldestDuePendingAgeSeconds: null,
            staleProcessing: 0,
            failed24h: 0,
            latestFailure: null,
            processing24h: null,
        }
    }

    const db = input.db ?? prisma
    const now = input.now ?? new Date()
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000)
    const lockExpiredBefore = new Date(now.getTime() - QUEUE_LOCK_TIMEOUT_MS)

    const [duePending, scheduledPending, oldestDuePending, staleProcessing, failed24h, latestFailure, processingRows] = await Promise.all([
        db.taskQueue.count({
            where: { tenantId, status: QueueStatus.PENDING, availableAt: { lte: now } },
        }),
        db.taskQueue.count({
            where: { tenantId, status: QueueStatus.PENDING, availableAt: { gt: now } },
        }),
        db.taskQueue.findFirst({
            where: { tenantId, status: QueueStatus.PENDING, availableAt: { lte: now } },
            orderBy: { availableAt: "asc" },
            select: { availableAt: true },
        }),
        db.taskQueue.count({
            where: { tenantId, status: QueueStatus.PROCESSING, lockedAt: { lt: lockExpiredBefore } },
        }),
        db.taskQueue.count({
            where: {
                tenantId,
                status: QueueStatus.FAILED,
                updatedAt: { gte: dayAgo },
                OR: [{ lastError: null }, { lastError: { not: MANUAL_CANCEL_LAST_ERROR } }],
            },
        }),
        db.taskQueue.findFirst({
            where: {
                tenantId,
                status: QueueStatus.FAILED,
                updatedAt: { gte: dayAgo },
                OR: [{ lastError: null }, { lastError: { not: MANUAL_CANCEL_LAST_ERROR } }],
            },
            orderBy: { updatedAt: "desc" },
            select: { id: true, type: true, updatedAt: true, lastError: true },
        }),
        db.$queryRaw<
            Array<{
                total: unknown
                completed: unknown
                failed: unknown
                p50_seconds: unknown
                p95_seconds: unknown
                avg_seconds: unknown
            }>
        >(Prisma.sql`
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = ${QueueStatus.COMPLETED}::"QueueStatus") AS completed,
                COUNT(*) FILTER (WHERE status = ${QueueStatus.FAILED}::"QueueStatus") AS failed,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("updatedAt" - "lockedAt"))) AS p50_seconds,
                percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("updatedAt" - "lockedAt"))) AS p95_seconds,
                AVG(EXTRACT(EPOCH FROM ("updatedAt" - "lockedAt"))) AS avg_seconds
            FROM "TaskQueue"
            WHERE
                "tenantId" = ${tenantId}
                AND "updatedAt" >= ${dayAgo}
                AND "lockedAt" IS NOT NULL
                AND (status = ${QueueStatus.COMPLETED}::"QueueStatus" OR status = ${QueueStatus.FAILED}::"QueueStatus")
        `),
    ])

    const oldestDuePendingAt = oldestDuePending?.availableAt ? oldestDuePending.availableAt.toISOString() : null
    const oldestDuePendingAgeSeconds =
        oldestDuePending?.availableAt ? Math.max(0, Math.floor((now.getTime() - oldestDuePending.availableAt.getTime()) / 1000)) : null

    const processingRow = processingRows[0] ?? null
    const processing24h = (() => {
        if (!processingRow) return null

        const total = toNonNegativeInt(processingRow.total)
        const completed = toNonNegativeInt(processingRow.completed)
        const failed = toNonNegativeInt(processingRow.failed)
        const p50Seconds = toNonNegativeSeconds(processingRow.p50_seconds)
        const p95Seconds = toNonNegativeSeconds(processingRow.p95_seconds)
        const avgSeconds = toNonNegativeSeconds(processingRow.avg_seconds)

        return {
            total,
            completed,
            failed,
            p50Seconds,
            p95Seconds,
            avgSeconds,
            failureRate: total > 0 ? Math.round((failed / total) * 10_000) / 10_000 : null,
        }
    })()

    return {
        tenantId,
        duePending,
        scheduledPending,
        oldestDuePendingAt,
        oldestDuePendingAgeSeconds,
        staleProcessing,
        failed24h,
        latestFailure: latestFailure
            ? {
                  jobId: latestFailure.id,
                  type: latestFailure.type,
                  updatedAt: latestFailure.updatedAt.toISOString(),
                  lastError: latestFailure.lastError ?? null,
              }
            : null,
        processing24h,
    }
}
