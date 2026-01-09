import { NextRequest, NextResponse } from "next/server"
import { TenantMembershipRole } from "@prisma/client"
import { queue } from "@/lib/queue"
import { AuthError, PermissionError, getActiveTenantContextOrThrow } from "@/lib/server-auth"
import { parseTaskType } from "@/lib/queue-task-types"
import { TaskType } from "@/lib/queue"
import { QUEUE_TASK_PRIORITY } from "@/lib/queue-policy"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, getRequestIp, isIpAllowedByAllowlist, parseIpAllowlist } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { z } from "zod"

// API to manually trigger queue processing (e.g., via Cron or Admin Button)
export async function POST(request: NextRequest) {
    try {
        const configuredSecret = (process.env.QUEUE_PROCESS_SECRET || "").trim()
        const providedSecret = (request.headers.get("x-lawclick-queue-secret") || "").trim()

        const hasValidSecret = Boolean(configuredSecret && providedSecret && providedSecret === configuredSecret)

        const requestIp = getRequestIp(request)
        const ip = requestIp || "unknown"

        if (hasValidSecret) {
            const allowlistRaw = (process.env.QUEUE_PROCESS_IP_ALLOWLIST || "").trim()
            const parsedAllowlist = parseIpAllowlist(allowlistRaw)

            const isProd = process.env.NODE_ENV === "production"
            const allowlistConfigured = parsedAllowlist.entries.length > 0
            const allowlistMisconfigured = Boolean(allowlistRaw && !allowlistConfigured)

            if (isProd && (allowlistRaw === "" || allowlistMisconfigured)) {
                logger.error("queue process secret mode blocked: missing/invalid QUEUE_PROCESS_IP_ALLOWLIST in production", {
                    ip,
                    invalidEntries: parsedAllowlist.invalidEntries.slice(0, 3),
                })
                return NextResponse.json({ error: "队列入口未就绪" }, { status: 503 })
            }

            if (allowlistMisconfigured) {
                logger.warn("queue process secret mode: invalid QUEUE_PROCESS_IP_ALLOWLIST (ignored in non-production)", {
                    ip,
                    invalidEntries: parsedAllowlist.invalidEntries.slice(0, 3),
                })
            }

            if (allowlistConfigured) {
                const allowed = requestIp ? isIpAllowedByAllowlist(requestIp, parsedAllowlist) : false
                if (!allowed) {
                    logger.warn("queue process secret mode blocked by IP allowlist", { ip })
                    return NextResponse.json({ error: "来源 IP 未授权" }, { status: 403 })
                }
            } else if (!isProd) {
                logger.warn("queue process secret mode without IP allowlist (non-production only)", { ip })
            }
        }

        const rate = await checkRateLimit({
            key: `queue:process:${hasValidSecret ? "secret" : "admin"}:${ip}`,
            limit: hasValidSecret ? 60 : 20,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return NextResponse.json(
                { error: "请求过于频繁，请稍后重试" },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(rate.retryAfterSeconds),
                        "X-RateLimit-Limit": String(rate.limit),
                        "X-RateLimit-Remaining": String(rate.remaining),
                        "X-RateLimit-Reset": String(Math.floor(rate.resetAt.getTime() / 1000)),
                    },
                }
            )
        }
        let tenantIdFilter: string | undefined
        if (!hasValidSecret) {
            const ctx = await getActiveTenantContextOrThrow({ requireRole: TenantMembershipRole.ADMIN })
            tenantIdFilter = ctx.tenantId
        }

        const url = new URL(request.url)
        const getParam = (key: string) => {
            const v = url.searchParams.get(key)
            return v === null ? undefined : v
        }

        const parsedQuery = z
            .object({
                max: z.coerce.number().int().min(1).max(50).optional(),
                take: z.coerce.number().int().min(1).max(50).optional(),
                budgetMs: z.coerce.number().int().min(500).max(25_000).optional(),
                type: z.string().trim().optional(),
                tenantId: z.string().trim().optional(),
                cleanupMax: z.coerce.number().int().min(0).max(50).optional(),
                healthMax: z.coerce.number().int().min(0).max(50).optional(),
                auditMax: z.coerce.number().int().min(0).max(50).optional(),
                webhookMax: z.coerce.number().int().min(0).max(50).optional(),
                emailMax: z.coerce.number().int().min(0).max(50).optional(),
                healthCheck: z.string().trim().optional(),
                mode: z.enum(["balanced", "legacy"]).optional(),
            })
            .strict()
            .safeParse({
                max: getParam("max"),
                take: getParam("take"),
                budgetMs: getParam("budgetMs"),
                type: getParam("type"),
                tenantId: getParam("tenantId"),
                cleanupMax: getParam("cleanupMax"),
                healthMax: getParam("healthMax"),
                auditMax: getParam("auditMax"),
                webhookMax: getParam("webhookMax"),
                emailMax: getParam("emailMax"),
                healthCheck: getParam("healthCheck"),
                mode: getParam("mode"),
            })

        if (!parsedQuery.success) {
            return NextResponse.json({ error: parsedQuery.error.issues[0]?.message || "参数校验失败" }, { status: 400 })
        }

        const query = parsedQuery.data

        const typeFilterRaw = (query.type || "").trim()
        const typeFilter = typeFilterRaw ? parseTaskType(typeFilterRaw) : null
        if (typeFilterRaw && !typeFilter) {
            return NextResponse.json({ error: "未知任务类型" }, { status: 400 })
        }

        const allowGlobalSecretMode =
            process.env.NODE_ENV !== "production" && (process.env.QUEUE_PROCESS_ALLOW_GLOBAL || "").trim() === "1"

        if (hasValidSecret) {
            const requestedTenantId = (query.tenantId || "").trim()
            if (requestedTenantId) {
                tenantIdFilter = requestedTenantId
            } else if (!allowGlobalSecretMode) {
                return NextResponse.json(
                    { error: "secret 模式必须指定 tenantId（生产环境禁止全局模式）" },
                    { status: 400 }
                )
            } else {
                logger.warn("queue process running in global secret mode (non-production only)", { ip })
            }
        }

        const maxJobs = query.max ?? query.take ?? 1
        const timeBudgetMs = query.budgetMs ?? 20_000

        const filter = tenantIdFilter || typeFilter ? { tenantId: tenantIdFilter, type: typeFilter ?? undefined } : undefined
        const mode = typeFilter ? "single-type" : query.mode || "balanced"

        const healthCheckRequested = (() => {
            const raw = (query.healthCheck || "").trim().toLowerCase()
            return raw === "1" || raw === "true"
        })()
 
        let healthCheckEnqueued = 0
        let kanbanHealthCheckEnqueued = 0
        if (healthCheckRequested) {
            const minuteKey = new Date().toISOString().slice(0, 16)

            const enqueueForTenant = async (tid: string) => {
                await queue.enqueue(TaskType.QUEUE_HEALTH_CHECK, {}, {
                    tenantId: tid,
                    priority: QUEUE_TASK_PRIORITY[TaskType.QUEUE_HEALTH_CHECK],
                    idempotencyKey: `queue-health/${minuteKey}`,
                    maxAttempts: 3,
                })
                healthCheckEnqueued += 1

                await queue.enqueue(TaskType.KANBAN_HEALTH_CHECK, {}, {
                    tenantId: tid,
                    priority: QUEUE_TASK_PRIORITY[TaskType.KANBAN_HEALTH_CHECK],
                    idempotencyKey: `kanban-health/${minuteKey}`,
                    maxAttempts: 3,
                })
                kanbanHealthCheckEnqueued += 1
            }

            if (tenantIdFilter) {
                await enqueueForTenant(tenantIdFilter)
            } else if (hasValidSecret && allowGlobalSecretMode) {
                const pageSize = 200
                let cursor: string | null = null

                while (true) {
                    const rows: Array<{ id: string }> = await prisma.tenant.findMany({
                        select: { id: true },
                        orderBy: { id: "asc" },
                        take: pageSize,
                        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
                    })

                    if (rows.length === 0) break

                    for (const row of rows) {
                        await enqueueForTenant(row.id)
                    }

                    cursor = rows[rows.length - 1]?.id ?? null
                    if (!cursor) break
                }
            }
        }

        const batch =
            mode === "legacy" || typeFilter
                ? await queue.processBatch({ maxJobs, timeBudgetMs, filter })
                : await queue.processBalancedBatch({
                      maxJobs,
                      timeBudgetMs,
                      filter: tenantIdFilter ? { tenantId: tenantIdFilter } : undefined,
                      policy: {
                          ...(typeof query.cleanupMax === "number" ? { cleanupMax: query.cleanupMax } : {}),
                          ...(typeof query.healthMax === "number" ? { healthMax: query.healthMax } : {}),
                          ...(typeof query.auditMax === "number" ? { auditMax: query.auditMax } : {}),
                          ...(typeof query.webhookMax === "number" ? { webhookMax: query.webhookMax } : {}),
                          ...(typeof query.emailMax === "number" ? { emailMax: query.emailMax } : {}),
                      },
                  })

        const hasFailure = batch.results.some((r) => r.processed && r.status === "FAILED")
        return NextResponse.json(
            {
                ...batch,
                mode,
                ...(healthCheckRequested ? { healthCheckEnqueued, kanbanHealthCheckEnqueued } : {}),
                ...(mode === "balanced"
                    ? {
                          policy: {
                              ...(typeof query.cleanupMax === "number" ? { cleanupMax: query.cleanupMax } : {}),
                              ...(typeof query.healthMax === "number" ? { healthMax: query.healthMax } : {}),
                              ...(typeof query.auditMax === "number" ? { auditMax: query.auditMax } : {}),
                              ...(typeof query.webhookMax === "number" ? { webhookMax: query.webhookMax } : {}),
                              ...(typeof query.emailMax === "number" ? { emailMax: query.emailMax } : {}),
                          },
                      }
                    : {}),
            },
            { status: hasFailure ? 500 : 200 }
        )
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json({ error: getPublicActionErrorMessage(error, "请先登录") }, { status: 401 })
        }
        if (error instanceof PermissionError) {
            return NextResponse.json({ error: getPublicActionErrorMessage(error, "权限不足") }, { status: 403 })
        }
        logger.error("队列处理失败", error, { url: request.url })
        return NextResponse.json({ error: "队列处理失败" }, { status: 500 })
    }
}
