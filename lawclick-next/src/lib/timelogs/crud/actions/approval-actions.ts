import "server-only"

import { Prisma, TimeLogStatus, type Prisma as PrismaTypes } from "@prisma/client"
import { revalidatePath } from "next/cache"

import type { ActionResponse } from "@/lib/action-response"
import { enforceActionRateLimit } from "@/lib/action-rate-limit"
import { logger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { getActiveTenantContextOrThrow, getCaseListAccessWhereOrThrow, requireCaseAccess, requireTenantPermission } from "@/lib/server-auth"
import { UuidSchema } from "@/lib/zod"
import { GetTimeLogsPendingApprovalInputSchema } from "@/lib/timelogs/crud/timelog-crud-schemas"
import type { TimeLogApprovalItem } from "@/lib/timelogs/crud/timelog-crud-types"

type ActionWithFallback<T extends object> = ActionResponse<T, T>

export async function getTimeLogsPendingApprovalImpl(input?: {
    from?: string | Date
    to?: string | Date
    take?: number
    status?: TimeLogStatus[]
}): Promise<ActionWithFallback<{ data: TimeLogApprovalItem[] }>> {
    try {
        const parsed = GetTimeLogsPendingApprovalInputSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败", data: [] }
        }
        const request = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "timelog:approve")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "timelogs.approval.list",
            limit: 600,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error, data: [] }

        const statusFilter: TimeLogStatus[] = request?.status && request.status.length ? request.status : [TimeLogStatus.COMPLETED]

        const where: PrismaTypes.TimeLogWhereInput = {
            tenantId,
            status: { in: statusFilter },
        }

        const from = request?.from ?? null
        const to = request?.to ?? null
        if (from && to) {
            where.startTime = { gte: from, lt: to }
        }

        if (user.role !== "PARTNER" && user.role !== "ADMIN") {
            where.caseId = { not: null }
            where.case = getCaseListAccessWhereOrThrow(user, "case:view")
        }

        const logs = await prisma.timeLog.findMany({
            where,
            orderBy: { startTime: "desc" },
            take: request?.take ?? 100,
            include: {
                user: { select: { id: true, name: true, email: true } },
                case: { select: { id: true, title: true, caseCode: true } },
                task: { select: { id: true, title: true } },
            },
        })

        const safeLogs = logs.map((log) => ({
            ...log,
            billingRate: log.billingRate ? Number(log.billingRate) : null,
            billingAmount: log.billingAmount ? Number(log.billingAmount) : null,
        }))

        return { success: true, data: safeLogs }
    } catch (error) {
        logger.error("获取待审批工时失败", error)
        return { success: false, error: "获取待审批工时失败", data: [] }
    }
}

export async function approveTimeLogImpl(timeLogId: string): Promise<ActionResponse> {
    try {
        const parsedId = UuidSchema.safeParse(timeLogId)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败" }
        }
        timeLogId = parsedId.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "timelog:approve")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "timelogs.approval.approve",
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        const timeLog = await prisma.timeLog.findFirst({
            where: { id: timeLogId, tenantId },
            include: { user: { select: { hourlyRate: true } } },
        })

        if (!timeLog) return { success: false, error: "工时记录不存在" }
        if (timeLog.status !== TimeLogStatus.COMPLETED) return { success: false, error: "仅已完成的工时记录可审批" }
        if (timeLog.caseId) {
            await requireCaseAccess(timeLog.caseId, user, "case:view")
        }

        const billingRate = timeLog.isBillable ? (timeLog.billingRate ?? timeLog.user.hourlyRate) : null
        const billingAmount = billingRate ? billingRate.mul(new Prisma.Decimal(timeLog.duration)).div(new Prisma.Decimal(3600)) : null

        const updated = await prisma.timeLog.updateMany({
            where: { id: timeLogId, tenantId },
            data: {
                status: TimeLogStatus.APPROVED,
                billingRate,
                billingAmount,
            },
        })
        if (updated.count === 0) return { success: false, error: "工时记录不存在" }

        revalidatePath("/timelog")
        revalidatePath("/time")
        if (timeLog.caseId) revalidatePath(`/cases/${timeLog.caseId}`)

        return { success: true }
    } catch (error) {
        logger.error("审批工时失败", error)
        return { success: false, error: "审批工时失败" }
    }
}

export async function unapproveTimeLogImpl(timeLogId: string): Promise<ActionResponse> {
    try {
        const parsedId = UuidSchema.safeParse(timeLogId)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败" }
        }
        timeLogId = parsedId.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "timelog:approve")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "timelogs.approval.unapprove",
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        const timeLog = await prisma.timeLog.findFirst({
            where: { id: timeLogId, tenantId },
            select: { id: true, status: true, caseId: true },
        })

        if (!timeLog) return { success: false, error: "工时记录不存在" }
        if (timeLog.status !== TimeLogStatus.APPROVED) return { success: false, error: "仅已审批的工时记录可撤销" }
        if (timeLog.caseId) {
            await requireCaseAccess(timeLog.caseId, user, "case:view")
        }

        const updated = await prisma.timeLog.updateMany({
            where: { id: timeLogId, tenantId, status: TimeLogStatus.APPROVED },
            data: { status: TimeLogStatus.COMPLETED },
        })
        if (updated.count === 0) return { success: false, error: "工时记录不存在" }

        revalidatePath("/timelog")
        revalidatePath("/time")
        if (timeLog.caseId) revalidatePath(`/cases/${timeLog.caseId}`)

        return { success: true }
    } catch (error) {
        logger.error("撤销审批失败", error)
        return { success: false, error: "撤销审批失败" }
    }
}

export async function markTimeLogBilledImpl(timeLogId: string): Promise<ActionResponse> {
    try {
        const parsedId = UuidSchema.safeParse(timeLogId)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败" }
        }
        timeLogId = parsedId.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "timelog:approve")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "timelogs.approval.markBilled",
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        const timeLog = await prisma.timeLog.findFirst({
            where: { id: timeLogId, tenantId },
            select: { id: true, status: true, caseId: true },
        })

        if (!timeLog) return { success: false, error: "工时记录不存在" }
        if (timeLog.status !== TimeLogStatus.APPROVED) return { success: false, error: "仅已审批的工时记录可计费" }
        if (timeLog.caseId) {
            await requireCaseAccess(timeLog.caseId, user, "case:view")
        }

        const updated = await prisma.timeLog.updateMany({
            where: { id: timeLogId, tenantId, status: TimeLogStatus.APPROVED },
            data: { status: TimeLogStatus.BILLED },
        })
        if (updated.count === 0) return { success: false, error: "工时记录不存在" }

        revalidatePath("/timelog")
        revalidatePath("/time")
        if (timeLog.caseId) revalidatePath(`/cases/${timeLog.caseId}`)

        return { success: true }
    } catch (error) {
        logger.error("标记计费失败", error)
        return { success: false, error: "标记计费失败" }
    }
}

export async function unmarkTimeLogBilledImpl(timeLogId: string): Promise<ActionResponse> {
    try {
        const parsedId = UuidSchema.safeParse(timeLogId)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败" }
        }
        timeLogId = parsedId.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "timelog:approve")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "timelogs.approval.unmarkBilled",
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        const timeLog = await prisma.timeLog.findFirst({
            where: { id: timeLogId, tenantId },
            select: { id: true, status: true, caseId: true },
        })

        if (!timeLog) return { success: false, error: "工时记录不存在" }
        if (timeLog.status !== TimeLogStatus.BILLED) return { success: false, error: "仅已计费的工时记录可撤销" }
        if (timeLog.caseId) {
            await requireCaseAccess(timeLog.caseId, user, "case:view")
        }

        const updated = await prisma.timeLog.updateMany({
            where: { id: timeLogId, tenantId, status: TimeLogStatus.BILLED },
            data: { status: TimeLogStatus.APPROVED },
        })
        if (updated.count === 0) return { success: false, error: "工时记录不存在" }

        revalidatePath("/timelog")
        revalidatePath("/time")
        if (timeLog.caseId) revalidatePath(`/cases/${timeLog.caseId}`)

        return { success: true }
    } catch (error) {
        logger.error("撤销计费失败", error)
        return { success: false, error: "撤销计费失败" }
    }
}

