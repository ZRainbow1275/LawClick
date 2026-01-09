import "server-only"

import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

type TenantGuardDb = Pick<Prisma.TransactionClient, "tenantMembership" | "customerTag" | "contact">

export async function ensureUsersInTenant(input: {
    tenantId: string
    userIds: string[]
    db?: TenantGuardDb
}): Promise<boolean> {
    const tenantId = input.tenantId.trim()
    if (!tenantId) return false

    const userIds = Array.from(new Set(input.userIds.map((id) => id.trim()).filter((id) => id.length > 0)))
    if (userIds.length === 0) return true

    const db = input.db ?? prisma
    const count = await db.tenantMembership.count({ where: { tenantId, userId: { in: userIds }, status: "ACTIVE" } })
    return count === userIds.length
}

export async function ensureCustomerTagsInTenant(input: {
    tenantId: string
    tagIds: string[]
    db?: TenantGuardDb
}): Promise<boolean> {
    const tenantId = input.tenantId.trim()
    if (!tenantId) return false

    const tagIds = Array.from(new Set(input.tagIds.map((id) => id.trim()).filter((id) => id.length > 0)))
    if (tagIds.length === 0) return true

    const db = input.db ?? prisma
    const count = await db.customerTag.count({ where: { tenantId, id: { in: tagIds } } })
    return count === tagIds.length
}

export async function ensureContactsInTenant(input: {
    tenantId: string
    contactIds: string[]
    db?: TenantGuardDb
}): Promise<boolean> {
    const tenantId = input.tenantId.trim()
    if (!tenantId) return false

    const contactIds = Array.from(new Set(input.contactIds.map((id) => id.trim()).filter((id) => id.length > 0)))
    if (contactIds.length === 0) return true

    const db = input.db ?? prisma
    const count = await db.contact.count({ where: { tenantId, id: { in: contactIds } } })
    return count === contactIds.length
}
