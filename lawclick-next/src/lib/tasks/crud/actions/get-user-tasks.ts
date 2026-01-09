import "server-only"

import { TaskPriority, TaskStatus, type Prisma } from "@prisma/client"

import { enforceActionRateLimit } from "@/lib/action-rate-limit"
import { logger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import {
    getActiveTenantContextOrThrow,
    getCaseListAccessWhereOrNull,
    getProjectListAccessWhereOrNull,
    requireTenantPermission,
} from "@/lib/server-auth"
import { ensureUsersInTenant } from "@/lib/tenant-guards"
import { pushActiveParentsClauses } from "@/lib/tasks/crud/task-crud-where"
import { UuidSchema } from "@/lib/zod"

export async function getUserTasksImpl(userId?: string) {
    type UserTodoTask = {
        id: string
        title: string
        priority: TaskPriority | null
        status: TaskStatus
        dueDate: string | null
        updatedAt: string
        case: { id: string; title: string; caseCode: string } | null
        project: { id: string; title: string; projectCode: string } | null
    }

    const parsedUserId = UuidSchema.optional().safeParse(userId)
    if (!parsedUserId.success) {
        logger.warn("getUserTasks input validation failed", { issues: parsedUserId.error.flatten() })
        return { success: false as const, error: "输入校验失败", data: [] as UserTodoTask[] }
    }
    userId = parsedUserId.data

    try {
        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:view")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "tasks.user.list",
            limit: 600,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [] as UserTodoTask[] }
        }

        const targetUserId = userId || user.id
        if (targetUserId !== user.id) {
            requireTenantPermission(ctx, "user:view_all")
            const ok = await ensureUsersInTenant({ tenantId, userIds: [targetUserId] })
            if (!ok) {
                return {
                    success: false as const,
                    error: "用户不存在或不在当前租户",
                    data: [] as UserTodoTask[],
                }
            }
        }

        const where: Prisma.TaskWhereInput = {
            tenantId,
            assigneeId: targetUserId,
            status: { not: "DONE" },
        }
        const andClauses: Prisma.TaskWhereInput[] = []
        pushActiveParentsClauses(andClauses)

        if (targetUserId !== user.id && user.role !== "PARTNER" && user.role !== "ADMIN") {
            const caseAccessWhere = getCaseListAccessWhereOrNull(user, "case:view")
            const projectAccessWhere = getProjectListAccessWhereOrNull(user, "task:view")

            const ors: Prisma.TaskWhereInput[] = []
            if (caseAccessWhere) ors.push({ case: caseAccessWhere })
            if (projectAccessWhere) ors.push({ project: projectAccessWhere })

            if (ors.length === 0) {
                return { success: true as const, data: [] as UserTodoTask[] }
            }
            andClauses.push({ OR: ors })
        }

        if (andClauses.length) {
            where.AND = andClauses
        }

        const tasks = await prisma.task.findMany({
            where,
            orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
            take: 20,
            select: {
                id: true,
                title: true,
                priority: true,
                status: true,
                dueDate: true,
                updatedAt: true,
                case: { select: { id: true, title: true, caseCode: true } },
                project: { select: { id: true, title: true, projectCode: true } },
            },
        })

        const data: UserTodoTask[] = tasks.map((t) => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            status: t.status,
            dueDate: t.dueDate ? t.dueDate.toISOString() : null,
            updatedAt: t.updatedAt.toISOString(),
            case: t.case ? { id: t.case.id, title: t.case.title, caseCode: t.case.caseCode } : null,
            project: t.project ? { id: t.project.id, title: t.project.title, projectCode: t.project.projectCode } : null,
        }))

        return { success: true as const, data }
    } catch (error) {
        logger.error("获取用户待办失败", error)
        return { success: false as const, error: "获取用户待办失败", data: [] as UserTodoTask[] }
    }
}

