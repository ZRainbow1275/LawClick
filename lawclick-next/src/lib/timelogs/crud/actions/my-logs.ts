import "server-only"

import type { Prisma } from "@prisma/client"
import { z } from "zod"

import type { ActionResponse } from "@/lib/action-response"
import { enforceActionRateLimit } from "@/lib/action-rate-limit"
import { logger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { getActiveTenantContextOrThrow, requireCaseAccess, requireTenantPermission } from "@/lib/server-auth"
import { resolveCaseIdForTaskTimeLog } from "@/lib/timelogs/crud/timelog-crud-helpers"
import { GetMyTimeLogsInputSchema } from "@/lib/timelogs/crud/timelog-crud-schemas"
import type { GetMyTimeLogsInput, TimeLogListItem } from "@/lib/timelogs/crud/timelog-crud-types"

type ActionWithFallback<T extends object> = ActionResponse<T, T>
type GetMyTimeLogsRequest = z.infer<typeof GetMyTimeLogsInputSchema>

type BuildMyTimeLogsQueryResult =
    | { success: true; where: Prisma.TimeLogWhereInput; take: number }
    | { success: false; error: string }

async function buildMyTimeLogsQueryForViewer(args: {
    request: GetMyTimeLogsRequest
    user: Awaited<ReturnType<typeof getActiveTenantContextOrThrow>>["user"]
    tenantId: string
}): Promise<BuildMyTimeLogsQueryResult> {
    const { request, user, tenantId } = args

    const from = request.from
    const to = request.to

    let caseId: string | null = request.caseId ?? null
    const taskId = request.taskId ?? null

    if (taskId) {
        const resolved = await resolveCaseIdForTaskTimeLog(taskId, user, tenantId)
        if (!resolved.success) {
            return { success: false, error: resolved.error }
        }
        if (caseId && caseId !== resolved.caseId) {
            return { success: false, error: "任务不属于该案件" }
        }
        caseId = resolved.caseId
    }

    if (caseId) {
        await requireCaseAccess(caseId, user, "case:view")
    }

    const where: Prisma.TimeLogWhereInput = {
        tenantId,
        userId: user.id,
        startTime: { gte: from, lt: to },
    }

    if (request.status?.length) {
        where.status = { in: request.status }
    }
    if (caseId) where.caseId = caseId
    if (taskId) where.taskId = taskId

    return { success: true, where, take: request.take ?? 200 }
}

export async function getMyTimeLogsMetaImpl(
    input: GetMyTimeLogsInput
): Promise<ActionWithFallback<{ total: number; limit: number; hasMore: boolean }>> {
    try {
        const parsed = GetMyTimeLogsInputSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败", total: 0, limit: 0, hasMore: false }
        }
        const request = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:view")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "timelogs.my.meta",
            limit: 600,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return { success: false, error: rate.error, total: 0, limit: request.take ?? 200, hasMore: false }
        }

        const query = await buildMyTimeLogsQueryForViewer({ request, user, tenantId })
        if (!query.success) {
            return { success: false, error: query.error, total: 0, limit: request.take ?? 200, hasMore: false }
        }

        const total = await prisma.timeLog.count({ where: query.where })
        const limit = query.take
        const hasMore = total > limit

        return { success: true, total, limit, hasMore }
    } catch (error) {
        logger.error("获取工时记录统计失败", error)
        return { success: false, error: "获取工时记录统计失败", total: 0, limit: 0, hasMore: false }
    }
}

export async function getMyTimeLogsImpl(input: GetMyTimeLogsInput): Promise<ActionWithFallback<{ data: TimeLogListItem[] }>> {
    try {
        const parsed = GetMyTimeLogsInputSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败", data: [] }
        }
        const request = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:view")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "timelogs.my.list",
            limit: 600,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error, data: [] }

        const query = await buildMyTimeLogsQueryForViewer({ request, user, tenantId })
        if (!query.success) {
            return { success: false, error: query.error, data: [] }
        }

        const logs = await prisma.timeLog.findMany({
            where: query.where,
            orderBy: { startTime: "desc" },
            take: query.take,
            include: {
                case: { select: { id: true, title: true, caseCode: true } },
                task: { select: { id: true, title: true } },
            },
        })

        const safeLogs = logs.map((log) => ({
            id: log.id,
            description: log.description,
            startTime: log.startTime,
            endTime: log.endTime,
            duration: log.duration,
            status: log.status,
            isBillable: log.isBillable,
            userId: log.userId,
            caseId: log.caseId,
            taskId: log.taskId,
            billingRate: log.billingRate ? Number(log.billingRate) : null,
            billingAmount: log.billingAmount ? Number(log.billingAmount) : null,
            case: log.case,
            task: log.task,
        })) satisfies TimeLogListItem[]

        return { success: true, data: safeLogs }
    } catch (error) {
        logger.error("获取工时记录失败", error)
        return { success: false, error: "获取工时记录失败", data: [] }
    }
}

