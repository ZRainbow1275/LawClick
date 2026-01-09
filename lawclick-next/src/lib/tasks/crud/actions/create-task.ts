import "server-only"

import { NotificationType, TaskStatus, TenantSignalKind, type Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"

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
import { TASK_POSITION_GAP } from "@/lib/task-ordering"
import { ensureUsersInTenant } from "@/lib/tenant-guards"

import { CreateCaseTaskInputSchema, CreateProjectTaskInputSchema } from "@/lib/tasks/crud/task-crud-schemas"
import type { CreateProjectTaskInput, CreateTaskInput, TaskForKanban } from "@/lib/tasks/crud/task-crud-types"

function getActionErrorMessage(error: unknown, fallback: string): string {
    return getPublicActionErrorMessage(error, fallback)
}

export async function createCaseTaskImpl(
    input: CreateTaskInput
): Promise<ActionResponse<{ taskId: string; task: TaskForKanban }>> {
    try {
        const parsed = CreateCaseTaskInputSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        input = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:create")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "tasks.create",
            limit: 60,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        await requireCaseAccess(input.caseId, user, "case:view")

        if (input.assigneeId) {
            const ok = await ensureUsersInTenant({ tenantId, userIds: [input.assigneeId] })
            if (!ok) return { success: false, error: "负责人不存在或不在当前租户" }
        }

        const targetStatus: TaskStatus = input.status ?? "TODO"
        const swimlane = input.swimlane ?? null

        const maxOrder = await prisma.task.aggregate({
            where: { tenantId, caseId: input.caseId, status: targetStatus, swimlane },
            _max: { order: true },
        })

        const task = await prisma.task.create({
            data: {
                tenantId,
                caseId: input.caseId,
                title: input.title,
                description: input.description,
                priority: input.priority || "P2_MEDIUM",
                dueDate: input.dueDate,
                assigneeId: input.assigneeId,
                stage: input.stage,
                swimlane,
                taskType: input.taskType,
                documentId: input.documentId,
                estimatedHours: input.estimatedHours,
                order: (maxOrder._max.order || 0) + TASK_POSITION_GAP,
                status: targetStatus,
            },
            include: {
                assignee: { select: { id: true, name: true, email: true } },
                document: { select: { id: true, title: true, documentType: true } },
            },
        })

        try {
            if (input.assigneeId && input.assigneeId !== user.id) {
                const caseLite = await prisma.case.findFirst({
                    where: { id: input.caseId, tenantId },
                    select: { id: true, caseCode: true, title: true },
                })

                await notifyUsersWithEmailQueue({
                    tenantId,
                    userIds: [input.assigneeId],
                    type: NotificationType.TASK_ASSIGNED,
                    title: `任务分配：${caseLite?.caseCode || ""}`,
                    content: task.title,
                    actionUrl: `/cases/${input.caseId}?tab=tasks`,
                    actorId: user.id,
                    metadata: { taskId: task.id, caseId: input.caseId },
                })
            }
        } catch (error) {
            logger.error("Task assignment notification failed", error)
        }

        try {
            await touchTenantSignal({
                tenantId,
                kind: TenantSignalKind.TASKS_CHANGED,
                payload: {
                    action: "created",
                    taskId: task.id,
                    caseId: input.caseId,
                    projectId: null,
                } satisfies Prisma.InputJsonValue,
            })
        } catch (error) {
            logger.error("触发实时信号失败", error)
        }

        revalidatePath(`/cases/${input.caseId}`)
        revalidatePath("/tasks")

        return { success: true, taskId: task.id, task }
    } catch (error) {
        logger.error("创建任务失败", error)
        return { success: false, error: getActionErrorMessage(error, "创建任务失败") }
    }
}

export async function createProjectTaskImpl(
    input: CreateProjectTaskInput
): Promise<ActionResponse<{ taskId: string; task: TaskForKanban }>> {
    try {
        const parsed = CreateProjectTaskInputSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        input = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:create")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "tasks.create",
            limit: 60,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        await requireProjectAccess(input.projectId, user, "task:create")

        if (input.assigneeId) {
            const ok = await ensureUsersInTenant({ tenantId, userIds: [input.assigneeId] })
            if (!ok) return { success: false, error: "负责人不存在或不在当前租户" }
        }

        const targetStatus: TaskStatus = input.status ?? "TODO"
        const swimlane = input.swimlane ?? null

        const maxOrder = await prisma.task.aggregate({
            where: { tenantId, projectId: input.projectId, status: targetStatus, swimlane },
            _max: { order: true },
        })

        const task = await prisma.task.create({
            data: {
                tenantId,
                projectId: input.projectId,
                title: input.title,
                description: input.description,
                priority: input.priority || "P2_MEDIUM",
                dueDate: input.dueDate,
                assigneeId: input.assigneeId,
                stage: input.stage,
                swimlane,
                taskType: input.taskType,
                documentId: input.documentId,
                estimatedHours: input.estimatedHours,
                order: (maxOrder._max.order || 0) + TASK_POSITION_GAP,
                status: targetStatus,
            },
            include: {
                assignee: { select: { id: true, name: true, email: true } },
                document: { select: { id: true, title: true, documentType: true } },
            },
        })

        try {
            if (input.assigneeId && input.assigneeId !== user.id) {
                const projectLite = await prisma.project.findFirst({
                    where: { id: input.projectId, tenantId },
                    select: { id: true, projectCode: true, title: true },
                })

                await notifyUsersWithEmailQueue({
                    tenantId,
                    userIds: [input.assigneeId],
                    type: NotificationType.TASK_ASSIGNED,
                    title: `任务分配：${projectLite?.projectCode || ""}`,
                    content: task.title,
                    actionUrl: `/projects/${input.projectId}`,
                    actorId: user.id,
                    metadata: { taskId: task.id, projectId: input.projectId },
                })
            }
        } catch (error) {
            logger.error("Project task assignment notification failed", error)
        }

        try {
            await touchTenantSignal({
                tenantId,
                kind: TenantSignalKind.TASKS_CHANGED,
                payload: {
                    action: "created",
                    taskId: task.id,
                    caseId: null,
                    projectId: input.projectId,
                } satisfies Prisma.InputJsonValue,
            })
        } catch (error) {
            logger.error("触发实时信号失败", error)
        }

        revalidatePath(`/projects/${input.projectId}`)
        revalidatePath("/projects")
        revalidatePath("/tasks")

        return { success: true, taskId: task.id, task }
    } catch (error) {
        logger.error("创建项目任务失败", error)
        return { success: false, error: getActionErrorMessage(error, "创建项目任务失败") }
    }
}

