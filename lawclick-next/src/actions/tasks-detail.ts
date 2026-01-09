"use server"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import {
    PermissionError,
    getActiveTenantContextOrThrow,
    hasTenantPermission,
    requireCaseAccess,
    requireProjectAccess,
    requireTenantPermission,
} from "@/lib/server-auth"
import { UuidSchema } from "@/lib/zod"
import type { TaskDetailPageData } from "@/lib/tasks/task-detail"
import { listTenantMemberUsersLite } from "@/lib/tenant-users"
import { getTaskCapabilities } from "@/lib/capabilities/task-capabilities"

export async function getTaskDetailPageData(taskId: string) {
    const parsedId = UuidSchema.safeParse(taskId)
    if (!parsedId.success) {
        return { success: false as const, error: "输入校验失败", data: null }
    }
    taskId = parsedId.data

    try {
        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:view")
        const { user, tenantId } = ctx
        const capabilities = getTaskCapabilities(ctx)

        const rate = await enforceRateLimit({
            ctx,
            action: "tasks.detail.get",
            limit: 600,
            extraKey: taskId,
        })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: null }
        }

        const task = await prisma.task.findFirst({
            where: { id: taskId, tenantId },
            select: {
                id: true,
                title: true,
                description: true,
                status: true,
                priority: true,
                dueDate: true,
                stage: true,
                swimlane: true,
                taskType: true,
                estimatedHours: true,
                assigneeId: true,
                assignee: { select: { id: true, name: true, email: true } },
                document: { select: { id: true, title: true, documentType: true } },
                case: { select: { id: true, title: true, caseCode: true } },
                project: { select: { id: true, title: true, projectCode: true } },
            },
        })

        if (!task) {
            return { success: false as const, error: "任务不存在", data: null }
        }

        if (task.case) {
            await requireCaseAccess(task.case.id, user, "case:view")
        } else if (task.project) {
            await requireProjectAccess(task.project.id, user, "task:view")
        } else if (user.role !== "PARTNER" && user.role !== "ADMIN") {
            if (!task.assigneeId || task.assigneeId !== user.id) {
                return { success: false as const, error: "无任务访问权限", data: null }
            }
        }

        const assignees = await (async () => {
            if (task.case) {
                const members = await prisma.caseMember.findMany({
                    where: { caseId: task.case.id },
                    orderBy: { joinedAt: "asc" },
                    select: { user: { select: { id: true, name: true, email: true } } },
                    take: 300,
                })
                return members.map((m) => m.user)
            }

            if (task.project) {
                const project = await prisma.project.findFirst({
                    where: { id: task.project.id, tenantId },
                    select: {
                        owner: { select: { id: true, name: true, email: true } },
                        members: {
                            orderBy: { joinedAt: "asc" },
                            select: { user: { select: { id: true, name: true, email: true } } },
                        },
                    },
                })
                const list = project ? [project.owner, ...project.members.map((m) => m.user)] : []
            return Array.from(new Map(list.map((u) => [u.id, u])).values())
        }

            if (hasTenantPermission(ctx, "user:view_all")) {
                return listTenantMemberUsersLite({ tenantId, take: 300 })
            }

            return [{ id: user.id, name: user.name, email: user.email }]
        })()

        const data: TaskDetailPageData = {
            task: {
                id: task.id,
                title: task.title,
                description: task.description,
                status: task.status,
                priority: task.priority,
                dueDate: task.dueDate,
                stage: task.stage,
                swimlane: task.swimlane,
                taskType: task.taskType,
                estimatedHours: task.estimatedHours,
                assignee: task.assignee,
                document: task.document,
                case: task.case,
                project: task.project,
            },
            assignees,
            capabilities: {
                canEdit: capabilities.canEdit,
                canDelete: capabilities.canDelete,
            },
        }

        return { success: true as const, data }
    } catch (error) {
        if (error instanceof PermissionError) {
            return { success: false as const, error: getPublicActionErrorMessage(error, "权限不足"), data: null }
        }
        logger.error("获取任务详情失败", error)
        return { success: false as const, error: "获取任务详情失败", data: null }
    }
}
