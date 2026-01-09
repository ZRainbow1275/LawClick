import "server-only"

import { Prisma, TimeLogStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"

import type { ActionResponse } from "@/lib/action-response"
import { enforceActionRateLimit } from "@/lib/action-rate-limit"
import { logger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { getActiveTenantContextOrThrow, requireCaseAccess, requireTenantPermission } from "@/lib/server-auth"
import { UuidSchema } from "@/lib/zod"
import { resolveCaseIdForTaskTimeLog } from "@/lib/timelogs/crud/timelog-crud-helpers"
import { UpdateTimeLogInputSchema } from "@/lib/timelogs/crud/timelog-crud-schemas"
import type { UpdateTimeLogInput } from "@/lib/timelogs/crud/timelog-crud-types"

export async function updateTimeLogImpl(input: UpdateTimeLogInput): Promise<ActionResponse> {
    try {
        const parsed = UpdateTimeLogInputSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        input = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:view")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "timelogs.update",
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        const timeLog = await prisma.timeLog.findFirst({
            where: { id: input.id, tenantId },
        })

        if (!timeLog) return { success: false, error: "工时记录不存在" }
        if (timeLog.userId !== user.id) return { success: false, error: "无权操作" }
        if (timeLog.status === TimeLogStatus.APPROVED || timeLog.status === TimeLogStatus.BILLED) {
            return { success: false, error: "已审批/已计费的工时不可修改" }
        }

        const normalizeOptionalId = (value: string | null | undefined) => {
            if (value === undefined) return undefined
            if (value === null) return null
            const trimmed = value.trim()
            return trimmed ? trimmed : null
        }

        const requestedTaskId = normalizeOptionalId(input.taskId)
        const requestedCaseId = normalizeOptionalId(input.caseId)

        let nextTaskId: string | null = timeLog.taskId
        let nextCaseId: string | null = timeLog.caseId

        if (requestedTaskId !== undefined) {
            if (requestedTaskId === null) {
                nextTaskId = null
            } else {
                const resolved = await resolveCaseIdForTaskTimeLog(requestedTaskId, user, tenantId)
                if (!resolved.success) {
                    return { success: false, error: resolved.error }
                }
                if (requestedCaseId && requestedCaseId !== resolved.caseId) {
                    return { success: false, error: "任务不属于该案件" }
                }
                nextTaskId = requestedTaskId
                nextCaseId = resolved.caseId
            }
        }

        if (requestedCaseId !== undefined && (requestedTaskId === undefined || requestedTaskId === null)) {
            if (requestedCaseId === null) {
                nextCaseId = null
            } else {
                await requireCaseAccess(requestedCaseId, user, "case:view")
                nextCaseId = requestedCaseId
            }
        }

        if (!nextCaseId) {
            return { success: false, error: "工时必须关联案件/任务" }
        }

        if ((input.startTime || input.endTime) && timeLog.status !== TimeLogStatus.COMPLETED) {
            return { success: false, error: "仅已完成的工时记录可修改时间段" }
        }

        const data: Prisma.TimeLogUncheckedUpdateInput = {}

        if (typeof input.description === "string") data.description = input.description
        if (typeof input.isBillable === "boolean") data.isBillable = input.isBillable
        if (requestedTaskId !== undefined) data.taskId = nextTaskId
        if (requestedCaseId !== undefined || (requestedTaskId !== undefined && requestedTaskId !== null)) {
            data.caseId = nextCaseId
        }

        let nextDuration = timeLog.duration
        if (timeLog.status === TimeLogStatus.COMPLETED && (input.startTime || input.endTime)) {
            const startTime = input.startTime ? new Date(input.startTime) : timeLog.startTime
            const endTime = input.endTime ? new Date(input.endTime) : timeLog.endTime ? new Date(timeLog.endTime) : null

            if (!endTime || Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
                return { success: false, error: "无效的时间段" }
            }
            if (endTime.getTime() <= startTime.getTime()) {
                return { success: false, error: "结束时间必须晚于开始时间" }
            }

            nextDuration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000)
            data.startTime = startTime
            data.endTime = endTime
            data.duration = nextDuration
        }

        const nextIsBillable = typeof input.isBillable === "boolean" ? input.isBillable : timeLog.isBillable
        if (timeLog.status === TimeLogStatus.COMPLETED && (input.isBillable !== undefined || input.startTime || input.endTime)) {
            const billingRate = nextIsBillable ? (timeLog.billingRate ?? user.hourlyRate) : null
            const billingAmount = billingRate ? billingRate.mul(new Prisma.Decimal(nextDuration)).div(new Prisma.Decimal(3600)) : null

            data.billingRate = billingRate
            data.billingAmount = billingAmount
        }

        const updated = await prisma.timeLog.updateMany({
            where: { id: input.id, tenantId, userId: user.id },
            data,
        })
        if (updated.count === 0) return { success: false, error: "工时记录不存在" }

        revalidatePath("/timelog")
        revalidatePath("/time")
        if (timeLog.caseId) revalidatePath(`/cases/${timeLog.caseId}`)
        if (nextCaseId && nextCaseId !== timeLog.caseId) revalidatePath(`/cases/${nextCaseId}`)

        return { success: true }
    } catch (error) {
        logger.error("更新工时记录失败", error)
        return { success: false, error: "更新工时记录失败" }
    }
}

export async function deleteTimeLogImpl(timeLogId: string): Promise<ActionResponse> {
    try {
        const parsedId = UuidSchema.safeParse(timeLogId)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败" }
        }
        timeLogId = parsedId.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:view")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "timelogs.delete",
            limit: 60,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        const timeLog = await prisma.timeLog.findFirst({
            where: { id: timeLogId, tenantId },
            select: { id: true, userId: true, status: true, caseId: true },
        })

        if (!timeLog) return { success: false, error: "工时记录不存在" }
        if (timeLog.userId !== user.id) return { success: false, error: "无权操作" }
        if (timeLog.status === TimeLogStatus.APPROVED || timeLog.status === TimeLogStatus.BILLED) {
            return { success: false, error: "已审批/已计费的工时不可删除" }
        }

        const deleted = await prisma.timeLog.deleteMany({ where: { id: timeLogId, tenantId, userId: user.id } })
        if (deleted.count === 0) return { success: false, error: "工时记录不存在" }

        revalidatePath("/timelog")
        revalidatePath("/time")
        if (timeLog.caseId) revalidatePath(`/cases/${timeLog.caseId}`)

        return { success: true }
    } catch (error) {
        logger.error("删除工时记录失败", error)
        return { success: false, error: "删除工时记录失败" }
    }
}

