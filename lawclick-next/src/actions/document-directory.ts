"use server"

import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { buildCaseVisibilityWhere } from "@/lib/case-visibility"
import { getActiveTenantContextOrThrow, requireCaseAccess, requireTenantPermission } from "@/lib/server-auth"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { OptionalNonEmptyString, UuidSchema } from "@/lib/zod"
import { z } from "zod"

const GetDocumentDirectoryOptionsSchema = z
    .object({
        query: OptionalNonEmptyString(200),
        caseId: UuidSchema.optional(),
        take: z.coerce.number().int().min(1).max(50).optional(),
        skip: z.coerce.number().int().min(0).max(10_000).optional(),
        categories: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
    })
    .strict()
    .optional()

export async function getDocumentDirectory(options?: {
    query?: string
    caseId?: string
    take?: number
    skip?: number
    categories?: string[]
}) {
    type DocumentDirectoryRow = Prisma.DocumentGetPayload<{
        select: {
            id: true
            title: true
            category: true
            fileType: true
            updatedAt: true
            case: { select: { id: true; title: true; caseCode: true } }
        }
    }>

    try {
        const parsed = GetDocumentDirectoryOptionsSchema.safeParse(options)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败", data: [] as DocumentDirectoryRow[], total: 0 }
        }
        options = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "document:view")
        const { tenantId, user } = ctx

        const rate = await enforceRateLimit({ ctx, action: "documents.directory.list", limit: 600 })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [] as DocumentDirectoryRow[], total: 0 }
        }

        const take = Math.max(1, Math.min(50, options?.take ?? 20))
        const skip = Math.max(0, options?.skip ?? 0)
        const query = (options?.query || "").trim()

        if (options?.caseId) {
            await requireCaseAccess(options.caseId, user, "case:view")
        }

        const where: Prisma.DocumentWhereInput = {
            case: buildCaseVisibilityWhere({ userId: user.id, role: user.role, tenantId }),
        }

        if (options?.caseId) where.caseId = options.caseId
        if (query) {
            where.OR = [
                { title: { contains: query, mode: "insensitive" } },
                { notes: { contains: query, mode: "insensitive" } },
            ]
        }

        const categories = (options?.categories || []).map((c) => c.trim()).filter(Boolean)
        if (categories.length) {
            where.category = { in: categories }
        }

        const [items, total] = await prisma.$transaction([
            prisma.document.findMany({
                where,
                take,
                skip,
                orderBy: { updatedAt: "desc" },
                select: {
                    id: true,
                    title: true,
                    category: true,
                    fileType: true,
                    updatedAt: true,
                    case: { select: { id: true, title: true, caseCode: true } },
                },
            }),
            prisma.document.count({ where }),
        ])

        return { success: true as const, data: items, total }
    } catch (error) {
        logger.error("获取文档目录失败", error)
        return { success: false as const, error: "获取文档目录失败", data: [] as DocumentDirectoryRow[], total: 0 }
    }
}
