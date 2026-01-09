"use server"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { getActiveTenantContextOrThrow, requireTenantPermission } from "@/lib/server-auth"
import { TenantMembershipStatus, type Prisma } from "@prisma/client"
import { z } from "zod"
import { OptionalNonEmptyString } from "@/lib/zod"

const GetTeamDirectoryOptionsSchema = z
    .object({
        query: OptionalNonEmptyString(200),
        take: z.coerce.number().int().min(1).max(300).optional(),
        skip: z.coerce.number().int().min(0).max(10_000).optional(),
        includeInactive: z.boolean().optional(),
    })
    .strict()
    .optional()

export async function getTeamDirectory(options?: {
    query?: string
    take?: number
    skip?: number
    includeInactive?: boolean
}) {
    try {
        const parsed = GetTeamDirectoryOptionsSchema.safeParse(options)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败", data: [], total: 0 }
        }
        options = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "team:view")
        const { tenantId } = ctx

        const rate = await enforceRateLimit({ ctx, action: "team.directory.get", limit: 600 })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [], total: 0 }
        }

        const take = Math.max(1, Math.min(300, options?.take ?? 50))
        const skip = Math.max(0, options?.skip ?? 0)
        const query = (options?.query || "").trim()

        const userWhere: Prisma.UserWhereInput = {
            ...(options?.includeInactive ? {} : { isActive: true }),
        }
        if (query) {
            userWhere.OR = [
                { name: { contains: query } },
                { email: { contains: query } },
                { department: { contains: query } },
                { title: { contains: query } },
            ]
        }

        const where: Prisma.TenantMembershipWhereInput = {
            tenantId,
            status: TenantMembershipStatus.ACTIVE,
            user: userWhere,
        }

        const [items, total] = await prisma.$transaction([
            prisma.tenantMembership.findMany({
                where,
                take,
                skip,
                orderBy: [{ user: { isActive: "desc" } }, { user: { name: "asc" } }],
                select: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                            avatarUrl: true,
                            department: true,
                            title: true,
                            status: true,
                            statusMessage: true,
                            lastActiveAt: true,
                        },
                    },
                },
            }),
            prisma.tenantMembership.count({ where }),
        ])

        return { success: true as const, data: items.map((row) => row.user), total }
    } catch (error) {
        logger.error("获取团队成员失败", error)
        return { success: false as const, error: "获取团队成员失败", data: [], total: 0 }
    }
}
