"use server"

import { z } from "zod"
import { CaseStatus } from "@prisma/client"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import {
    getActiveTenantContextWithPermissionOrThrow,
    getCaseListAccessWhereOrThrow,
    hasTenantPermission,
} from "@/lib/server-auth"

const AiCaseOptionsInputSchema = z
    .object({
        query: z.string().trim().min(1).max(100).optional(),
        take: z.number().int().min(1).max(200).optional(),
        includeArchived: z.boolean().optional(),
    })
    .strict()

type AiCaseOption = {
    id: string
    title: string
    caseCode: string | null
    serviceType: string
    status: string
    updatedAt: string
}

export async function getAiCaseOptions(input?: unknown) {
    try {
        const parsed = AiCaseOptionsInputSchema.safeParse(input ?? {})
        if (!parsed.success) {
            return { success: false as const, error: "输入校验失败", data: [] as AiCaseOption[] }
        }

        const ctx = await getActiveTenantContextWithPermissionOrThrow("ai:use")
        const canViewCases = hasTenantPermission(ctx, "case:view")
        if (!canViewCases) {
            return { success: false as const, error: "缺少案件查看权限", data: [] as AiCaseOption[] }
        }

        const rate = await enforceRateLimit({
            ctx,
            action: "ai.caseOptions.list",
            limit: 1200,
            extraKey: parsed.data.query || "",
        })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [] as AiCaseOption[] }
        }

        const { tenantId, viewer } = ctx
        const accessWhere = getCaseListAccessWhereOrThrow(viewer, "case:view")

        const take = parsed.data.take ?? 60
        const includeArchived = parsed.data.includeArchived ?? false
        const query = parsed.data.query

        const where: Prisma.CaseWhereInput = {
            AND: [
                { tenantId },
                accessWhere,
                ...(includeArchived ? [] : [{ status: { not: CaseStatus.ARCHIVED } }]),
                ...(query
                    ? [
                          {
                              OR: [
                                  { title: { contains: query } },
                                  { caseCode: { contains: query } },
                              ],
                          },
                      ]
                    : []),
            ],
        }

        const rows = await prisma.case.findMany({
            where,
            orderBy: { updatedAt: "desc" },
            take,
            select: {
                id: true,
                title: true,
                caseCode: true,
                serviceType: true,
                status: true,
                updatedAt: true,
            },
        })

        return {
            success: true as const,
            data: rows.map((c) => ({
                id: c.id,
                title: c.title,
                caseCode: c.caseCode,
                serviceType: c.serviceType,
                status: c.status,
                updatedAt: c.updatedAt.toISOString(),
            })),
        }
    } catch (error) {
        logger.error("getAiCaseOptions failed", error)
        return {
            success: false as const,
            error: getPublicActionErrorMessage(error, "获取案件列表失败"),
            data: [] as AiCaseOption[],
        }
    }
}
