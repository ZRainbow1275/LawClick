import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { Prisma, QueueStatus, type TaskQueue } from "@prisma/client"
import { TaskType as QueueTaskType, type TaskType } from "@/lib/queue-task-types"
export { TaskType } from "@/lib/queue-task-types"
import { DEFAULT_QUEUE_PROCESS_POLICY, type QueueProcessPolicy } from "@/lib/queue-policy"
import { hostname } from "node:os"
import { QUEUE_LOCK_TIMEOUT_MS } from "@/lib/queue-constants"
import { runWithTenantRequestContext } from "@/lib/tenant-context"

export type ProcessNextResult =
    | { processed: false; reason: "NO_ELIGIBLE" }
    | { processed: true; jobId: string; type: string; status: "COMPLETED" }
    | { processed: true; jobId: string; type: string; status: "RETRY_SCHEDULED"; error: string; attempts: number; nextRunAt: string }
    | { processed: true; jobId: string; type: string; status: "FAILED"; error: string; attempts: number }

export type ProcessBatchResult = {
    processed: number
    results: ProcessNextResult[]
    perTypeProcessed: Record<string, number>
}

export type ProcessFilter = {
    tenantId?: string
    type?: string
    excludeTypes?: string[]
}

export type EnqueueOptions = {
    tenantId?: string
    availableAt?: Date
    priority?: number
    maxAttempts?: number
    idempotencyKey?: string
}

const MAX_BATCH = 50

let cachedWorkerId: string | null = null
function getWorkerId() {
    if (cachedWorkerId) return cachedWorkerId
    const explicit = (process.env.QUEUE_WORKER_ID || "").trim()
    if (explicit) {
        cachedWorkerId = explicit
        return cachedWorkerId
    }
    cachedWorkerId = `${hostname()}:${process.pid}`
    return cachedWorkerId
}

function computeNextRunAt(attempts: number) {
    const baseSeconds = 10
    const maxSeconds = 60 * 30
    const exp = Math.min(maxSeconds, baseSeconds * Math.pow(2, Math.max(0, attempts - 1)))
    const jitter = Math.floor(Math.random() * Math.min(30, Math.max(1, exp / 10)))
    return new Date(Date.now() + (exp + jitter) * 1000)
}

function prismaErrorCode(error: unknown): string | null {
    if (!error || typeof error !== "object") return null
    const code = (error as { code?: unknown }).code
    return typeof code === "string" ? code : null
}

function normalizeTenantId(value: unknown): string {
    const fromInput = typeof value === "string" ? value.trim() : ""
    if (fromInput) return fromInput
    const fromEnv = (process.env.LAWCLICK_TENANT_ID || "").trim()
    if (fromEnv) return fromEnv
    return "default-tenant"
}

export const queue = {
    async enqueue(type: TaskType | string, payload: Prisma.InputJsonValue, options?: EnqueueOptions) {
        const tenantId = normalizeTenantId(options?.tenantId)
        const availableAt = options?.availableAt ?? new Date()
        const priority = Number.isFinite(options?.priority) ? Math.floor(options!.priority!) : 0
        const maxAttempts = Number.isFinite(options?.maxAttempts) ? Math.max(1, Math.floor(options!.maxAttempts!)) : 8
        const idempotencyKey = (options?.idempotencyKey || "").trim() || null

        try {
            return await runWithTenantRequestContext({ tenantId, userId: null }, async () => {
                return prisma.taskQueue.create({
                    data: {
                        tenantId,
                        type,
                        payload,
                        status: QueueStatus.PENDING,
                        availableAt,
                        priority,
                        maxAttempts,
                        ...(idempotencyKey ? { idempotencyKey } : {}),
                    },
                })
            })
        } catch (error) {
            if (idempotencyKey && prismaErrorCode(error) === "P2002") {
                const existing = await runWithTenantRequestContext({ tenantId, userId: null }, async () => {
                    return prisma.taskQueue.findFirst({ where: { tenantId, idempotencyKey } })
                })
                if (existing) return existing
            }
            logger.error("Failed to enqueue task", error)
            throw error
        }
    },

    async processNext(filter?: ProcessFilter): Promise<ProcessNextResult> {
        const workerId = getWorkerId()
        const now = new Date()
        const lockExpiredBefore = new Date(now.getTime() - QUEUE_LOCK_TIMEOUT_MS)

        const excludeTypes = Array.isArray(filter?.excludeTypes)
            ? filter!.excludeTypes!.map((t) => (typeof t === "string" ? t.trim() : "")).filter(Boolean)
            : []

        const claimed = await prisma.$queryRaw<TaskQueue[]>(Prisma.sql`
            UPDATE "TaskQueue"
            SET
                status = ${QueueStatus.PROCESSING}::"QueueStatus",
                "lockedAt" = NOW(),
                "lockedBy" = ${workerId},
                attempts = attempts + 1,
                "updatedAt" = NOW()
            WHERE id = (
                SELECT id
                FROM "TaskQueue"
                WHERE
                    attempts < "maxAttempts"
                    ${filter?.tenantId ? Prisma.sql`AND "tenantId" = ${filter.tenantId}` : Prisma.sql``}
                    ${filter?.type ? Prisma.sql`AND type = ${filter.type}` : Prisma.sql``}
                    ${excludeTypes.length > 0 ? Prisma.sql`AND type NOT IN (${Prisma.join(excludeTypes)})` : Prisma.sql``}
                    AND (
                        (status = ${QueueStatus.PENDING}::"QueueStatus" AND "availableAt" <= ${now})
                        OR (status = ${QueueStatus.PROCESSING}::"QueueStatus" AND "lockedAt" IS NOT NULL AND "lockedAt" <= ${lockExpiredBefore})
                    )
                ORDER BY priority DESC, "createdAt" ASC
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            )
            RETURNING *;
        `)

        const job = claimed[0] ?? null
        if (!job) return { processed: false, reason: "NO_ELIGIBLE" }

        return runWithTenantRequestContext({ tenantId: job.tenantId, userId: null }, async () => {
            if (job.attempts > job.maxAttempts) {
                const updated = await prisma.taskQueue.updateMany({
                    where: { id: job.id, tenantId: job.tenantId, lockedBy: workerId, status: QueueStatus.PROCESSING },
                    data: {
                        status: QueueStatus.FAILED,
                        lastError: "超过最大重试次数（已拒绝执行）",
                        result: {
                            error: "超过最大重试次数（已拒绝执行）",
                            attempts: job.attempts,
                            failedAt: new Date().toISOString(),
                        },
                    },
                })

                if (updated.count === 0) {
                    logger.warn("[queue] 超限失败更新失败：锁已丢失或状态变化", { jobId: job.id, workerId })
                }
                return {
                    processed: true,
                    jobId: job.id,
                    type: job.type,
                    status: "FAILED",
                    error: "超过最大重试次数（已拒绝执行）",
                    attempts: job.attempts,
                } satisfies ProcessNextResult
            }

            try {
                // 使用真实处理器（动态导入避免循环依赖）
                const { getJobHandler } = await import("@/lib/job-handlers")
                const handler = getJobHandler(job.type)
                const output = await handler(job.payload, {
                    jobId: job.id,
                    tenantId: job.tenantId,
                    idempotencyKey: job.idempotencyKey ?? null,
                    attempts: job.attempts,
                    maxAttempts: job.maxAttempts,
                })

                // Complete
                 const processedAt = new Date().toISOString()
                 const updated = await prisma.taskQueue.updateMany({
                     where: { id: job.id, tenantId: job.tenantId, lockedBy: workerId, status: QueueStatus.PROCESSING },
                     data: {
                         status: QueueStatus.COMPLETED,
                         lastError: null,
                         result: {
                            success: true,
                            processedAt,
                            attempts: job.attempts,
                            ...(output !== undefined ? { output } : {}),
                        },
                    },
                })

                if (updated.count === 0) {
                    logger.warn("[queue] 完成更新失败：锁已丢失或状态变化", { jobId: job.id, workerId })
                }

                return { processed: true, jobId: job.id, type: job.type, status: "COMPLETED" } satisfies ProcessNextResult
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)

                const attempts = job.attempts
                const reachedMax = attempts >= job.maxAttempts
                const nextRunAt = reachedMax ? null : computeNextRunAt(attempts)

                 const updated = await prisma.taskQueue.updateMany({
                     where: { id: job.id, tenantId: job.tenantId, lockedBy: workerId, status: QueueStatus.PROCESSING },
                     data: {
                         status: reachedMax ? QueueStatus.FAILED : QueueStatus.PENDING,
                         ...(reachedMax ? {} : { lockedAt: null, lockedBy: null }),
                         lastError: message,
                        ...(nextRunAt ? { availableAt: nextRunAt } : {}),
                        result: {
                            error: message,
                            attempts,
                            ...(nextRunAt ? { nextRunAt: nextRunAt.toISOString() } : {}),
                            ...(reachedMax ? { failedAt: new Date().toISOString() } : {}),
                        },
                    },
                })

                if (updated.count === 0) {
                    logger.warn("[queue] 失败更新失败：锁已丢失或状态变化", { jobId: job.id, workerId })
                }

                if (reachedMax) {
                    return { processed: true, jobId: job.id, type: job.type, status: "FAILED", error: message, attempts } satisfies ProcessNextResult
                }

                return {
                    processed: true,
                    jobId: job.id,
                    type: job.type,
                    status: "RETRY_SCHEDULED",
                    error: message,
                    attempts,
                    nextRunAt: nextRunAt!.toISOString(),
                } satisfies ProcessNextResult
            }
        })
    },

    async processBatch(input?: { maxJobs?: number; timeBudgetMs?: number; filter?: ProcessFilter }): Promise<ProcessBatchResult> {
        const maxJobsRaw = input?.maxJobs ?? 1
        const timeBudgetMs = Math.max(500, Math.floor(input?.timeBudgetMs ?? 20_000))

        const maxJobs = Math.max(1, Math.min(MAX_BATCH, Math.floor(maxJobsRaw)))
        const deadline = Date.now() + timeBudgetMs

        const results: ProcessNextResult[] = []
        const perTypeProcessed: Record<string, number> = {}
        const bump = (type: string) => {
            perTypeProcessed[type] = (perTypeProcessed[type] || 0) + 1
        }
        while (results.length < maxJobs && Date.now() < deadline) {
            const res = await this.processNext(input?.filter)
            results.push(res)
            if (!res.processed) break
            bump(res.type)
        }
        return { processed: results.filter((r) => r.processed).length, results, perTypeProcessed }
    },

    async processBalancedBatch(input?: { maxJobs?: number; timeBudgetMs?: number; filter?: ProcessFilter; policy?: Partial<QueueProcessPolicy> }): Promise<ProcessBatchResult> {
        const maxJobsRaw = input?.maxJobs ?? 1
        const timeBudgetMs = Math.max(500, Math.floor(input?.timeBudgetMs ?? 20_000))

        const maxJobs = Math.max(1, Math.min(MAX_BATCH, Math.floor(maxJobsRaw)))
        const deadline = Date.now() + timeBudgetMs

        const rawPolicy = input?.policy || {}
        const cleanupMax = Number.isFinite(rawPolicy.cleanupMax) ? Math.max(0, Math.min(MAX_BATCH, Math.floor(rawPolicy.cleanupMax!))) : DEFAULT_QUEUE_PROCESS_POLICY.cleanupMax
        const healthMax = Number.isFinite(rawPolicy.healthMax) ? Math.max(0, Math.min(MAX_BATCH, Math.floor(rawPolicy.healthMax!))) : DEFAULT_QUEUE_PROCESS_POLICY.healthMax
        const auditMax = Number.isFinite(rawPolicy.auditMax) ? Math.max(0, Math.min(MAX_BATCH, Math.floor(rawPolicy.auditMax!))) : DEFAULT_QUEUE_PROCESS_POLICY.auditMax
        const webhookMax = Number.isFinite(rawPolicy.webhookMax) ? Math.max(0, Math.min(MAX_BATCH, Math.floor(rawPolicy.webhookMax!))) : DEFAULT_QUEUE_PROCESS_POLICY.webhookMax
        const emailMax = Number.isFinite(rawPolicy.emailMax) ? Math.max(0, Math.min(MAX_BATCH, Math.floor(rawPolicy.emailMax!))) : DEFAULT_QUEUE_PROCESS_POLICY.emailMax

        const results: ProcessNextResult[] = []
        const perTypeProcessed: Record<string, number> = {}
        const bump = (type: string) => {
            perTypeProcessed[type] = (perTypeProcessed[type] || 0) + 1
        }

        const baseFilter: ProcessFilter | undefined = input?.filter ? { ...input.filter, type: undefined } : undefined

        let processed = 0
        const runPhase = async (limit: number, filter?: ProcessFilter) => {
            if (limit <= 0) return
            for (let i = 0; i < limit; i += 1) {
                if (processed >= maxJobs || Date.now() >= deadline) return
                const res = await this.processNext(filter)
                if (!res.processed) return
                results.push(res)
                bump(res.type)
                processed += 1
            }
        }

        await runPhase(Math.min(cleanupMax, maxJobs - processed), baseFilter ? { ...baseFilter, type: QueueTaskType.CLEANUP_UPLOAD_INTENTS } : { type: QueueTaskType.CLEANUP_UPLOAD_INTENTS })

        const healthLimit = Math.min(healthMax, maxJobs - processed)
        if (healthLimit > 0) {
            const before = processed
            await runPhase(healthLimit, baseFilter ? { ...baseFilter, type: QueueTaskType.QUEUE_HEALTH_CHECK } : { type: QueueTaskType.QUEUE_HEALTH_CHECK })
            const used = processed - before
            const remaining = Math.max(0, healthLimit - used)
            await runPhase(
                remaining,
                baseFilter ? { ...baseFilter, type: QueueTaskType.KANBAN_HEALTH_CHECK } : { type: QueueTaskType.KANBAN_HEALTH_CHECK }
            )
        }
        await runPhase(Math.min(auditMax, maxJobs - processed), baseFilter ? { ...baseFilter, type: QueueTaskType.AUDIT_LOG } : { type: QueueTaskType.AUDIT_LOG })

        const remainingAfterMaintenance = maxJobs - processed
        const reservedWebhook = Math.min(webhookMax, remainingAfterMaintenance)
        const reservedEmail = Math.min(emailMax, Math.max(0, remainingAfterMaintenance - reservedWebhook))
        const otherLimit = Math.max(0, remainingAfterMaintenance - reservedWebhook - reservedEmail)

        const otherFilter: ProcessFilter | undefined = baseFilter
            ? { ...baseFilter, excludeTypes: [QueueTaskType.SEND_EMAIL, QueueTaskType.TRIGGER_TOOL_WEBHOOK] }
            : { excludeTypes: [QueueTaskType.SEND_EMAIL, QueueTaskType.TRIGGER_TOOL_WEBHOOK] }
        await runPhase(otherLimit, otherFilter)

        const remainingBeforeWebhook = maxJobs - processed
        await runPhase(
            Math.min(reservedWebhook, remainingBeforeWebhook),
            baseFilter ? { ...baseFilter, type: QueueTaskType.TRIGGER_TOOL_WEBHOOK } : { type: QueueTaskType.TRIGGER_TOOL_WEBHOOK }
        )

        const remainingBeforeEmail = maxJobs - processed
        await runPhase(
            Math.min(reservedEmail, remainingBeforeEmail),
            baseFilter ? { ...baseFilter, type: QueueTaskType.SEND_EMAIL } : { type: QueueTaskType.SEND_EMAIL }
        )

        const remainingAfterEmail = maxJobs - processed
        if (remainingAfterEmail > 0) {
            await runPhase(remainingAfterEmail, otherFilter)
        }

        if (processed === 0) {
            results.push({ processed: false, reason: "NO_ELIGIBLE" })
        }

        return { processed, results, perTypeProcessed }
    },
}
