import "server-only"

import type { Prisma } from "@prisma/client"

import type { ActionResponse } from "@/lib/action-response"
import { enforceActionRateLimit } from "@/lib/action-rate-limit"
import { logger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { getActiveTenantContextOrThrow, requireCaseAccess, requireTenantPermission } from "@/lib/server-auth"
import { UuidSchema } from "@/lib/zod"
import { GetCaseTimeLogsInputSchema } from "@/lib/timelogs/crud/timelog-crud-schemas"
import type { CaseTimeLogListItem, GetCaseTimeLogsInput } from "@/lib/timelogs/crud/timelog-crud-types"

type ActionWithFallback<T extends object> = ActionResponse<T, T>

export async function getCaseTimeLogsImpl(
    caseId: string
): Promise<
    | { success: true; data: CaseTimeLogListItem[] }
    | { success: false; data: CaseTimeLogListItem[]; error: string }
> {
    const parsedId = UuidSchema.safeParse(caseId)
    if (!parsedId.success) {
        return {
            success: false as const,
            data: [] as CaseTimeLogListItem[],
            error: "输入校验失败",
        }
    }
    caseId = parsedId.data

    const ctx = await getActiveTenantContextOrThrow()
    requireTenantPermission(ctx, "case:view")
    const { user, tenantId } = ctx

    const rate = await enforceActionRateLimit({
        tenantId,
        userId: user.id,
        action: "timelogs.case.logs",
        limit: 600,
        windowMs: 60_000,
        extraKey: caseId,
    })
    if (!rate.allowed) {
        return {
            success: false as const,
            data: [] as CaseTimeLogListItem[],
            error: rate.error,
        }
    }

    const res = await getCaseTimeLogsPageImpl({ caseId, take: 200 })
    if (res.success) {
        return { success: true as const, data: res.data }
    }
    return { success: false as const, data: res.data, error: res.error || "获取案件工时失败" }
}

export async function getCaseTimeLogsPageImpl(
    input: GetCaseTimeLogsInput
): Promise<ActionWithFallback<{ data: CaseTimeLogListItem[]; nextCursor: string | null }>> {
    try {
        const parsed = GetCaseTimeLogsInputSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败", data: [], nextCursor: null }
        }
        const request = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:view")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "timelogs.case.logs.page",
            limit: 600,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return { success: false, error: rate.error, data: [], nextCursor: null }
        }
        await requireCaseAccess(request.caseId, user, "case:view")

        const take = request.take ?? 50

        const where: Prisma.TimeLogWhereInput = {
            tenantId,
            caseId: request.caseId,
        }

        if (request.status?.length) {
            where.status = { in: request.status }
        }
        if (request.from && request.to) {
            where.startTime = { gte: request.from, lt: request.to }
        } else if (request.from) {
            where.startTime = { gte: request.from }
        } else if (request.to) {
            where.startTime = { lt: request.to }
        }

        const logs = await prisma.timeLog.findMany({
            where,
            orderBy: [{ startTime: "desc" }, { id: "desc" }],
            take: take + 1,
            ...(request.cursor ? { cursor: { id: request.cursor }, skip: 1 } : {}),
            select: {
                id: true,
                description: true,
                startTime: true,
                endTime: true,
                duration: true,
                status: true,
                isBillable: true,
                billingRate: true,
                billingAmount: true,
                user: { select: { id: true, name: true, email: true } },
                task: { select: { id: true, title: true } },
            },
        })

        const hasMore = logs.length > take
        const page = hasMore ? logs.slice(0, take) : logs
        const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null

        const data = page.map((log) => ({
            id: log.id,
            description: log.description,
            startTime: log.startTime,
            endTime: log.endTime,
            duration: log.duration,
            status: log.status,
            isBillable: log.isBillable,
            billingRate: log.billingRate ? Number(log.billingRate) : null,
            billingAmount: log.billingAmount ? Number(log.billingAmount) : null,
            user: log.user,
            task: log.task,
        })) satisfies CaseTimeLogListItem[]

        return { success: true, data, nextCursor }
    } catch (error) {
        logger.error("获取工时列表失败", error)
        return { success: false, error: "获取工时列表失败", data: [], nextCursor: null }
    }
}
