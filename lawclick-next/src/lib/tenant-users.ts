import "server-only"

import type { Prisma } from "@prisma/client"
import { TenantMembershipStatus } from "@prisma/client"

import { prisma } from "@/lib/prisma"

export type TenantUserLite = {
    id: string
    name: string | null
    email: string
}

type TenantUsersDb = Pick<Prisma.TransactionClient, "tenantMembership">

function normalizeTenantId(input: string): string {
    return input.trim()
}

export async function filterActiveTenantMemberUserIds(input: {
    tenantId: string
    userIds: string[]
    db?: TenantUsersDb
}): Promise<string[]> {
    const tenantId = normalizeTenantId(input.tenantId)
    if (!tenantId) return []

    const userIds = Array.from(new Set(input.userIds.map((id) => id.trim()).filter((id) => id.length > 0)))
    if (userIds.length === 0) return []

    const db = input.db ?? prisma
    const memberships = await db.tenantMembership.findMany({
        where: { tenantId, userId: { in: userIds }, status: TenantMembershipStatus.ACTIVE },
        select: { userId: true },
    })
    return memberships.map((m) => m.userId)
}

export async function listTenantMemberUsersLite(input: {
    tenantId: string
    take?: number
    includeInactiveUsers?: boolean
    db?: TenantUsersDb
}): Promise<TenantUserLite[]> {
    const tenantId = normalizeTenantId(input.tenantId)
    if (!tenantId) return []

    const take = Math.max(1, Math.min(500, input.take ?? 100))
    const db = input.db ?? prisma

    const items = await db.tenantMembership.findMany({
        where: {
            tenantId,
            status: TenantMembershipStatus.ACTIVE,
            user: input.includeInactiveUsers ? {} : { isActive: true },
        },
        orderBy: [{ user: { isActive: "desc" } }, { user: { name: "asc" } }],
        take,
        select: {
            user: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            },
        },
    })

    return items.map((row) => row.user)
}

