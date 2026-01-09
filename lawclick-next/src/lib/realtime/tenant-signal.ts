import "server-only"

import type { Prisma } from "@prisma/client"
import { TenantSignalKind } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { publishTenantSignalBus } from "@/lib/realtime/tenant-signal-bus"
import { runWithTenantRequestContext } from "@/lib/tenant-context"

export async function touchTenantSignal(input: {
    tenantId: string
    kind: TenantSignalKind
    payload?: Prisma.InputJsonValue
    db?: Prisma.TransactionClient
}) {
    const tenantId = input.tenantId.trim()
    if (!tenantId) {
        throw new Error("tenantId 不能为空")
    }

    const db = input.db ?? prisma

    const now = new Date()
    const data = await runWithTenantRequestContext({ tenantId, userId: null }, async () => {
        return db.tenantSignal.upsert({
            where: { tenantId_kind: { tenantId, kind: input.kind } },
            update: {
                version: { increment: 1 },
                updatedAt: now,
                ...(input.payload === undefined ? {} : { payload: input.payload }),
            },
            create: {
                tenantId,
                kind: input.kind,
                version: 1,
                ...(input.payload === undefined ? {} : { payload: input.payload }),
                createdAt: now,
                updatedAt: now,
            },
            select: { updatedAt: true, payload: true, version: true },
        })
    })

    publishTenantSignalBus({
        tenantId,
        kind: input.kind,
        updatedAt: data.updatedAt,
        payload: data.payload,
        version: data.version,
    })
}
