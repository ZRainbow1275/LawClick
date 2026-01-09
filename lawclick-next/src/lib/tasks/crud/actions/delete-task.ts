import "server-only"

import { TenantSignalKind, type Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"

import type { ActionResponse } from "@/lib/action-response"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { enforceActionRateLimit } from "@/lib/action-rate-limit"
import { logger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { getActiveTenantContextOrThrow, requireCaseAccess, requireProjectAccess, requireTenantPermission } from "@/lib/server-auth"
import { touchTenantSignal } from "@/lib/realtime/tenant-signal"
import { UuidSchema } from "@/lib/zod"

function getActionErrorMessage(error: unknown, fallback: string): string {
    return getPublicActionErrorMessage(error, fallback)
}

export async function deleteTaskImpl(taskId: string): Promise<ActionResponse> {
    try {
        const parsedId = UuidSchema.safeParse(taskId)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败" }
        }
        taskId = parsedId.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:delete")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "tasks.delete",
            limit: 60,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        const existing = await prisma.task.findFirst({
            where: { id: taskId, tenantId },
            select: { caseId: true, projectId: true },
        })
        if (!existing) {
            return { success: false, error: "任务不存在或无权限" }
        }

        const parent =
            existing.caseId
                ? ({ type: "case" as const, id: existing.caseId } as const)
                : existing.projectId
                  ? ({ type: "project" as const, id: existing.projectId } as const)
                  : null
        if (!parent) {
            return { success: false, error: "任务缺少归属（case/project）" }
        }

        if (parent.type === "case") {
            await requireCaseAccess(parent.id, user, "case:view")
        } else {
            await requireProjectAccess(parent.id, user, "task:edit")
        }

        const deleted = await prisma.task.deleteMany({
            where: { id: taskId, tenantId },
        })
        if (deleted.count === 0) {
            return { success: false, error: "删除失败：任务不存在或无权限" }
        }

        try {
            await touchTenantSignal({
                tenantId,
                kind: TenantSignalKind.TASKS_CHANGED,
                payload: {
                    action: "deleted",
                    taskId,
                    caseId: parent.type === "case" ? parent.id : null,
                    projectId: parent.type === "project" ? parent.id : null,
                } satisfies Prisma.InputJsonValue,
            })
        } catch (error) {
            logger.error("触发实时信号失败", error)
        }

        revalidatePath(parent.type === "case" ? `/cases/${parent.id}` : `/projects/${parent.id}`)
        if (parent.type === "project") revalidatePath("/projects")
        revalidatePath("/tasks")

        return { success: true }
    } catch (error) {
        logger.error("删除任务失败", error)
        return { success: false, error: getActionErrorMessage(error, "删除任务失败") }
    }
}

