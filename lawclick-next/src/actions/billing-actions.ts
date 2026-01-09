"use server"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { getActiveTenantContextOrThrow, requireCaseAccess, requireTenantPermission } from "@/lib/server-auth"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { UuidSchema } from "@/lib/zod"
import type { ActionResponse } from "@/lib/action-response"
import { TimeLogStatus } from "@prisma/client"

// ==============================================================================
// 账务汇总类型
// ==============================================================================

export interface BillingSummary {
    totalHours: number
    billableHours: number
    totalAmount: number
    byUser: Array<{
        userId: string
        userName: string
        hours: number
        amount: number
    }>
}

export interface BillingDetail {
    id: string
    description: string
    date: Date
    hours: number
    rate: number
    amount: number
    userId: string
    userName: string
    isBillable: boolean
    status: string
}

// ==============================================================================
// 获取案件账务汇总
// ==============================================================================

export async function getCaseBilling(
    caseId: string
): Promise<ActionResponse<{ data: BillingSummary }, { data: null }>> {
    try {
        const parsedId = UuidSchema.safeParse(caseId)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败", data: null }
        }
        caseId = parsedId.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "billing:view")
        const { user, tenantId } = ctx

        const rate = await enforceRateLimit({ ctx, action: "billing.case.summary", limit: 240 })
        if (!rate.allowed) return { success: false, error: rate.error, data: null }

        await requireCaseAccess(caseId, user, "case:view")

        const baseWhere = {
            tenantId,
            caseId,
            status: { notIn: [TimeLogStatus.RUNNING, TimeLogStatus.PAUSED] },
        }
        const [totalAgg, billableAgg, byUserAgg] = await Promise.all([
            prisma.timeLog.aggregate({ where: baseWhere, _sum: { duration: true } }),
            prisma.timeLog.aggregate({
                where: { ...baseWhere, isBillable: true },
                _sum: { duration: true, billingAmount: true },
            }),
            prisma.timeLog.groupBy({
                by: ["userId"],
                where: { ...baseWhere, isBillable: true },
                _sum: { duration: true, billingAmount: true },
            }),
        ])

        const totalSeconds = totalAgg._sum?.duration ?? 0
        const billableSeconds = billableAgg._sum?.duration ?? 0

        const totalHours = totalSeconds / 3600
        const billableHours = billableSeconds / 3600
        const totalAmount = billableAgg._sum?.billingAmount ? Number(billableAgg._sum.billingAmount) : 0

        const userIds = byUserAgg.map((row) => row.userId)
        const users = userIds.length
            ? await prisma.user.findMany({
                  where: { id: { in: userIds } },
                  select: { id: true, name: true },
                  take: userIds.length,
              })
            : []
        const userNameById = new Map(users.map((u) => [u.id, u.name || "未知"]))

        const byUser = byUserAgg
            .map((row) => {
                const seconds = row._sum?.duration ?? 0
                const amount = row._sum?.billingAmount ? Number(row._sum.billingAmount) : 0
                return {
                    userId: row.userId,
                    userName: userNameById.get(row.userId) || "未知",
                    hours: Math.round((seconds / 3600) * 10) / 10,
                    amount: Math.round(amount * 100) / 100,
                }
            })
            .sort((a, b) => b.hours - a.hours)

        return {
            success: true,
            data: {
                totalHours: Math.round(totalHours * 10) / 10,
                billableHours: Math.round(billableHours * 10) / 10,
                totalAmount: Math.round(totalAmount * 100) / 100,
                byUser,
            },
        }
    } catch (error) {
        logger.error("获取账务汇总失败", error)
        return {
            success: false,
            error: getPublicActionErrorMessage(error, "获取账务汇总失败，请稍后重试"),
            data: null,
        }
    }
}

// ==============================================================================
// 获取账务明细
// ==============================================================================

export async function getCaseBillingDetails(
    caseId: string
): Promise<ActionResponse<{ data: BillingDetail[] }, { data: BillingDetail[] }>> {
    try {
        const parsedId = UuidSchema.safeParse(caseId)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败", data: [] }
        }
        caseId = parsedId.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "billing:view")
        const { user, tenantId } = ctx

        const rate = await enforceRateLimit({ ctx, action: "billing.case.details", limit: 240 })
        if (!rate.allowed) return { success: false, error: rate.error, data: [] }

        await requireCaseAccess(caseId, user, "case:view")

        const timeLogs = await prisma.timeLog.findMany({
            where: { tenantId, caseId, status: { notIn: ["RUNNING", "PAUSED"] } },
            include: { user: true },
            orderBy: { startTime: "desc" },
            take: 200,
        })

        const details: BillingDetail[] = timeLogs.map((log) => ({
            id: log.id,
            description: log.description || "工时记录",
            date: log.startTime,
            hours: log.duration ? Math.round((log.duration / 3600) * 10) / 10 : 0,
            rate: log.billingRate ? Number(log.billingRate) : 0,
            amount: log.billingAmount ? Number(log.billingAmount) : 0,
            userId: log.userId,
            userName: log.user?.name || "未知",
            isBillable: log.isBillable,
            status: log.status,
        }))

        return { success: true, data: details }
    } catch (error) {
        logger.error("获取账务明细失败", error)
        return {
            success: false,
            error: getPublicActionErrorMessage(error, "获取账务明细失败，请稍后重试"),
            data: [],
        }
    }
}
