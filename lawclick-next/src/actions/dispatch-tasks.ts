"use server"

import { prisma } from "@/lib/prisma"
import {
    AuthError,
    PermissionError,
    getActiveTenantContextWithPermissionOrThrow,
    getCaseListAccessWhereOrNull,
    getProjectListAccessWhereOrNull,
    requireTenantPermission,
} from "@/lib/server-auth"
import { logger } from "@/lib/logger"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { checkRateLimit } from "@/lib/rate-limit"
import type { Prisma, TaskPriority, TaskStatus } from "@prisma/client"
import { z } from "zod"

const GetUnassignedTasksOptionsSchema = z
    .object({
        take: z.number().int().min(1).max(200).optional(),
    })
    .strict()
    .optional()

export type DispatchTaskItem = {
    id: string
    title: string
    status: TaskStatus
    priority: TaskPriority
    dueDate: Date | null
    case: { id: string; title: string; caseCode: string | null } | null
    project: { id: string; title: string; projectCode: string } | null
    updatedAt: Date
}

export async function getUnassignedTasksForDispatch(options?: unknown): Promise<
    | { success: true; data: DispatchTaskItem[] }
    | { success: false; error: string; data: DispatchTaskItem[] }
> {
    try {
        const parsed = GetUnassignedTasksOptionsSchema.safeParse(options)
        if (!parsed.success) {
            logger.warn("getUnassignedTasksForDispatch 输入校验失败", { issues: parsed.error.flatten() })
            return { success: false, error: "输入校验失败", data: [] }
        }

        const ctx = await getActiveTenantContextWithPermissionOrThrow("task:edit")
        requireTenantPermission(ctx, "team:view")
        const { user, tenantId, viewer } = ctx

        const rate = await checkRateLimit({
            key: `dispatch:unassigned_tasks:tenant:${tenantId}:user:${user.id}`,
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return { success: false, error: `请求过于频繁，请在 ${rate.retryAfterSeconds} 秒后重试`, data: [] }
        }

        const where: Prisma.TaskWhereInput = {
            tenantId,
            assigneeId: null,
            status: { not: "DONE" },
            OR: [{ caseId: { not: null } }, { projectId: { not: null } }],
        }

        if (user.role !== "PARTNER" && user.role !== "ADMIN") {
            const caseAccessWhere = getCaseListAccessWhereOrNull(viewer, "case:view")
            const projectAccessWhere = getProjectListAccessWhereOrNull(viewer, "task:view")

            const ors: Prisma.TaskWhereInput[] = []
            if (caseAccessWhere) ors.push({ case: caseAccessWhere })
            if (projectAccessWhere) ors.push({ project: projectAccessWhere })

            if (ors.length === 0) {
                return { success: true, data: [] }
            }

            where.AND = [{ OR: ors }]
        }

        const tasks = await prisma.task.findMany({
            where,
            orderBy: [{ dueDate: "asc" }, { priority: "asc" }, { updatedAt: "desc" }],
            take: parsed.data?.take ?? 120,
            select: {
                id: true,
                title: true,
                status: true,
                priority: true,
                dueDate: true,
                updatedAt: true,
                case: { select: { id: true, title: true, caseCode: true } },
                project: { select: { id: true, title: true, projectCode: true } },
            },
        })

        return { success: true, data: tasks }
    } catch (error) {
        if (error instanceof AuthError) {
            return { success: false, error: "请先登录", data: [] }
        }
        if (error instanceof PermissionError) {
            return { success: false, error: getPublicActionErrorMessage(error, "权限不足"), data: [] }
        }
        logger.error("getUnassignedTasksForDispatch 失败", error)
        return { success: false, error: "获取待分配任务失败", data: [] }
    }
}
