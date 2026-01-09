import "server-only"

import { type Prisma, TaskStatus } from "@prisma/client"

import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { enforceActionRateLimit } from "@/lib/action-rate-limit"
import { logger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { TASKS_TAKE_DEFAULT } from "@/lib/query-limits"
import {
    getActiveTenantContextOrThrow,
    getCaseListAccessWhereOrNull,
    getProjectListAccessWhereOrNull,
    requireCaseAccess,
    requireProjectAccess,
    requireTenantPermission,
} from "@/lib/server-auth"
import { GetAccessibleTaskListPageInputSchema, GetAccessibleTasksOptionsSchema } from "@/lib/tasks/crud/task-crud-schemas"
import type { AccessibleTasksForBoardItem, GetAccessibleTasksOptions, TaskListItem } from "@/lib/tasks/crud/task-crud-types"
import { TASK_LIST_SELECT } from "@/lib/tasks/crud/task-crud-types"
import { buildAccessibleTasksWhereForBoard, buildTaskSearchWhere, pushActiveParentsClauses } from "@/lib/tasks/crud/task-crud-where"

function getActionErrorMessage(error: unknown, fallback: string): string {
    return getPublicActionErrorMessage(error, fallback)
}

export async function getAccessibleTasksForBoardMetaImpl(options?: GetAccessibleTasksOptions) {
    try {
        const parsed = GetAccessibleTasksOptionsSchema.safeParse(options)
        if (!parsed.success) {
            logger.warn("getAccessibleTasksForBoardMeta 输入校验失败", { issues: parsed.error.flatten() })
            return { success: false as const, error: "输入校验失败", total: 0, limit: 0, hasMore: false }
        }
        options = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:view")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "tasks.board.meta",
            limit: 600,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return {
                success: false as const,
                error: rate.error,
                total: 0,
                limit: options?.take ?? TASKS_TAKE_DEFAULT,
                hasMore: false,
            }
        }

        const where = await buildAccessibleTasksWhereForBoard({ user, tenantId, options })
        if (!where) {
            return { success: true as const, total: 0, limit: options?.take ?? TASKS_TAKE_DEFAULT, hasMore: false }
        }

        const total = await prisma.task.count({ where })
        const limit = options?.take ?? TASKS_TAKE_DEFAULT
        const hasMore = total > limit
        return { success: true as const, total, limit, hasMore }
    } catch (error) {
        logger.error("获取看板任务统计失败", error)
        return { success: false as const, error: "获取看板任务统计失败", total: 0, limit: 0, hasMore: false }
    }
}

export async function getAccessibleTasksForBoardImpl(options?: GetAccessibleTasksOptions) {
    try {
        const parsed = GetAccessibleTasksOptionsSchema.safeParse(options)
        if (!parsed.success) {
            return {
                success: false as const,
                error: parsed.error.issues[0]?.message || "输入校验失败",
                data: [] as AccessibleTasksForBoardItem[],
            }
        }
        options = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:view")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "tasks.board.list",
            limit: 600,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [] as AccessibleTasksForBoardItem[] }
        }

        const where = await buildAccessibleTasksWhereForBoard({ user, tenantId, options })
        if (!where) return { success: true as const, data: [] as AccessibleTasksForBoardItem[] }

        const tasks = await prisma.task.findMany({
            where,
            orderBy: [{ dueDate: "asc" }, { priority: "asc" }, { updatedAt: "desc" }],
            select: {
                id: true,
                title: true,
                status: true,
                priority: true,
                dueDate: true,
                case: { select: { id: true, title: true, caseCode: true, status: true, currentStage: true } },
                project: { select: { id: true, title: true, projectCode: true, status: true, type: true } },
                assignee: { select: { id: true, name: true, email: true } },
                document: { select: { id: true, title: true, documentType: true } },
            },
            take: options?.take ?? TASKS_TAKE_DEFAULT,
        })

        const data: AccessibleTasksForBoardItem[] = tasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate ? t.dueDate.toISOString() : null,
            case: t.case ? { ...t.case, status: String(t.case.status), currentStage: t.case.currentStage ?? null } : null,
            project: t.project ? { ...t.project, status: String(t.project.status), type: String(t.project.type) } : null,
            assignee: t.assignee,
            document: t.document,
        }))

        return { success: true as const, data }
    } catch (error) {
        logger.error("获取任务中心数据失败", error)
        return { success: false as const, error: "获取任务中心数据失败", data: [] as AccessibleTasksForBoardItem[] }
    }
}

export async function getAccessibleTasksForListPageImpl(input?: {
    caseId?: string
    projectId?: string
    status?: TaskStatus[]
    search?: string
    page?: number
    take?: number
}) {
    const parsed = GetAccessibleTaskListPageInputSchema.safeParse(input)
    if (!parsed.success) {
        return {
            success: false as const,
            error: parsed.error.issues[0]?.message || "输入校验失败",
            data: [] as TaskListItem[],
            total: 0,
            page: 0,
            take: 50,
            hasMore: false,
        }
    }
    input = parsed.data

    try {
        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:view")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "tasks.list.page",
            limit: 600,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return {
                success: false as const,
                error: rate.error,
                data: [] as TaskListItem[],
                total: 0,
                page: input?.page ?? 0,
                take: input?.take ?? 50,
                hasMore: false,
            }
        }

        if (input?.caseId) {
            await requireCaseAccess(input.caseId, user, "case:view")
        }
        if (input?.projectId) {
            await requireProjectAccess(input.projectId, user, "task:view")
        }

        const take = Math.max(10, Math.min(200, input?.take ?? 50))
        const page = Math.max(0, input?.page ?? 0)
        const skip = page * take
        const search = (input?.search || "").trim()

        const where: Prisma.TaskWhereInput = { tenantId }
        const andClauses: Prisma.TaskWhereInput[] = []
        pushActiveParentsClauses(andClauses)

        if (input?.caseId) where.caseId = input.caseId
        if (input?.projectId) where.projectId = input.projectId

        if (input?.status?.length) {
            where.status = { in: input.status }
        }

        if (search) {
            andClauses.push(buildTaskSearchWhere(search))
        }

        if (user.role !== "PARTNER" && user.role !== "ADMIN") {
            const caseAccessWhere = getCaseListAccessWhereOrNull(user, "case:view")
            const projectAccessWhere = getProjectListAccessWhereOrNull(user, "task:view")

            const ors: Prisma.TaskWhereInput[] = []
            if (caseAccessWhere) ors.push({ case: caseAccessWhere })
            if (projectAccessWhere) ors.push({ project: projectAccessWhere })

            if (ors.length) {
                andClauses.push({ OR: ors })
            } else {
                where.assigneeId = user.id
            }
        }

        if (andClauses.length) {
            where.AND = andClauses
        }

        const [total, tasks] = await prisma.$transaction([
            prisma.task.count({ where }),
            prisma.task.findMany({
                where,
                orderBy: [
                    { dueDate: { sort: "asc", nulls: "last" } },
                    { priority: "asc" },
                    { updatedAt: "desc" },
                    { id: "desc" },
                ],
                skip,
                take,
                select: TASK_LIST_SELECT,
            }),
        ])

        const hasMore = skip + tasks.length < total
        return { success: true as const, data: tasks, total, page, take, hasMore }
    } catch (error) {
        logger.error("获取任务列表失败", error)
        return {
            success: false as const,
            error: getActionErrorMessage(error, "获取任务列表失败"),
            data: [] as TaskListItem[],
            total: 0,
            page: 0,
            take: 50,
            hasMore: false,
        }
    }
}

