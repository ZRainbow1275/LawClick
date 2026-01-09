"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { getActiveTenantContextWithPermissionOrThrow } from "@/lib/server-auth"
import { UuidSchema } from "@/lib/zod"

const ListAiInvocationsInputSchema = z
    .object({
        take: z.number().int().min(1).max(100).optional(),
        conversationId: UuidSchema.optional(),
    })
    .strict()

type AiInvocationDTO = {
    id: string
    type: string
    status: string
    provider: string
    model: string
    conversationId: string | null
    error: string | null
    tokenUsage: unknown
    createdAt: string
}

export async function listAiInvocations(input?: unknown) {
    try {
        const parsed = ListAiInvocationsInputSchema.safeParse(input ?? {})
        if (!parsed.success) {
            return { success: false as const, error: "输入校验失败", data: [] as AiInvocationDTO[] }
        }

        const ctx = await getActiveTenantContextWithPermissionOrThrow("ai:use")
        const rate = await enforceRateLimit({
            ctx,
            action: "ai.invocations.list",
            limit: 1200,
            extraKey: parsed.data.conversationId || "",
        })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [] as AiInvocationDTO[] }
        }

        const { tenantId, user } = ctx
        const take = parsed.data.take ?? 50

        const rows = await prisma.aIInvocation.findMany({
            where: {
                tenantId,
                userId: user.id,
                ...(parsed.data.conversationId ? { conversationId: parsed.data.conversationId } : {}),
            },
            orderBy: { createdAt: "desc" },
            take,
            select: {
                id: true,
                type: true,
                status: true,
                provider: true,
                model: true,
                conversationId: true,
                error: true,
                tokenUsage: true,
                createdAt: true,
            },
        })

        return {
            success: true as const,
            data: rows.map((r) => ({
                id: r.id,
                type: r.type,
                status: r.status,
                provider: r.provider,
                model: r.model,
                conversationId: r.conversationId,
                error: r.error,
                tokenUsage: r.tokenUsage,
                createdAt: r.createdAt.toISOString(),
            })),
        }
    } catch (error) {
        logger.error("listAiInvocations failed", error)
        return {
            success: false as const,
            error: getPublicActionErrorMessage(error, "获取调用记录失败"),
            data: [] as AiInvocationDTO[],
        }
    }
}
