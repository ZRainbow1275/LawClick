import "server-only"

import { TenantSignalKind, type Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"

import type { ActionResponse } from "@/lib/action-response"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { enforceActionRateLimit } from "@/lib/action-rate-limit"
import { logger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { touchTenantSignal } from "@/lib/realtime/tenant-signal"
import {
    getActiveTenantContextOrThrow,
    requireCaseAccess,
    requireProjectAccess,
    requireTenantPermission,
} from "@/lib/server-auth"
import { ReorderTasksInputSchema } from "@/lib/tasks/crud/task-crud-schemas"
import type { ReorderTaskUpdate } from "@/lib/tasks/crud/task-crud-types"

function getActionErrorMessage(error: unknown, fallback: string): string {
    return getPublicActionErrorMessage(error, fallback)
}

export async function reorderTasksImpl(updates: ReorderTaskUpdate[]): Promise<ActionResponse> {
    try {
        const parsed = ReorderTasksInputSchema.safeParse(updates)
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        updates = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:edit")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "tasks.reorder",
            limit: 600,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        const tasks = await prisma.task.findMany({
            where: { tenantId, id: { in: updates.map((u) => u.taskId) } },
            select: { id: true, caseId: true, projectId: true },
            take: updates.length,
        })
        if (tasks.length !== updates.length) {
            return { success: false, error: "目标列的任务过多（>10000），请缩小范围后重试" }
        }

        const uniqueCaseIds = Array.from(
            new Set(tasks.map((t) => t.caseId).filter((id): id is string => typeof id === "string" && id.length > 0))
        )
        const uniqueProjectIds = Array.from(
            new Set(
                tasks.map((t) => t.projectId).filter((id): id is string => typeof id === "string" && id.length > 0)
            )
        )

        for (const caseId of uniqueCaseIds) {
            await requireCaseAccess(caseId, user, "case:view")
        }
        for (const projectId of uniqueProjectIds) {
            await requireProjectAccess(projectId, user, "task:edit")
        }

        try {
            await prisma.$transaction(async (tx) => {
                const results = await Promise.all(
                    updates.map((update) =>
                        tx.task.updateMany({
                            where: { id: update.taskId, tenantId },
                            data: {
                                order: update.order,
                                ...(update.status ? { status: update.status } : {}),
                                ...(update.swimlane !== undefined ? { swimlane: update.swimlane } : {}),
                                ...(update.stage !== undefined ? { stage: update.stage } : {}),
                            },
                        })
                    )
                )

                if (results.some((r) => r.count === 0)) {
                    throw new Error("部分任务不存在")
                }
            })
        } catch (error) {
            if (error instanceof Error && error.message === "部分任务不存在") {
                const message = error.message
                return { success: false, error: message }
            }
            throw error
        }

        const signalCaseId = uniqueCaseIds.length === 1 ? uniqueCaseIds[0] : null
        const signalProjectId = uniqueProjectIds.length === 1 ? uniqueProjectIds[0] : null

        try {
            await touchTenantSignal({
                tenantId,
                kind: TenantSignalKind.TASKS_CHANGED,
                payload: {
                    action: "reordered",
                    taskCount: updates.length,
                    caseId: signalCaseId,
                    projectId: signalProjectId,
                } satisfies Prisma.InputJsonValue,
            })
        } catch (error) {
            logger.error("触发实时信号失败", error)
        }

        uniqueCaseIds.forEach((caseId) => revalidatePath(`/cases/${caseId}`))
        uniqueProjectIds.forEach((projectId) => revalidatePath(`/projects/${projectId}`))
        if (uniqueProjectIds.length > 0) {
            revalidatePath("/projects")
        }
        revalidatePath("/tasks")

        return { success: true }
    } catch (error) {
        logger.error("update task order failed", error)
        return { success: false, error: getActionErrorMessage(error, "更新任务顺序失败") }
    }
}

