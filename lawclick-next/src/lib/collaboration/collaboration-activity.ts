import "server-only"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import type { ActionResponse } from "@/lib/action-response"
import { ensureUsersInTenant } from "@/lib/tenant-guards"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { UuidSchema } from "@/lib/zod"
import {
    AuthError,
    PermissionError,
    getActiveTenantContextWithPermissionOrThrow,
    requireTenantPermission,
} from "@/lib/server-auth"

export type UserActivityItem =
    | { type: "task_complete"; id: string; title: string; time: Date }
    | { type: "time_log"; id: string; title: string; time: Date }
    | { type: "event"; id: string; title: string; time: Date }

export type TeamActivityItem =
    | {
          type: "task_complete"
          id: string
          title: string
          userName: string | null | undefined
          userAvatar: string | null | undefined
          time: Date
      }
    | {
          type: "event_created"
          id: string
          title: string
          userName: string | null | undefined
          userAvatar: string | null | undefined
          time: Date
      }

export async function getUserActivityImpl(
    userId: string
): Promise<ActionResponse<{ data: UserActivityItem[] }, { data: UserActivityItem[] }>> {
    try {
        const parsedId = UuidSchema.safeParse(userId)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败", data: [] }
        }
        userId = parsedId.data

        let ctx: Awaited<ReturnType<typeof getActiveTenantContextWithPermissionOrThrow>>
        try {
            ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
        } catch (error) {
            if (error instanceof AuthError) return { success: false, error: "请先登录", data: [] }
            if (error instanceof PermissionError)
                return {
                    success: false,
                    error: getPublicActionErrorMessage(error, "权限不足"),
                    data: [],
                }
            throw error
        }

        const { tenantId, user: viewer } = ctx

        const rate = await enforceRateLimit({
            ctx,
            action: "collaboration.userActivity.get",
            limit: 240,
            extraKey: userId,
        })
        if (!rate.allowed) {
            return { success: false, error: rate.error, data: [] }
        }

        if (userId !== viewer.id) {
            requireTenantPermission(ctx, "user:view_all")
        }

        const targetOk = await ensureUsersInTenant({ tenantId, userIds: [userId] })
        if (!targetOk) {
            return { success: false, error: "用户不存在", data: [] }
        }

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

        // 获取最近完成的任务
        const tasks = await prisma.task.findMany({
            where: {
                tenantId,
                assigneeId: userId,
                status: "DONE",
                updatedAt: { gte: sevenDaysAgo },
            },
            take: 10,
            orderBy: { updatedAt: "desc" },
            select: { id: true, title: true, updatedAt: true },
        })

        // 获取工时记录
        const timeLogs = await prisma.timeLog.findMany({
            where: {
                tenantId,
                userId,
                startTime: { gte: sevenDaysAgo },
            },
            take: 10,
            orderBy: { startTime: "desc" },
            select: {
                id: true,
                description: true,
                duration: true,
                startTime: true,
                case: { select: { title: true } },
            },
        })

        // 获取参加的日程
        const events = await prisma.event.findMany({
            where: {
                tenantId,
                creatorId: userId,
                startTime: { gte: sevenDaysAgo },
            },
            take: 10,
            orderBy: { startTime: "desc" },
            select: { id: true, title: true, type: true, startTime: true },
        })

        // 合并并按时间排序
        const activities = [
            ...tasks.map((t) => ({
                type: "task_complete" as const,
                id: t.id,
                title: `完成任务：${t.title}`,
                time: t.updatedAt,
            })),
            ...timeLogs.map((t) => ({
                type: "time_log" as const,
                id: t.id,
                title: `记录工时：${t.case?.title || t.description || "工作"}`,
                time: t.startTime,
            })),
            ...events.map((e) => ({
                type: "event" as const,
                id: e.id,
                title: `${e.type}：${e.title}`,
                time: e.startTime,
            })),
        ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

        return { success: true, data: activities.slice(0, 20) }
    } catch (error) {
        logger.error("获取用户活动失败", error)
        return { success: false, error: "获取用户活动失败", data: [] }
    }
}

export async function getTeamActivityImpl(): Promise<
    ActionResponse<{ data: TeamActivityItem[] }, { data: TeamActivityItem[] }>
> {
    try {
        let ctx: Awaited<ReturnType<typeof getActiveTenantContextWithPermissionOrThrow>>
        try {
            ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
        } catch (error) {
            if (error instanceof AuthError) return { success: false, error: "请先登录", data: [] }
            if (error instanceof PermissionError)
                return {
                    success: false,
                    error: getPublicActionErrorMessage(error, "权限不足"),
                    data: [],
                }
            throw error
        }

        const { tenantId } = ctx

        const rate = await enforceRateLimit({ ctx, action: "collaboration.teamActivity.get", limit: 240 })
        if (!rate.allowed) {
            return { success: false, error: rate.error, data: [] }
        }

        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

        // 获取最近完成的任务（全团队）
        const tasks = await prisma.task.findMany({
            where: {
                tenantId,
                status: "DONE",
                updatedAt: { gte: oneDayAgo },
            },
            take: 20,
            orderBy: { updatedAt: "desc" },
            select: {
                id: true,
                title: true,
                updatedAt: true,
                assignee: { select: { name: true, avatarUrl: true } },
            },
        })

        // 获取新创建的日程
        const events = await prisma.event.findMany({
            where: {
                createdAt: { gte: oneDayAgo },
                tenantId,
            },
            take: 10,
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                title: true,
                type: true,
                createdAt: true,
                creator: { select: { name: true, avatarUrl: true } },
            },
        })

        // 合并活动
        const activities = [
            ...tasks.map((t) => ({
                type: "task_complete" as const,
                id: t.id,
                title: `${t.assignee?.name || "未知"} 完成了任务：${t.title}`,
                userName: t.assignee?.name,
                userAvatar: t.assignee?.avatarUrl,
                time: t.updatedAt,
            })),
            ...events.map((e) => ({
                type: "event_created" as const,
                id: e.id,
                title: `${e.creator?.name || "未知"} 创建了${e.type}：${e.title}`,
                userName: e.creator?.name,
                userAvatar: e.creator?.avatarUrl,
                time: e.createdAt,
            })),
        ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

        return { success: true, data: activities.slice(0, 30) }
    } catch (error) {
        logger.error("获取团队活动失败", error)
        return { success: false, error: "获取团队活动失败", data: [] }
    }
}

