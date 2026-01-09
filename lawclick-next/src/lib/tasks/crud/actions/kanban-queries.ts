import "server-only"

import { TaskStatus, type Prisma } from "@prisma/client"

import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { enforceActionRateLimit } from "@/lib/action-rate-limit"
import { logger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { KANBAN_COLUMN_TAKE_DEFAULT, KANBAN_COLUMN_TAKE_MAX } from "@/lib/query-limits"
import { AuthError, PermissionError, getActiveTenantContextOrThrow, requireTenantPermission } from "@/lib/server-auth"
import { getTaskCapabilities } from "@/lib/capabilities/task-capabilities"
import { EMPTY_TASK_CAPABILITIES } from "@/lib/capabilities/types"
import {
    GetKanbanStatusCountsOptionsSchema,
    GetKanbanStatusPageInputSchema,
    GetKanbanTaskByIdInputSchema,
} from "@/lib/tasks/crud/task-crud-schemas"
import type { GetAccessibleTasksOptions, KanbanStatusCounts, TaskForKanban, TaskKanbanItem } from "@/lib/tasks/crud/task-crud-types"
import { TASK_KANBAN_SELECT } from "@/lib/tasks/crud/task-crud-types"
import { buildAccessibleTasksWhereForBoard } from "@/lib/tasks/crud/task-crud-where"

export async function getAccessibleTaskKanbanStatusCountsImpl(options?: {
    caseId?: string
    projectId?: string
    assigneeId?: string
    status?: TaskStatus[]
    search?: string
}) {
    const parsed = GetKanbanStatusCountsOptionsSchema.safeParse(options)
    if (!parsed.success) {
        logger.warn("getAccessibleTaskKanbanStatusCounts 输入校验失败", { issues: parsed.error.flatten() })
        return {
            success: false as const,
            error: "输入校验失败",
            total: 0,
            counts: { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 } satisfies KanbanStatusCounts,
            capabilities: EMPTY_TASK_CAPABILITIES,
        }
    }

    try {
        options = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:view")
        const capabilities = getTaskCapabilities(ctx)
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "tasks.kanban.counts",
            limit: 600,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return {
                success: false as const,
                error: rate.error,
                total: 0,
                counts: { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 } satisfies KanbanStatusCounts,
                capabilities,
            }
        }

        const where = await buildAccessibleTasksWhereForBoard({
            user,
            tenantId,
            options: options as GetAccessibleTasksOptions | undefined,
        })
        if (!where) {
            return {
                success: true as const,
                total: 0,
                counts: { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 } satisfies KanbanStatusCounts,
                capabilities,
            }
        }

        const grouped = await prisma.task.groupBy({
            by: ["status"],
            where,
            _count: { _all: true },
        })

        const counts: KanbanStatusCounts = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 }
        for (const row of grouped) {
            counts[row.status] = row._count._all
        }
        const total = counts.TODO + counts.IN_PROGRESS + counts.REVIEW + counts.DONE

        return { success: true as const, total, counts, capabilities }
    } catch (error) {
        if (error instanceof AuthError) {
            return {
                success: false as const,
                error: "请先登录",
                total: 0,
                counts: { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 } satisfies KanbanStatusCounts,
                capabilities: EMPTY_TASK_CAPABILITIES,
            }
        }
        if (error instanceof PermissionError) {
            return {
                success: false as const,
                error: getPublicActionErrorMessage(error, "权限不足"),
                total: 0,
                counts: { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 } satisfies KanbanStatusCounts,
                capabilities: EMPTY_TASK_CAPABILITIES,
            }
        }
        logger.error("获取看板状态计数失败", error)
        return {
            success: false as const,
            error: "获取看板状态计数失败",
            total: 0,
            counts: { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 } satisfies KanbanStatusCounts,
            capabilities: EMPTY_TASK_CAPABILITIES,
        }
    }
}

export async function getAccessibleTaskKanbanStatusPageImpl(input: {
    status: TaskStatus
    caseId?: string
    projectId?: string
    assigneeId?: string
    search?: string
    cursor?: { order: number; id: string }
    page?: number
    take?: number
}) {
    try {
        const parsed = GetKanbanStatusPageInputSchema.safeParse(input)
        if (!parsed.success) {
            logger.warn("getAccessibleTaskKanbanStatusPage 输入校验失败", { issues: parsed.error.flatten() })
            return {
                success: false as const,
                error: parsed.error.issues[0]?.message || "输入校验失败",
                data: [] as TaskForKanban[],
                page: 0,
                take: KANBAN_COLUMN_TAKE_DEFAULT,
                hasMore: false,
                nextCursor: null as { order: number; id: string } | null,
            }
        }
        input = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:view")
        const { user, tenantId } = ctx

        const take = Math.max(10, Math.min(KANBAN_COLUMN_TAKE_MAX, input.take ?? KANBAN_COLUMN_TAKE_DEFAULT))
        const page = Math.max(0, input.page ?? 0)

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "tasks.kanban.page",
            limit: 600,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return {
                success: false as const,
                error: rate.error,
                data: [] as TaskForKanban[],
                page,
                take,
                hasMore: false,
                nextCursor: null as { order: number; id: string } | null,
            }
        }

        const where = await buildAccessibleTasksWhereForBoard({
            user,
            tenantId,
            options: {
                caseId: input.caseId,
                projectId: input.projectId,
                assigneeId: input.assigneeId,
                search: input.search,
                status: [input.status],
            },
        })
        if (!where) {
            return {
                success: true as const,
                data: [] as TaskForKanban[],
                page,
                take,
                hasMore: false,
                nextCursor: null as { order: number; id: string } | null,
            }
        }

        const orderedBoard = Boolean(input.caseId || input.projectId)
        const cursor = orderedBoard && input.cursor ? input.cursor : null
        const skip = cursor ? 0 : page * take
        const orderBy: Prisma.TaskOrderByWithRelationInput[] = orderedBoard
            ? [{ order: "asc" }, { id: "asc" }]
            : [
                  { dueDate: { sort: "asc", nulls: "last" } },
                  { priority: "asc" },
                  { updatedAt: "desc" },
                  { id: "desc" },
              ]

        const tasks = await prisma.task.findMany({
            where: cursor
                ? {
                      AND: [
                          where,
                          {
                              OR: [
                                  { order: { gt: cursor.order } },
                                  { AND: [{ order: cursor.order }, { id: { gt: cursor.id } }] },
                              ],
                          },
                      ],
                  }
                : where,
            orderBy,
            skip,
            take: take + 1,
            select: TASK_KANBAN_SELECT,
        })

        const hasMore = tasks.length > take
        const data = (hasMore ? tasks.slice(0, take) : tasks) as TaskForKanban[]
        const last = orderedBoard ? data[data.length - 1] : null
        const nextCursor = orderedBoard && hasMore && last ? { order: last.order, id: last.id } : null
        return { success: true as const, data, page, take, hasMore, nextCursor }
    } catch (error) {
        logger.error("获取看板任务列表失败", error)
        return {
            success: false as const,
            error: "获取看板任务列表失败",
            data: [] as TaskForKanban[],
            page: 0,
            take: KANBAN_COLUMN_TAKE_DEFAULT,
            hasMore: false,
            nextCursor: null as { order: number; id: string } | null,
        }
    }
}

export async function getAccessibleTaskKanbanItemByIdImpl(input: {
    taskId: string
    caseId?: string
    projectId?: string
    assigneeId?: string
    status?: TaskStatus[]
    search?: string
}): Promise<{ success: true; data: TaskKanbanItem | null } | { success: false; error: string; data: null }> {
    try {
        const parsed = GetKanbanTaskByIdInputSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败", data: null }
        }
        input = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:view")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "tasks.kanban.item",
            limit: 600,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: null }
        }

        const where = await buildAccessibleTasksWhereForBoard({
            user,
            tenantId,
            options: {
                caseId: input.caseId,
                projectId: input.projectId,
                assigneeId: input.assigneeId,
                status: input.status,
                search: input.search,
            },
        })
        if (!where) {
            return { success: true as const, data: null }
        }

        const task = await prisma.task.findFirst({
            where: { AND: [where, { id: input.taskId }] },
            select: TASK_KANBAN_SELECT,
        })

        return { success: true as const, data: task }
    } catch (error) {
        logger.error("获取看板任务失败", error)
        return { success: false as const, error: "获取看板任务失败", data: null }
    }
}

