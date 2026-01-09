"use server"

import { z } from "zod"

import { addManualTimeLog } from "@/actions/timelogs-crud"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { logger } from "@/lib/logger"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { AuthError, PermissionError, getActiveTenantContextOrThrow, requireTenantPermission } from "@/lib/server-auth"
import { DateInputSchema, UuidSchema } from "@/lib/zod"

function getOptionalFormString(formData: FormData, key: string): string | undefined {
    const value = formData.get(key)
    if (typeof value !== "string") return undefined
    const trimmed = value.trim()
    return trimmed ? trimmed : undefined
}

export async function createTimeLog(formData: FormData) {
    try {
        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:view")

        const rate = await enforceRateLimit({
            ctx,
            action: "timelogs.manual.create.form",
            limit: 600,
        })
        if (!rate.allowed) return { error: rate.error }
    } catch (error) {
        if (error instanceof AuthError) return { error: "请先登录" }
        if (error instanceof PermissionError) return { error: getPublicActionErrorMessage(error, "权限不足") }
        logger.error("创建工时记录失败", error)
        return { error: "创建失败" }
    }

    const parsed = z
        .object({
            description: z.string().trim().min(1, "描述不能为空").max(5000),
            durationMinutes: z.coerce.number().finite().int().min(1).max(24 * 60),
            startTime: DateInputSchema,
            caseId: UuidSchema,
        })
        .strict()
        .safeParse({
            description: getOptionalFormString(formData, "description"),
            durationMinutes: getOptionalFormString(formData, "duration"),
            startTime: getOptionalFormString(formData, "startTime"),
            caseId: getOptionalFormString(formData, "caseId"),
        })

    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message || "输入校验失败" }
    }

    const startTime = parsed.data.startTime
    const endTime = new Date(startTime.getTime() + parsed.data.durationMinutes * 60 * 1000)

    const res = await addManualTimeLog({
        caseId: parsed.data.caseId,
        description: parsed.data.description,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        isBillable: true,
    })

    if (!res.success) {
        return { error: res.error || "创建失败" }
    }

    return { success: true as const }
}
