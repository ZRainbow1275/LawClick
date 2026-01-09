"use server"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { getActiveTenantContextWithPermissionOrThrow } from "@/lib/server-auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { z } from "zod"
import { UuidSchema } from "@/lib/zod"

const GetMyNotificationsOptionsSchema = z
    .object({
        take: z.number().int().min(1).max(200).optional(),
        unreadOnly: z.boolean().optional(),
    })
    .strict()
    .optional()

export async function getMyNotifications(options?: { take?: number; unreadOnly?: boolean }) {
    try {
        const parsed = GetMyNotificationsOptionsSchema.safeParse(options)
        if (!parsed.success) {
            return { success: false as const, items: [], unreadCount: 0, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        options = parsed.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:view")
        const { user, tenantId } = ctx

        const rate = await checkRateLimit({
            key: `notifications:list:${tenantId}:${user.id}`,
            limit: 60,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            logger.warn("notifications.list rate limited", { tenantId, userId: user.id })
            return { success: false as const, items: [], unreadCount: 0, error: "请求过于频繁，请稍后重试" }
        }

        const take = Math.max(1, Math.min(options?.take ?? 20, 200))

        const where = {
            tenantId,
            userId: user.id,
            ...(options?.unreadOnly ? { readAt: null } : {}),
        }

        const [items, unreadCount] = await prisma.$transaction([
            prisma.notification.findMany({
                where,
                take,
                orderBy: { createdAt: "desc" },
                include: {
                    actor: { select: { id: true, name: true, email: true, avatarUrl: true } },
                },
            }),
            prisma.notification.count({
                where: { tenantId, userId: user.id, readAt: null },
            }),
        ])

        return { success: true as const, items, unreadCount }
    } catch (error) {
        logger.error("Get notifications failed", error)
        return { success: false as const, items: [], unreadCount: 0, error: "获取通知失败" }
    }
}

export async function markNotificationRead(notificationId: string) {
    try {
        const parsedId = UuidSchema.safeParse((notificationId || "").trim())
        if (!parsedId.success) return { success: false as const, error: "输入校验失败" }
        notificationId = parsedId.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:view")
        const { user, tenantId } = ctx

        const rate = await checkRateLimit({
            key: `notifications:read:${tenantId}:${user.id}`,
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            logger.warn("notifications.read rate limited", { tenantId, userId: user.id })
            return { success: false as const, error: "请求过于频繁，请稍后重试" }
        }

        const res = await prisma.notification.updateMany({
            where: { tenantId, id: notificationId, userId: user.id, readAt: null },
            data: { readAt: new Date() },
        })

        return { success: true as const, updated: res.count }
    } catch (error) {
        logger.error("Mark notification read failed", error)
        return { success: false as const, error: "标记已读失败" }
    }
}

export async function markAllNotificationsRead() {
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:view")
        const { user, tenantId } = ctx

        const rate = await checkRateLimit({
            key: `notifications:read_all:${tenantId}:${user.id}`,
            limit: 30,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            logger.warn("notifications.read_all rate limited", { tenantId, userId: user.id })
            return { success: false as const, error: "请求过于频繁，请稍后重试" }
        }

        const res = await prisma.notification.updateMany({
            where: { tenantId, userId: user.id, readAt: null },
            data: { readAt: new Date() },
        })

        return { success: true as const, updated: res.count }
    } catch (error) {
        logger.error("Mark all notifications read failed", error)
        return { success: false as const, error: "全部已读失败" }
    }
}
