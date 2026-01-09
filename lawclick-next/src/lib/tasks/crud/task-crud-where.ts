import "server-only"

import type { Prisma } from "@prisma/client"

import type { getActiveTenantContextOrThrow } from "@/lib/server-auth"
import {
    getCaseListAccessWhereOrNull,
    getProjectListAccessWhereOrNull,
    requireCaseAccess,
    requireProjectAccess,
} from "@/lib/server-auth"
import { ensureUsersInTenant } from "@/lib/tenant-guards"
import type { GetAccessibleTasksOptions } from "@/lib/tasks/crud/task-crud-types"

type TenantUser = Awaited<ReturnType<typeof getActiveTenantContextOrThrow>>["user"]

export function pushActiveParentsClauses(andClauses: Prisma.TaskWhereInput[]): void {
    andClauses.push({ OR: [{ caseId: null }, { case: { deletedAt: null } }] })
    andClauses.push({ OR: [{ projectId: null }, { project: { deletedAt: null } }] })
}

export function buildTaskSearchWhere(search: string): Prisma.TaskWhereInput {
    const q = search.trim()
    if (!q) return {}
    return {
        OR: [
            { title: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { case: { title: { contains: q, mode: "insensitive" } } },
            { case: { caseCode: { contains: q, mode: "insensitive" } } },
            { project: { title: { contains: q, mode: "insensitive" } } },
            { project: { projectCode: { contains: q, mode: "insensitive" } } },
            { assignee: { name: { contains: q, mode: "insensitive" } } },
            { assignee: { email: { contains: q, mode: "insensitive" } } },
        ],
    }
}

export async function buildAccessibleTasksWhereForBoard(args: {
    user: TenantUser
    tenantId: string
    options?: GetAccessibleTasksOptions
}): Promise<Prisma.TaskWhereInput | null> {
    const { user, tenantId, options } = args

    const where: Prisma.TaskWhereInput = { tenantId, status: { not: "DONE" } }
    const andClauses: Prisma.TaskWhereInput[] = []
    pushActiveParentsClauses(andClauses)

    if (options?.caseId) {
        await requireCaseAccess(options.caseId, user, "case:view")
        where.caseId = options.caseId
    }
    if (options?.projectId) {
        await requireProjectAccess(options.projectId, user, "task:view")
        where.projectId = options.projectId
    }

    if (options?.assigneeId) {
        const ok = await ensureUsersInTenant({ tenantId, userIds: [options.assigneeId] })
        if (!ok) return null
        where.assigneeId = options.assigneeId
    }
    if (options?.status?.length) where.status = { in: options.status }
    if (options?.search) andClauses.push(buildTaskSearchWhere(options.search))

    if (user.role !== "PARTNER" && user.role !== "ADMIN") {
        const caseAccessWhere = getCaseListAccessWhereOrNull(user, "case:view")
        const projectAccessWhere = getProjectListAccessWhereOrNull(user, "task:view")

        const ors: Prisma.TaskWhereInput[] = []
        if (caseAccessWhere) ors.push({ case: caseAccessWhere })
        if (projectAccessWhere) ors.push({ project: projectAccessWhere })

        if (ors.length) {
            andClauses.push({ OR: ors })
        } else {
            if (options?.assigneeId && options.assigneeId !== user.id) {
                return null
            }
            where.assigneeId = user.id
        }
    }

    if (andClauses.length) {
        where.AND = andClauses
    }

    return where
}

