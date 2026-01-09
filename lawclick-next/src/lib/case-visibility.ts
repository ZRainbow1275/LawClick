import type { Prisma, Role } from "@prisma/client"

export function buildCaseVisibilityWhere(input: {
    userId: string
    role: Role
    tenantId: string
    includeDeleted?: boolean
}): Prisma.CaseWhereInput {
    const tenantId = input.tenantId
    const base: Prisma.CaseWhereInput = input.includeDeleted ? { tenantId } : { tenantId, deletedAt: null }
    if (input.role === "PARTNER" || input.role === "ADMIN") return base

    return {
        ...base,
        OR: [
            { originatorId: input.userId },
            { handlerId: input.userId },
            { members: { some: { userId: input.userId } } },
        ],
    }
}
