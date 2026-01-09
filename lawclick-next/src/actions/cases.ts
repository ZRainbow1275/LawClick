"use server"

import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import {
    AuthError,
    getActiveTenantContextWithPermissionOrThrow,
    getCaseListAccessWhereOrNull,
    getCaseListAccessWhereOrThrow,
    hasTenantPermission,
} from "@/lib/server-auth"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { UserFacingError } from "@/lib/action-errors"
import { logger } from "@/lib/logger"
import { CaseStatus, EventType, ServiceType, TaskPriority, TaskStatus, type Prisma } from "@prisma/client"
import { z } from "zod"
import { UuidSchema } from "@/lib/zod"

export async function getDashboardData() {
    let ctx: Awaited<ReturnType<typeof getActiveTenantContextWithPermissionOrThrow>>
    try {
        ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:view")
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        throw error
    }

    try {
        const dashboardRate = await enforceRateLimit({
            ctx,
            action: "dashboard.data.get",
            limit: 120,
        })
        if (!dashboardRate.allowed) {
            return {
                success: false as const,
                error: dashboardRate.error,
                data: {
                    user: ctx.user,
                    membershipRole: ctx.membership.role,
                    cases: [],
                    tasks: [],
                    events: [],
                    timeLogs: [],
                },
            }
        }

        const { user, tenantId, viewer } = ctx
        const canViewCases = hasTenantPermission(ctx, "case:view")
        const caseAccessWhere = canViewCases ? getCaseListAccessWhereOrNull(viewer, "case:view") : null

        const [cases, tasks, events, timeLogs] = await Promise.all([
            canViewCases
                ? prisma.case.findMany({
                      where: caseAccessWhere ?? {},
                      take: 5,
                      orderBy: { updatedAt: "desc" },
                      include: {
                          tasks: { where: { tenantId } },
                          client: true,
                      },
                  })
                : Promise.resolve([]),
            prisma.task.findMany({
                where: { tenantId, assigneeId: user.id, status: { not: "DONE" } },
                take: 5,
                orderBy: { priority: 'asc' },
                select: {
                    id: true,
                    title: true,
                    dueDate: true,
                    priority: true,
                    caseId: true,
                    ...(canViewCases ? { case: { select: { id: true, title: true, caseCode: true } } } : {}),
                },
            }),
            prisma.event.findMany({
                where: {
                    tenantId,
                    status: "SCHEDULED",
                    startTime: { gte: new Date() },
                    OR: [
                        { creatorId: user.id },
                        { participants: { some: { userId: user.id } } },
                        ...(canViewCases && caseAccessWhere ? [{ case: caseAccessWhere }] : []),
                    ],
                },
                take: 5,
                orderBy: { startTime: 'asc' },
                select: {
                    id: true,
                    title: true,
                    type: true,
                    startTime: true,
                    endTime: true,
                    caseId: true,
                    ...(canViewCases ? { case: { select: { id: true, title: true, caseCode: true } } } : {}),
                },
            }),
            canViewCases
                ? prisma.timeLog.findMany({
                      where: { tenantId, userId: user.id },
                      orderBy: { createdAt: "desc" },
                      take: 5,
                  })
                : Promise.resolve([]),
        ])

        const tasksDto: Array<{
            id: string
            title: string
            dueDate: Date | null
            priority: TaskPriority
            case: { id: string; title: string; caseCode: string | null } | null
        }> = tasks.map((t) => ({
            id: t.id,
            title: t.title,
            dueDate: t.dueDate,
            priority: t.priority,
            case: "case" in t ? t.case : null,
        }))

        const eventsDto: Array<{
            id: string
            title: string
            type: EventType
            startTime: Date
            endTime: Date
            case: { id: string; title: string; caseCode: string | null } | null
        }> = events.map((e) => ({
            id: e.id,
            title: e.title,
            type: e.type,
            startTime: e.startTime,
            endTime: e.endTime,
            case: "case" in e ? e.case : null,
        }))

        return {
            success: true as const,
            data: {
                user,
                membershipRole: ctx.membership.role,
                cases,
                tasks: tasksDto,
                events: eventsDto,
                timeLogs,
            },
        }
    } catch (error) {
        logger.error("仪表盘数据加载失败", error)
        return {
            success: false as const,
            error: "仪表盘数据加载失败",
            data: {
                user: ctx.user,
                membershipRole: ctx.membership.role,
                cases: [],
                tasks: [],
                events: [],
                timeLogs: [],
            },
        }
    }
}

export async function getCases(
    query?: string,
    status?: string,
    type?: string
) {
    const parsed = z
        .object({
            query: z.string().trim().min(1).optional(),
            status: z.union([z.literal("all"), z.nativeEnum(CaseStatus)]).optional(),
            type: z.union([z.literal("all"), z.nativeEnum(ServiceType)]).optional(),
        })
        .strict()
        .safeParse({ query, status, type })
    if (!parsed.success) {
        logger.warn("getCases 输入校验失败", { issues: parsed.error.flatten() })
        return []
    }
    const request = parsed.data

    const ctx = await getActiveTenantContextWithPermissionOrThrow("case:view")  
    const listRate = await enforceRateLimit({ ctx, action: "cases.list", limit: 600 })
    if (!listRate.allowed) return []

    const { tenantId, viewer } = ctx
    const accessWhere = getCaseListAccessWhereOrThrow(viewer, "case:view")      

    const where: Prisma.CaseWhereInput = {}

    if (request.query) {
        where.OR = [
            { title: { contains: request.query } },
            { caseCode: { contains: request.query } },
            { client: { name: { contains: request.query } } }
        ]
    }

    if (request.status && request.status !== "all") {
        where.status = request.status
    }

    if (request.type && request.type !== "all") {
        where.serviceType = request.type
    }

    const cases = await prisma.case.findMany({
        where: { AND: [where, accessWhere] },
        orderBy: { updatedAt: 'desc' },
        take: 500,
        include: {
            client: true
        }
    })

    const caseIds = cases.map((c) => c.id)
    const taskStatsByCaseId = new Map<string, { total: number; done: number }>()

    if (caseIds.length) {
        const grouped = await prisma.task.groupBy({
            by: ["caseId", "status"],
            where: {
                tenantId,
                caseId: { in: caseIds },
            },
            _count: { _all: true },
        })

        grouped.forEach((row) => {
            const caseId = row.caseId
            if (!caseId) return
            const current = taskStatsByCaseId.get(caseId) ?? { total: 0, done: 0 }
            current.total += row._count._all
            if (row.status === "DONE") current.done += row._count._all
            taskStatsByCaseId.set(caseId, current)
        })
    }

    return cases.map((c) => {
        const stats = taskStatsByCaseId.get(c.id) ?? { total: 0, done: 0 }
        const progress = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0

        return {
            ...c,
            contractValue: c.contractValue ? Number(c.contractValue) : null,
            taskStats: { ...stats, progress },
        }
    })
}

export async function getCaseDetails(id: string) {
    const parsed = UuidSchema.safeParse(id)
    if (!parsed.success) {
        logger.warn("getCaseDetails 输入校验失败", { issues: parsed.error.flatten() })
        throw new Error("输入校验失败")
    }
    id = parsed.data

    const ctx = await getActiveTenantContextWithPermissionOrThrow("case:view")  
    const detailRate = await enforceRateLimit({
        ctx,
        action: "cases.detail.get",
        limit: 300,
    })
    if (!detailRate.allowed) throw new UserFacingError(detailRate.error)

    const { tenantId, viewer } = ctx
    const accessWhere = getCaseListAccessWhereOrThrow(viewer, "case:view")      

    const caseItem = await prisma.case.findFirst({
        where: { AND: [{ id }, accessWhere] },
        include: {
            events: { where: { tenantId } },
            documents: true,
            members: { include: { user: true } },
            originator: true,
            handler: true,
            client: true
        }
    })

    if (!caseItem) return null

    const grouped = await prisma.task.groupBy({
        by: ["status"],
        where: { tenantId, caseId: id },
        _count: { _all: true },
    })

    const counts: Record<TaskStatus, number> = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 }
    grouped.forEach((row) => {
        counts[row.status] = row._count._all
    })

    const total = counts.TODO + counts.IN_PROGRESS + counts.REVIEW + counts.DONE
    const done = counts.DONE
    const openTotal = total - done
    const progress = total > 0 ? Math.round((done / total) * 100) : 0

    const openTasksPreview = await prisma.task.findMany({
        where: { tenantId, caseId: id, status: { not: "DONE" } },
        orderBy: [
            { dueDate: { sort: "asc", nulls: "last" } },
            { updatedAt: "desc" },
            { id: "desc" },
        ],
        take: 6,
        select: {
            id: true,
            title: true,
            status: true,
            dueDate: true,
            updatedAt: true,
        },
    })

    return {
        ...caseItem,
        contractValue: caseItem.contractValue ? Number(caseItem.contractValue) : null,
        taskStats: { total, done, openTotal, progress, counts },
        openTasksPreview,
    }
}
