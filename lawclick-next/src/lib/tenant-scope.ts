import "server-only"

import type { Prisma } from "@prisma/client"

export function invoiceTenantScope(tenantId: string): Prisma.InvoiceWhereInput {
    return { tenantId }
}

export function contractTenantScope(tenantId: string): Prisma.ContractWhereInput {
    return { tenantId, deletedAt: null }
}

export function approvalTenantScope(tenantId: string): Prisma.ApprovalRequestWhereInput {
    return { tenantId }
}
