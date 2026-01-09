"use server"

import { TaskPriority } from "@prisma/client"
import { z } from "zod"

import { createCaseTask } from "@/actions/tasks-crud"
import { OptionalNonEmptyString, UuidSchema } from "@/lib/zod"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { AuthError, PermissionError, getActiveTenantContextOrThrow, getCaseListAccessWhereOrThrow, requireTenantPermission } from "@/lib/server-auth"

function getOptionalFormString(formData: FormData, key: string): string | undefined {
    const value = formData.get(key)
    if (typeof value !== "string") return undefined
    const trimmed = value.trim()
    return trimmed ? trimmed : undefined
}

export async function createTask(formData: FormData) {
    try {
        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:create")
        const { user } = ctx

        const rate = await enforceRateLimit({ ctx, action: "tasks.create.form", limit: 600 })
        if (!rate.allowed) return { error: rate.error }

        const parsed = z
            .object({
                title: z.string().trim().min(1, "标题不能为空").max(200),
                description: OptionalNonEmptyString(5000),
                priority: z.nativeEnum(TaskPriority).optional(),
                caseId: UuidSchema,
                userId: UuidSchema.optional(),
            })
            .strict()
            .safeParse({
                title: getOptionalFormString(formData, "title"),
                description: getOptionalFormString(formData, "description"),
                priority: getOptionalFormString(formData, "priority"),
                caseId: getOptionalFormString(formData, "caseId"),
                userId: getOptionalFormString(formData, "userId"),
            })

        if (!parsed.success) {
            return { error: parsed.error.issues[0]?.message || "输入校验失败" }
        }

        if (parsed.data.userId && parsed.data.userId !== user.id) {
            return { error: "不允许为其他用户创建个人任务" }
        }

        const res = await createCaseTask({
            caseId: parsed.data.caseId,
            title: parsed.data.title,
            description: parsed.data.description,
            priority: parsed.data.priority,
            assigneeId: user.id,
        })

        if (!res.success) {
            return { error: res.error || "创建任务失败" }
        }

        return { success: true as const }
    } catch (error) {
        if (error instanceof AuthError) {
            return { error: "请先登录" }
        }
        if (error instanceof PermissionError) {
            return { error: getPublicActionErrorMessage(error, "权限不足") }
        }
        logger.error("创建任务失败", error)
        return { error: "创建任务失败" }
    }
}

export async function getTaskCreationCaseOptions() {
    type CaseOption = { id: string; title: string; caseCode: string }

    try {
        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:create")
        const { user } = ctx

        const rate = await enforceRateLimit({ ctx, action: "tasks.create.caseOptions", limit: 600 })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [] as CaseOption[] }
        }

        const accessWhere = getCaseListAccessWhereOrThrow(user, "case:view")

        const cases = await prisma.case.findMany({
            where: { AND: [accessWhere, { status: { not: "ARCHIVED" } }] },
            orderBy: { updatedAt: "desc" },
            take: 200,
            select: { id: true, title: true, caseCode: true },
        })

        return { success: true as const, data: cases satisfies CaseOption[] }
    } catch (error) {
        if (error instanceof AuthError) {
            return { success: false as const, error: "请先登录", data: [] as CaseOption[] }
        }
        if (error instanceof PermissionError) {
            return { success: false as const, error: getPublicActionErrorMessage(error, "权限不足"), data: [] as CaseOption[] }
        }
        logger.error("获取任务创建案件列表失败", error)
        return { success: false as const, error: "获取任务创建案件列表失败", data: [] as CaseOption[] }
    }
}
