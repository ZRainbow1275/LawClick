import "server-only"

import { prisma } from "@/lib/prisma"
import { TenantMembershipRole, TenantMembershipStatus } from "@prisma/client"

export async function listTenantAdminUserIds(tenantId: string): Promise<string[]> {
    const memberships = await prisma.tenantMembership.findMany({
        where: {
            tenantId,
            status: TenantMembershipStatus.ACTIVE,
            role: { in: [TenantMembershipRole.OWNER, TenantMembershipRole.ADMIN] },
            user: { isActive: true },
        },
        select: { userId: true },
    })

    return memberships.map((m) => m.userId)
}

