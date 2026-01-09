import "server-only"

import { NotificationType, TenantSignalKind, type Prisma, TaskStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import type { ActionResponse } from "@/lib/action-response"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { enforceActionRateLimit } from "@/lib/action-rate-limit"
import { logger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import {
    getActiveTenantContextOrThrow,
    requireCaseAccess,
    requireProjectAccess,
    requireTenantPermission,
} from "@/lib/server-auth"
import { notifyUsersWithEmailQueue } from "@/lib/notifications"
import { touchTenantSignal } from "@/lib/realtime/tenant-signal"
import { ensureUsersInTenant } from "@/lib/tenant-guards"
import { UuidSchema } from "@/lib/zod"

import { UpdateTaskInputSchema } from "@/lib/tasks/crud/task-crud-schemas"
import type { UpdateTaskInput } from "@/lib/tasks/crud/task-crud-types"

function getActionErrorMessage(error: unknown, fallback: string): string {
    return getPublicActionErrorMessage(error, fallback)
}

export async function updateTaskImpl(taskId: string, input: UpdateTaskInput): Promise<ActionResponse> {
    try {
        const parsed = z
            .object({ taskId: UuidSchema, input: UpdateTaskInputSchema })
            .strict()
            .safeParse({ taskId, input })
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        taskId = parsed.data.taskId
        input = parsed.data.input

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:edit")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "tasks.update",
            limit: 240,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        const existing = await prisma.task.findFirst({
            where: { id: taskId, tenantId },
            select: { title: true, caseId: true, projectId: true, assigneeId: true },
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

        if (
            input.assigneeId !== undefined &&
            input.assigneeId !== null &&
            input.assigneeId !== existing.assigneeId
        ) {
            const ok = await ensureUsersInTenant({ tenantId, userIds: [input.assigneeId] })
            if (!ok) return { success: false, error: "负责人不存在或不在当前租户" }
        }

        const updated = await prisma.task.updateMany({
            where: { id: taskId, tenantId },
            data: input,
        })

        if (updated.count === 0) {
            return { success: false, error: "更新失败：任务不存在或无权限" }
        }

        const nextAssigneeId = input.assigneeId === undefined ? existing.assigneeId : input.assigneeId
        const nextTitle = input.title === undefined ? existing.title : input.title

        try {
            if (nextAssigneeId && nextAssigneeId !== existing.assigneeId && nextAssigneeId !== user.id) {
                const caseLite =
                    parent.type === "case"
                        ? await prisma.case.findFirst({
                              where: { id: parent.id, tenantId },
                              select: { id: true, caseCode: true, title: true },
                          })
                        : null

                const projectLite =
                    parent.type === "project"
                        ? await prisma.project.findFirst({
                              where: { id: parent.id, tenantId },
                              select: { id: true, projectCode: true, title: true },
                          })
                        : null

                await notifyUsersWithEmailQueue({
                    tenantId,
                    userIds: [nextAssigneeId],
                    type: NotificationType.TASK_ASSIGNED,
                    title:
                        parent.type === "case"
                            ? `任务分配：${caseLite?.caseCode || ""}`
                            : `任务分配：${projectLite?.projectCode || ""}`,
                    content: nextTitle,
                    actionUrl: parent.type === "case" ? `/cases/${parent.id}?tab=tasks` : `/projects/${parent.id}`,
                    actorId: user.id,
                    metadata: parent.type === "case" ? { taskId, caseId: parent.id } : { taskId, projectId: parent.id },
                })
            }
        } catch (error) {
            logger.error("Task reassignment notification failed", error)
        }

        try {
            await touchTenantSignal({
                tenantId,
                kind: TenantSignalKind.TASKS_CHANGED,
                payload: {
                    action: "updated",
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
        logger.error("更新任务失败", error)
        return { success: false, error: getActionErrorMessage(error, "更新任务失败") }
    }
}

export async function updateTaskStatusImpl(taskId: string, status: TaskStatus): Promise<ActionResponse> {
    const ctx = await getActiveTenantContextOrThrow()
    requireTenantPermission(ctx, "task:edit")
    const { user, tenantId } = ctx

    const rate = await enforceActionRateLimit({
        tenantId,
        userId: user.id,
        action: "tasks.update.status",
        limit: 6000,
        windowMs: 60_000,
    })
    if (!rate.allowed) return { success: false as const, error: rate.error }

    return updateTaskImpl(taskId, { status })
}

export async function assignTaskImpl(taskId: string, assigneeId: string | null): Promise<ActionResponse> {
    const ctx = await getActiveTenantContextOrThrow()
    requireTenantPermission(ctx, "task:edit")
    const { user, tenantId } = ctx

    const rate = await enforceActionRateLimit({
        tenantId,
        userId: user.id,
        action: "tasks.update.assign",
        limit: 6000,
        windowMs: 60_000,
    })
    if (!rate.allowed) return { success: false as const, error: rate.error }

    return updateTaskImpl(taskId, { assigneeId })
}

