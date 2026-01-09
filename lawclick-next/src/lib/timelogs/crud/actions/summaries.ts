import "server-only"

import { TimeLogStatus, type Prisma } from "@prisma/client"

import type { ActionResponse } from "@/lib/action-response"
import { enforceActionRateLimit } from "@/lib/action-rate-limit"
import { logger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { getActiveTenantContextOrThrow, requireCaseAccess, requireTenantPermission } from "@/lib/server-auth"
import { UuidSchema } from "@/lib/zod"
import { getActiveTimerImpl } from "@/lib/timelogs/crud/actions/timer-actions"
import type { ActiveTimer, TimeLogSummary } from "@/lib/timelogs/crud/timelog-crud-types"
import { GetMyTimeSummaryInputSchema } from "@/lib/timelogs/crud/timelog-crud-schemas"

type ActionWithFallback<T extends object> = ActionResponse<T, T>

export async function getCaseTimeSummaryImpl(caseId: string): Promise<ActionWithFallback<{ data: TimeLogSummary }>> {
    const fallback: TimeLogSummary = { totalSeconds: 0, totalHours: 0, billableSeconds: 0, billableHours: 0, count: 0 }

    try {
        const parsedId = UuidSchema.safeParse(caseId)
        if (!parsedId.success) {
            logger.warn("getCaseTimeSummary 输入校验失败", { issues: parsedId.error.flatten() })
            return { success: false, error: "输入校验失败", data: fallback }
        }
        caseId = parsedId.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:view")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "timelogs.case.summary",
            limit: 600,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error, data: fallback }

        await requireCaseAccess(caseId, user, "case:view")

        const where: Prisma.TimeLogWhereInput = {
            tenantId,
            caseId,
            status: { in: [TimeLogStatus.COMPLETED, TimeLogStatus.APPROVED, TimeLogStatus.BILLED] },
        }

        const [totalAgg, billableAgg] = await prisma.$transaction([
            prisma.timeLog.aggregate({
                where,
                _sum: { duration: true },
                _count: { _all: true },
            }),
            prisma.timeLog.aggregate({
                where: { ...where, isBillable: true },
                _sum: { duration: true },
            }),
        ])

        const totalSeconds = totalAgg._sum.duration ?? 0
        const billableSeconds = billableAgg._sum.duration ?? 0

        return {
            success: true,
            data: {
                totalSeconds,
                totalHours: Math.round((totalSeconds / 3600) * 100) / 100,
                billableSeconds,
                billableHours: Math.round((billableSeconds / 3600) * 100) / 100,
                count: totalAgg._count._all,
            },
        }
    } catch (error) {
        logger.error("获取工时汇总失败", error)
        return { success: false, error: "获取工时汇总失败", data: fallback }
    }
}

export async function getTodayTimeSummaryImpl(): Promise<
    ActionWithFallback<{ data: TimeLogSummary & { runningTimer: ActiveTimer } }>
> {
    const fallback = {
        totalSeconds: 0,
        totalHours: 0,
        billableSeconds: 0,
        billableHours: 0,
        count: 0,
        runningTimer: null,
    } satisfies TimeLogSummary & { runningTimer: ActiveTimer }

    try {
        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:view")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "timelogs.today.summary",
            limit: 600,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error, data: fallback }

        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const rows = await prisma.timeLog.groupBy({
            by: ["isBillable"],
            where: {
                tenantId,
                userId: user.id,
                startTime: { gte: today },
                status: { in: [TimeLogStatus.COMPLETED, TimeLogStatus.APPROVED, TimeLogStatus.BILLED] },
            },
            _sum: { duration: true },
            _count: { _all: true },
        })

        const runningTimer = await getActiveTimerImpl()

        const totalSeconds = rows.reduce((sum, row) => sum + (row._sum.duration ?? 0), 0)
        const billableSeconds = rows.find((row) => row.isBillable)?._sum.duration ?? 0
        const count = rows.reduce((sum, row) => sum + row._count._all, 0)

        return {
            success: true,
            data: {
                totalSeconds,
                totalHours: Math.round(totalSeconds / 36) / 100,
                billableSeconds,
                billableHours: Math.round(billableSeconds / 36) / 100,
                count,
                runningTimer,
            },
        }
    } catch (error) {
        logger.error("获取今日工时失败", error)
        return { success: false, error: "获取今日工时失败", data: fallback }
    }
}

export async function getMyTimeSummaryImpl(input: { from: string; to: string }): Promise<ActionWithFallback<{ data: TimeLogSummary }>> {
    try {
        const parsed = GetMyTimeSummaryInputSchema.safeParse(input)
        if (!parsed.success) {
            return {
                success: false,
                error: parsed.error.issues[0]?.message || "输入校验失败",
                data: { totalSeconds: 0, totalHours: 0, billableSeconds: 0, billableHours: 0, count: 0 },
            }
        }
        const { from, to } = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:view")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "timelogs.my.summary",
            limit: 600,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return {
                success: false,
                error: rate.error,
                data: { totalSeconds: 0, totalHours: 0, billableSeconds: 0, billableHours: 0, count: 0 },
            }
        }

        const rows = await prisma.timeLog.groupBy({
            by: ["isBillable"],
            where: {
                tenantId,
                userId: user.id,
                startTime: { gte: from, lt: to },
                status: { in: [TimeLogStatus.COMPLETED, TimeLogStatus.APPROVED, TimeLogStatus.BILLED] },
            },
            _sum: { duration: true },
            _count: { _all: true },
        })

        const totalSeconds = rows.reduce((sum, row) => sum + (row._sum.duration ?? 0), 0)
        const billableSeconds = rows.find((row) => row.isBillable)?._sum.duration ?? 0
        const count = rows.reduce((sum, row) => sum + row._count._all, 0)

        return {
            success: true,
            data: {
                totalSeconds,
                totalHours: Math.round(totalSeconds / 36) / 100,
                billableSeconds,
                billableHours: Math.round(billableSeconds / 36) / 100,
                count,
            },
        }
    } catch (error) {
        logger.error("获取工时汇总失败", error)
        return {
            success: false,
            error: "获取工时汇总失败",
            data: { totalSeconds: 0, totalHours: 0, billableSeconds: 0, billableHours: 0, count: 0 },
        }
    }
}

