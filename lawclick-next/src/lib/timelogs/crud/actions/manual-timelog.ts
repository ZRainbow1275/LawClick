import "server-only"

import { Prisma, TimeLogStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"

import type { ActionResponse } from "@/lib/action-response"
import { enforceActionRateLimit } from "@/lib/action-rate-limit"
import { logger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { getActiveTenantContextOrThrow, requireCaseAccess, requireTenantPermission } from "@/lib/server-auth"
import { resolveCaseIdForTaskTimeLog } from "@/lib/timelogs/crud/timelog-crud-helpers"
import { AddManualTimeLogInputSchema } from "@/lib/timelogs/crud/timelog-crud-schemas"

export async function addManualTimeLogImpl(input: {
    caseId?: string
    taskId?: string
    description: string
    startTime: string
    endTime: string
    isBillable?: boolean
}): Promise<ActionResponse> {
    try {
        const parsed = AddManualTimeLogInputSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        const request = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:view")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "timelogs.manual.add",
            limit: 60,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

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
        } else if (caseId) {
            await requireCaseAccess(caseId, user, "case:view")
        }

        if (!caseId) {
            return { success: false, error: "工时记录必须关联案件/任务" }
        }

        const startTime = request.startTime
        const endTime = request.endTime

        const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000)
        const isBillable = request.isBillable ?? true
        const billingRate = isBillable ? user.hourlyRate : null
        const billingAmount = billingRate ? billingRate.mul(new Prisma.Decimal(duration)).div(new Prisma.Decimal(3600)) : null

        await prisma.timeLog.create({
            data: {
                tenantId,
                userId: user.id,
                caseId,
                taskId,
                description: request.description,
                startTime,
                endTime,
                duration,
                isBillable,
                status: TimeLogStatus.COMPLETED,
                billingRate,
                billingAmount,
            },
        })

        revalidatePath("/timelog")
        revalidatePath("/time")
        if (caseId) revalidatePath(`/cases/${caseId}`)

        return { success: true }
    } catch (error) {
        logger.error("添加工时失败", error)
        return { success: false, error: "添加工时失败" }
    }
}

