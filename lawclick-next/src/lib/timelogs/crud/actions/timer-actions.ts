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
import { StartTimerInputSchema } from "@/lib/timelogs/crud/timelog-crud-schemas"
import { ACTIVE_TIMER_INCLUDE, type ActiveTimer, type StartTimerInput } from "@/lib/timelogs/crud/timelog-crud-types"

const ACTIVE_TIMER_STATUSES: TimeLogStatus[] = [TimeLogStatus.RUNNING, TimeLogStatus.PAUSED]

export async function startTimerImpl(input: StartTimerInput): Promise<ActionResponse<{ timeLogId: string }>> {
    try {
        const parsed = StartTimerInputSchema.safeParse(input)
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
            action: "timelogs.timer.start",
            limit: 30,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        let caseId: string | null = input.caseId ?? null
        const taskId = input.taskId ?? null

        if (taskId) {
            const resolved = await resolveCaseIdForTaskTimeLog(taskId, user, tenantId)
            if (!resolved.success) {
                return { success: false, error: resolved.error }
            }
            if (caseId && caseId !== resolved.caseId) {
                return { success: false, error: "任务不属于该案件" }
            }
            caseId = resolved.caseId
        } else if (caseId) {
            await requireCaseAccess(caseId, user, "case:view")
        }

        if (!caseId) {
            return { success: false, error: "计时必须关联案件/任务" }
        }

        const activeTimer = await prisma.timeLog.findFirst({
            where: {
                tenantId,
                userId: user.id,
                status: { in: ACTIVE_TIMER_STATUSES },
            },
        })

        if (activeTimer) {
            return { success: false, error: "您有正在进行的计时，请先停止" }
        }

        const timeLog = await prisma.timeLog.create({
            data: {
                tenantId,
                userId: user.id,
                caseId,
                taskId,
                description: input.description,
                isBillable: input.isBillable ?? true,
                status: TimeLogStatus.RUNNING,
                startTime: new Date(),
            },
        })

        revalidatePath("/timelog")
        revalidatePath("/time")
        if (caseId) revalidatePath(`/cases/${caseId}`)

        return { success: true, timeLogId: timeLog.id }
    } catch (error) {
        logger.error("开始计时失败", error)
        return { success: false, error: "开始计时失败" }
    }
}

export async function stopTimerImpl(timeLogId: string): Promise<ActionResponse<{ duration: number }>> {
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
            action: "timelogs.timer.stop",
            limit: 60,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        const timeLog = await prisma.timeLog.findFirst({
            where: { id: timeLogId, tenantId },
        })

        if (!timeLog) {
            return { success: false, error: "记录不存在" }
        }

        if (timeLog.userId !== user.id) {
            return { success: false, error: "无权操作" }
        }

        if (timeLog.status !== TimeLogStatus.RUNNING && timeLog.status !== TimeLogStatus.PAUSED) {
            return { success: false, error: "计时已停止" }
        }

        const endTime = new Date()
        const elapsed = timeLog.status === TimeLogStatus.RUNNING ? Math.floor((endTime.getTime() - timeLog.startTime.getTime()) / 1000) : 0
        const duration = timeLog.duration + elapsed

        const billingRate = timeLog.isBillable ? (timeLog.billingRate ?? user.hourlyRate) : null
        const billingAmount = billingRate ? billingRate.mul(new Prisma.Decimal(duration)).div(new Prisma.Decimal(3600)) : null

        const updated = await prisma.timeLog.updateMany({
            where: { id: timeLogId, tenantId, userId: user.id },
            data: {
                endTime,
                duration,
                status: TimeLogStatus.COMPLETED,
                billingRate,
                billingAmount,
            },
        })
        if (updated.count === 0) return { success: false, error: "记录不存在" }

        revalidatePath("/timelog")
        revalidatePath("/time")
        if (timeLog.caseId) revalidatePath(`/cases/${timeLog.caseId}`)

        return { success: true, duration }
    } catch (error) {
        logger.error("停止计时失败", error)
        return { success: false, error: "停止计时失败" }
    }
}

export async function pauseTimerImpl(timeLogId: string): Promise<ActionResponse> {
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
            action: "timelogs.timer.pause",
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        const timeLog = await prisma.timeLog.findFirst({
            where: { id: timeLogId, tenantId },
        })

        if (!timeLog || timeLog.userId !== user.id) {
            return { success: false, error: "无权操作" }
        }

        if (timeLog.status !== TimeLogStatus.RUNNING) {
            return { success: false, error: "计时未在进行中" }
        }

        const now = new Date()
        const elapsed = Math.floor((now.getTime() - timeLog.startTime.getTime()) / 1000)

        const updated = await prisma.timeLog.updateMany({
            where: { id: timeLogId, tenantId, userId: user.id },
            data: {
                duration: timeLog.duration + elapsed,
                status: TimeLogStatus.PAUSED,
            },
        })
        if (updated.count === 0) return { success: false, error: "记录不存在" }

        revalidatePath("/timelog")
        revalidatePath("/time")

        return { success: true }
    } catch (error) {
        logger.error("暂停计时失败", error)
        return { success: false, error: "暂停计时失败" }
    }
}

export async function resumeTimerImpl(timeLogId: string): Promise<ActionResponse> {
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
            action: "timelogs.timer.resume",
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        const timeLog = await prisma.timeLog.findFirst({
            where: { id: timeLogId, tenantId },
        })

        if (!timeLog || timeLog.userId !== user.id) {
            return { success: false, error: "无权操作" }
        }

        if (timeLog.status !== TimeLogStatus.PAUSED) {
            return { success: false, error: "计时未暂停" }
        }

        const updated = await prisma.timeLog.updateMany({
            where: { id: timeLogId, tenantId, userId: user.id },
            data: {
                startTime: new Date(),
                status: TimeLogStatus.RUNNING,
            },
        })
        if (updated.count === 0) return { success: false, error: "记录不存在" }

        revalidatePath("/timelog")
        revalidatePath("/time")

        return { success: true }
    } catch (error) {
        logger.error("恢复计时失败", error)
        return { success: false, error: "恢复计时失败" }
    }
}

export async function getActiveTimerImpl(): Promise<ActiveTimer> {
    try {
        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:view")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "timelogs.timer.active",
            limit: 600,
            windowMs: 60_000,
        })
        if (!rate.allowed) return null

        const timer = await prisma.timeLog.findFirst({
            where: {
                tenantId,
                userId: user.id,
                status: { in: ACTIVE_TIMER_STATUSES },
            },
            orderBy: { updatedAt: "desc" },
            include: ACTIVE_TIMER_INCLUDE,
        })

        return timer
    } catch (error) {
        logger.error("获取活动计时失败", error)
        return null
    }
}
