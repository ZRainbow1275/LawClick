"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { ChatThreadType, NotificationType, UserStatus, InviteType, type CollaborationInvite, type Prisma } from "@prisma/client"
import {
    AuthError,
    PermissionError,
    getActiveTenantContextWithPermissionOrThrow,
    requireCaseAccess,
    requireProjectAccess,
    requireTenantPermission,
} from "@/lib/server-auth"
import { notifyUsersWithEmailQueue } from "@/lib/notifications"
import { logger } from "@/lib/logger"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { checkRateLimit } from "@/lib/rate-limit"
import type { ActionResponse } from "@/lib/action-response"
import { ensureUsersInTenant } from "@/lib/tenant-guards"
import { z } from "zod"
import { OptionalNonEmptyString, UuidSchema } from "@/lib/zod"
import { getMyInvitesImpl } from "@/lib/collaboration/collaboration-invites"
import {
    getTeamActivityImpl,
    getUserActivityImpl,
} from "@/lib/collaboration/collaboration-activity"

type CollaborationInviteWithNames = Prisma.CollaborationInviteGetPayload<{
    include: {
        sender: { select: { name: true } }
        receiver: { select: { name: true } }
    }
}>



// ==============================================================================
// Phase 2: 状态管理 Actions
// ==============================================================================

// [2.1] 更新用户状态
export async function updateUserStatus(
    status: UserStatus,
    message?: string,
    expiryMinutes?: number
) {
    try {
        const parsed = z
            .object({
                status: z.nativeEnum(UserStatus),
                message: OptionalNonEmptyString(200),
                expiryMinutes: z.number().int().min(1).max(14 * 24 * 60).optional(),
            })
            .strict()
            .safeParse({ status, message, expiryMinutes })
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        status = parsed.data.status
        message = parsed.data.message
        expiryMinutes = parsed.data.expiryMinutes

        const ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
        const { user, tenantId } = ctx

        const rate = await checkRateLimit({
            key: `team:user_status:update:tenant:${tenantId}:user:${user.id}`,  
            limit: 30,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return {
                success: false as const,
                error: `请求过于频繁，请在 ${rate.retryAfterSeconds} 秒后重试`,
            }
        }

        const statusExpiry = expiryMinutes
            ? new Date(Date.now() + expiryMinutes * 60 * 1000)
            : null

        await prisma.user.update({
            where: { id: user.id },
            data: {
                status,
                statusMessage: message || null,
                statusExpiry,
                lastActiveAt: new Date(),
            },
        })

        revalidatePath('/dispatch')
        return { success: true as const }
    } catch (error) {
        if (error instanceof AuthError) {
            return { success: false as const, error: "请先登录" }
        }
        if (error instanceof PermissionError) {
            return { success: false as const, error: getPublicActionErrorMessage(error, "权限不足") }
        }
        logger.error("更新状态失败", error)
        return { success: false as const, error: "更新状态失败" }
    }
}

// [2.1.1] 获取我的用户状态（用于前端同步/恢复）
export async function getMyUserStatus() {
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
        const { user, tenantId } = ctx

        const rate = await checkRateLimit({
            key: `team:user_status:read:tenant:${tenantId}:user:${user.id}`,
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return {
                success: false as const,
                error: `请求过于频繁，请在 ${rate.retryAfterSeconds} 秒后重试`,
                data: null,
            }
        }

        const me = await prisma.user.findUnique({
            where: { id: user.id },
            select: {
                id: true,
                status: true,
                statusMessage: true,
                statusExpiry: true,
                lastActiveAt: true,
            },
        })

        if (!me) {
            return { success: false as const, error: "用户不存在", data: null }
        }

        return { success: true as const, data: me }
    } catch (error) {
        if (error instanceof AuthError) {
            return { success: false as const, error: "请先登录", data: null }
        }
        if (error instanceof PermissionError) {
            return { success: false as const, error: getPublicActionErrorMessage(error, "权限不足"), data: null }
        }
        logger.error("获取我的状态失败", error)
        return { success: false as const, error: "获取我的状态失败", data: null }
    }
}

// [2.2] 获取团队状态
export async function getTeamStatus(options?: { take?: number }) {
    const parsedOptions = z
        .object({
            take: z.number().int().min(1).max(300).optional(),
        })
        .strict()
        .optional()
        .safeParse(options)
    if (!parsedOptions.success) {
        return { success: false as const, error: "输入校验失败", data: [] }
    }
    options = parsedOptions.data

    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
        const { tenantId, user } = ctx

        const rate = await checkRateLimit({
            key: `team:status:tenant:${tenantId}:user:${user.id}`,
            limit: 60,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return {
                success: false as const,
                error: `请求过于频繁，请在 ${rate.retryAfterSeconds} 秒后重试`,
                data: [],
            }
        }

        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)        

        const take = options?.take ?? 300

        const memberships = await prisma.tenantMembership.findMany({
            where: {
                tenantId,
                status: "ACTIVE",
                user: { isActive: true },
            },
            orderBy: { user: { name: "asc" } },
            take,
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
                        // 聚合当前任务信息
                        assignedTasks: {
                            where: { tenantId, status: 'IN_PROGRESS' },
                            take: 1,
                            orderBy: { updatedAt: 'desc' },
                            select: {
                                id: true,
                                title: true,
                                case: { select: { id: true, title: true } },
                            },
                        },
                    },
                },
            },
        })

        const users = memberships.map((row) => row.user)

        const userIds = users.map((u) => u.id)

        const [todayTimeAgg, weekTimeAgg, completedTodayAgg, activeCasesAgg] = await Promise.all([
            prisma.timeLog.groupBy({
                by: ["userId"],
                where: { tenantId, userId: { in: userIds }, startTime: { gte: todayStart } },
                _sum: { duration: true },
            }),
            prisma.timeLog.groupBy({
                by: ["userId"],
                where: { tenantId, userId: { in: userIds }, startTime: { gte: weekStart } },
                _sum: { duration: true },
            }),
            prisma.task.groupBy({
                by: ["assigneeId"],
                where: { tenantId, assigneeId: { in: userIds }, status: "DONE", updatedAt: { gte: todayStart } },
                _count: { _all: true },
            }),
            prisma.caseMember.groupBy({
                by: ["userId"],
                where: { userId: { in: userIds }, case: { tenantId, status: "ACTIVE", deletedAt: null } },
                _count: { _all: true },
            }),
        ])

        const todaySecondsByUser = new Map(todayTimeAgg.map((r) => [r.userId, r._sum.duration ?? 0]))
        const weekSecondsByUser = new Map(weekTimeAgg.map((r) => [r.userId, r._sum.duration ?? 0]))
        const doneCountByUser = new Map(completedTodayAgg.map((r) => [r.assigneeId as string, r._count._all]))
        const activeCaseCountByUser = new Map(activeCasesAgg.map((r) => [r.userId, r._count._all]))

        // 格式化返回数据
        const formattedUsers = users.map(user => ({
            id: user.id,
            name: user.name || user.email,
            role: user.title || user.role,
            avatarUrl: user.avatarUrl,
            department: user.department,
            status: user.status,
            statusMessage: user.statusMessage,
            lastActiveAt: user.lastActiveAt,
            currentTask: user.assignedTasks[0]?.title || null,
            currentCase: user.assignedTasks[0]?.case?.title || null,
            todayHours: Math.round(((todaySecondsByUser.get(user.id) ?? 0) / 3600) * 10) / 10,
            weeklyHours: Math.round(((weekSecondsByUser.get(user.id) ?? 0) / 3600) * 10) / 10,
            activeCases: activeCaseCountByUser.get(user.id) ?? 0,
            completedToday: doneCountByUser.get(user.id) ?? 0,
        }))

        return { success: true as const, data: formattedUsers }
    } catch (error) {
        if (error instanceof AuthError) {
            return { success: false as const, error: "请先登录", data: [] }
        }
        if (error instanceof PermissionError) {
            return { success: false as const, error: getPublicActionErrorMessage(error, "权限不足"), data: [] }
        }
        logger.error("获取团队状态失败", error)
        return { success: false as const, error: "获取团队状态失败", data: [] }
    }
}

// [2.3] 获取用户详情
export async function getUserDetail(userId: string) {
    try {
        const parsedId = UuidSchema.safeParse(userId)
        if (!parsedId.success) {
            return { success: false as const, error: "输入校验失败" }
        }
        userId = parsedId.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
        const rate = await enforceRateLimit({ ctx, action: "team.user.detail.get", limit: 240 })
        if (!rate.allowed) return { success: false as const, error: rate.error }
        const { user: viewer, tenantId } = ctx
        if (userId !== viewer.id) {
            requireTenantPermission(ctx, "user:view_all")
        }

        const user = await prisma.user.findFirst({
            where: {
                id: userId,
                tenantMemberships: { some: { tenantId, status: "ACTIVE" } },
            },
            include: {
                assignedTasks: {
                    where: { tenantId, status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] } },
                    take: 5,
                    orderBy: { updatedAt: 'desc' },
                    include: { case: { select: { title: true } } },
                },
                caseMemberships: {
                    where: { case: { tenantId, status: 'ACTIVE' } },
                    include: { case: { select: { id: true, title: true, caseCode: true } } },
                },
            },
        })

        if (!user) {
            return { success: false as const, error: "用户不存在" }
        }

        return { success: true as const, data: user }
    } catch (error) {
        logger.error("获取用户详情失败", error, { userId })
        return { success: false as const, error: "获取用户详情失败" }
    }
}

// ==============================================================================
// Phase 3: 协作邀请 Actions
// ==============================================================================

// [3.1] 创建协作邀请
export async function createCollaborationInvite(
    type: InviteType,
    targetId: string,
    receiverId: string,
    message?: string
): Promise<ActionResponse<{ data: CollaborationInviteWithNames }>> {
    try {
        const parsed = z
            .object({
                type: z.nativeEnum(InviteType),
                targetId: UuidSchema,
                receiverId: UuidSchema,
                message: OptionalNonEmptyString(2000),
            })
            .strict()
            .safeParse({ type, targetId, receiverId, message })
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        type = parsed.data.type
        targetId = parsed.data.targetId
        receiverId = parsed.data.receiverId
        message = parsed.data.message

        let ctx: Awaited<ReturnType<typeof getActiveTenantContextWithPermissionOrThrow>>
        try {
            ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
        } catch (error) {
            if (error instanceof AuthError) return { success: false, error: "请先登录" }
            if (error instanceof PermissionError) return { success: false, error: getPublicActionErrorMessage(error, "权限不足") }
            throw error
        }

        const { user: sender, tenantId, viewer } = ctx

        const rate = await enforceRateLimit({ ctx, action: "collaboration.invite.create", limit: 120 })
        if (!rate.allowed) {
            return { success: false, error: rate.error }
        }

        const receiverOk = await ensureUsersInTenant({ tenantId, userIds: [receiverId] })
        if (!receiverOk) {
            return { success: false, error: "接收人不存在或不在当前租户" }
        }

        if (type === "CASE") {
            requireTenantPermission(ctx, "case:assign")

            const caseItem = await prisma.case.findFirst({
                where: { id: targetId, tenantId },
                select: { id: true, originatorId: true },
            })
            if (!caseItem) return { success: false, error: "案件不存在或不在当前租户" }

            const isOwner = caseItem.originatorId === sender.id
            const isPrivileged = sender.role === "PARTNER" || sender.role === "ADMIN"
            if (!isOwner && !isPrivileged) {
                return { success: false, error: "只有案件负责人或管理员可以邀请成员" }
            }
        }

        if (type === "TASK") {
            const task = await prisma.task.findFirst({
                where: { id: targetId, tenantId },
                select: { id: true, caseId: true, projectId: true, assigneeId: true },
            })
            if (!task) return { success: false, error: "任务不存在或不在当前租户" }

            if (task.caseId) {
                await requireCaseAccess(task.caseId, viewer, "case:view")
            } else if (task.projectId) {
                requireTenantPermission(ctx, "task:edit")
                await requireProjectAccess(task.projectId, viewer, "task:edit")
            } else if (sender.role !== "PARTNER" && sender.role !== "ADMIN") {
                if (!task.assigneeId || task.assigneeId !== sender.id) {
                    requireTenantPermission(ctx, "user:view_all")
                }
            }
        }

        if (type === "MEETING") {
            const ok = await prisma.event.findFirst({ where: { id: targetId, tenantId }, select: { id: true, creatorId: true } })
            if (!ok) return { success: false, error: "会议不存在" }
            if (ok.creatorId !== sender.id) return { success: false, error: "只有会议创建者可以发起邀请" }
        }

        // 检查是否已有待处理邀请
        const existing = await prisma.collaborationInvite.findFirst({
            where: {
                type,
                targetId,
                receiverId,
                status: 'PENDING',
            },
        })

        if (existing) {
            return { success: false, error: '已存在待处理的邀请' }
        }

        const invite = await prisma.collaborationInvite.create({
            data: {
                type,
                targetId,
                senderId: sender.id,
                receiverId,
                message,
            },
            include: {
                sender: { select: { name: true } },
                receiver: { select: { name: true } },
            },
        })

        // 通知：提醒接收人去“协作邀请”处理邀请（不阻塞主流程）
        try {
            if (receiverId !== sender.id) {
                const label = type === "CASE" ? "案件" : type === "TASK" ? "任务" : "会议"
                const senderName = sender.name || sender.email.split("@")[0] || "同事"
                const extra = message?.trim() ? `（留言：${message.trim()}）` : ""

                await notifyUsersWithEmailQueue({
                    tenantId,
                    userIds: [receiverId],
                    type: NotificationType.INVITE_RECEIVED,
                    title: `新的协作邀请：${label}`,
                    content: `${senderName} 邀请你加入${label}协作${extra}`,
                    actionUrl: "/invites",
                    actorId: sender.id,
                    metadata: { inviteId: invite.id, inviteType: type, targetId },
                })
            }
        } catch (e) {
            logger.error("Invite notification failed", e)
        }

        revalidatePath("/invites")
        revalidatePath("/dispatch")
        return { success: true, data: invite }
    } catch (error) {
        logger.error("创建邀请失败", error)
        return { success: false, error: '创建邀请失败' }
    }
}

// [3.1.1] 通过会议 eventId 响应邀请（用于 EventDetail 内闭环，不暴露 inviteId）
export async function respondToMeetingInviteByEventId(
    eventId: string,
    accept: boolean
): Promise<ActionResponse<{ data: CollaborationInvite }>> {
    try {
        const parsed = z
            .object({ eventId: UuidSchema, accept: z.boolean() })
            .strict()
            .safeParse({ eventId, accept })
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        eventId = parsed.data.eventId
        accept = parsed.data.accept

        let ctx: Awaited<ReturnType<typeof getActiveTenantContextWithPermissionOrThrow>>
        try {
            ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
        } catch (error) {
            if (error instanceof AuthError) return { success: false, error: "请先登录" }
            if (error instanceof PermissionError) return { success: false, error: getPublicActionErrorMessage(error, "权限不足") }
            throw error
        }

        const { user, tenantId } = ctx

        const rate = await enforceRateLimit({ ctx, action: "collaboration.invite.meeting.respond", limit: 120 })
        if (!rate.allowed) {
            return { success: false, error: rate.error }
        }

        const invite = await prisma.collaborationInvite.findFirst({
            where: {
                type: "MEETING",
                targetId: eventId,
                receiverId: user.id,
                status: "PENDING",
                sender: { tenantMemberships: { some: { tenantId, status: "ACTIVE" } } },
                receiver: { tenantMemberships: { some: { tenantId, status: "ACTIVE" } } },
            },
            orderBy: { createdAt: "desc" },
            select: { id: true },
        })

        if (!invite) {
            return { success: false, error: "会议邀请不存在或已处理" }
        }

        return respondToInvite(invite.id, accept)
    } catch (error) {
        logger.error("响应会议邀请失败", error)
        return { success: false, error: "响应会议邀请失败" }
    }
}

// [3.2] 响应邀请
export async function respondToInvite(
    inviteId: string,
    accept: boolean
): Promise<ActionResponse<{ data: CollaborationInvite }>> {
    try {
        const parsed = z
            .object({ inviteId: UuidSchema, accept: z.boolean() })
            .strict()
            .safeParse({ inviteId, accept })
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        inviteId = parsed.data.inviteId
        accept = parsed.data.accept

        let ctx: Awaited<ReturnType<typeof getActiveTenantContextWithPermissionOrThrow>>
        try {
            ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
        } catch (error) {
            if (error instanceof AuthError) return { success: false, error: "请先登录" }
            if (error instanceof PermissionError) return { success: false, error: getPublicActionErrorMessage(error, "权限不足") }
            throw error
        }

        const { user, tenantId } = ctx

        const rate = await enforceRateLimit({ ctx, action: "collaboration.invite.respond", limit: 120 })
        if (!rate.allowed) {
            return { success: false, error: rate.error }
        }

        const invite = await prisma.collaborationInvite.findFirst({
            where: {
                id: inviteId,
                receiverId: user.id,
                sender: { tenantMemberships: { some: { tenantId, status: "ACTIVE" } } },
                receiver: { tenantMemberships: { some: { tenantId, status: "ACTIVE" } } },
            },
        })

        if (!invite) {
            return { success: false, error: "邀请不存在或无权限" }
        }

        if (invite.status !== "PENDING") {
            return { success: false, error: "该邀请已被处理" }
        }

        const now = new Date()

        const result = await prisma.$transaction(async (tx) => {
            let forcedRejectReason: string | null = null
            let finalStatus: "ACCEPTED" | "REJECTED" = accept ? "ACCEPTED" : "REJECTED"

            const senderOk = await ensureUsersInTenant({ tenantId, userIds: [invite.senderId], db: tx })
            if (!senderOk) {
                forcedRejectReason = "邀请已失效"
                finalStatus = "REJECTED"
            }

            // accept 时必须先验证目标是否属于当前 tenant，避免跨租户关联
            let caseItem: { id: string; caseCode: string | null } | null = null
            if (finalStatus === "ACCEPTED" && invite.type === "CASE") {
                caseItem = await tx.case.findFirst({
                    where: { id: invite.targetId, tenantId },
                    select: { id: true, caseCode: true },
                })
                if (!caseItem) {
                    forcedRejectReason = "邀请已失效"
                    finalStatus = "REJECTED"
                }
            }

            let taskOk = false
            if (finalStatus === "ACCEPTED" && invite.type === "TASK") {
                const task = await tx.task.findFirst({ where: { id: invite.targetId, tenantId }, select: { id: true } })
                taskOk = Boolean(task)
                if (!taskOk) {
                    forcedRejectReason = "邀请已失效"
                    finalStatus = "REJECTED"
                }
            }

            if (finalStatus === "ACCEPTED" && invite.type === "MEETING") {
                const event = await tx.event.findFirst({
                    where: { id: invite.targetId, tenantId },
                    select: { id: true, creatorId: true },
                })
                if (!event || event.creatorId !== invite.senderId) {
                    forcedRejectReason = "邀请已失效"
                    finalStatus = "REJECTED"
                }
            }

            const updatedCount = await tx.collaborationInvite.updateMany({
                where: { id: inviteId, receiverId: user.id, status: "PENDING" },
                data: { status: finalStatus, respondedAt: now },
            })
            if (updatedCount.count === 0) {
                throw new Error("该邀请已被处理")
            }

            // 如果接受，执行相应的加入操作（与状态更新同事务）
            if (finalStatus === "ACCEPTED") {
                if (invite.type === "CASE") {
                    if (!caseItem) {
                        throw new Error("邀请已失效")
                    }

                    await tx.caseMember.upsert({
                        where: { caseId_userId: { caseId: caseItem.id, userId: user.id } },
                        update: { role: "MEMBER" },
                        create: { caseId: caseItem.id, userId: user.id, role: "MEMBER" },
                    })

                    // 同步到案件群聊参与人（同事务内，不再出现“已接受但未加入群聊”的断链）
                    const thread = await tx.chatThread.upsert({
                        where: { tenantId_key: { tenantId, key: `CASE:${caseItem.id}` } },
                        update: {
                            title: `案件群聊｜${caseItem.caseCode}`,
                            caseId: caseItem.id,
                            tenantId,
                        },
                        create: {
                            key: `CASE:${caseItem.id}`,
                            type: ChatThreadType.CASE,
                            title: `案件群聊｜${caseItem.caseCode}`,
                            tenantId,
                            caseId: caseItem.id,
                            createdById: user.id,
                        },
                        select: { id: true },
                    })

                    await tx.chatParticipant.upsert({
                        where: { threadId_userId: { threadId: thread.id, userId: user.id } },
                        update: {},
                        create: { threadId: thread.id, userId: user.id },
                    })
                } else if (invite.type === "TASK") {
                    if (!taskOk) {
                        throw new Error("邀请已失效")
                    }
                    const updatedTask = await tx.task.updateMany({
                        where: { id: invite.targetId, tenantId },
                        data: { assigneeId: user.id },
                    })
                    if (updatedTask.count === 0) {
                        throw new Error("邀请已失效")
                    }
                } else if (invite.type === "MEETING") {
                    // 会议参与：同步 EventParticipant（必须 tenant-scoped 的 event 存在）
                    const eventOk = await tx.event.findFirst({ where: { id: invite.targetId, tenantId }, select: { id: true } })
                    if (!eventOk) {
                        throw new Error("邀请已失效")
                    }
                    await tx.eventParticipant.upsert({
                        where: { eventId_userId: { eventId: invite.targetId, userId: user.id } },
                        update: { status: "ACCEPTED" },
                        create: { eventId: invite.targetId, userId: user.id, status: "ACCEPTED" },
                    })
                }
            } else if (!accept && invite.type === "MEETING") {
                // 拒绝会议邀请：若会议仍存在且属于当前 tenant，则同步 declined（否则仅拒绝邀请本身）
                const eventOk = await tx.event.findFirst({ where: { id: invite.targetId, tenantId }, select: { id: true } })
                if (eventOk) {
                    await tx.eventParticipant.upsert({
                        where: { eventId_userId: { eventId: invite.targetId, userId: user.id } },
                        update: { status: "DECLINED" },
                        create: { eventId: invite.targetId, userId: user.id, status: "DECLINED" },
                    })
                }
            }

            const updatedInvite = await tx.collaborationInvite.findFirst({
                where: {
                    id: inviteId,
                    receiverId: user.id,
                    sender: { tenantMemberships: { some: { tenantId, status: "ACTIVE" } } },
                    receiver: { tenantMemberships: { some: { tenantId, status: "ACTIVE" } } },
                },
            })
            return { updatedInvite, forcedRejectReason }
        })

        if (!result.updatedInvite) {
            return { success: false, error: "响应邀请失败" }
        }

        // 通知：将处理结果回执给发起人（不阻塞主流程）
        try {
            if (!result.forcedRejectReason && invite.senderId !== user.id) {
                const label = invite.type === "CASE" ? "案件" : invite.type === "TASK" ? "任务" : "会议"
                const receiverName = user.name || user.email.split("@")[0] || "对方"
                let actionUrl = "/invites"
                let targetSuffix = ""

                if (invite.type === "CASE") {
                    const caseLite = await prisma.case.findFirst({
                        where: { id: invite.targetId, tenantId },
                        select: { id: true, caseCode: true, title: true },
                    })
                    if (caseLite) {
                        actionUrl = `/cases/${caseLite.id}`
                        const prefix = caseLite.caseCode ? `#${caseLite.caseCode} ` : ""
                        targetSuffix = `：${prefix}${caseLite.title}`
                    }
                } else if (invite.type === "TASK") {
                    const taskLite = await prisma.task.findFirst({
                        where: { id: invite.targetId, tenantId },
                        select: { id: true, title: true },
                    })
                    if (taskLite) {
                        actionUrl = `/tasks/${taskLite.id}`
                        targetSuffix = `：${taskLite.title}`
                    }
                } else if (invite.type === "MEETING") {
                    const eventLite = await prisma.event.findFirst({
                        where: { id: invite.targetId, tenantId },
                        select: { id: true, title: true },
                    })
                    actionUrl = "/calendar"
                    if (eventLite?.title) {
                        targetSuffix = `：${eventLite.title}`
                    }
                }

                await notifyUsersWithEmailQueue({
                    tenantId,
                    userIds: [invite.senderId],
                    type: accept ? NotificationType.INVITE_ACCEPTED : NotificationType.INVITE_REJECTED,
                    title: accept ? `邀请已接受：${label}` : `邀请已拒绝：${label}`,
                    content: `${receiverName} ${accept ? "已接受" : "已拒绝"}你的${label}协作邀请${targetSuffix}`,
                    actionUrl,
                    actorId: user.id,
                    metadata: { inviteId: invite.id, inviteType: invite.type, targetId: invite.targetId },
                })
            }
        } catch (e) {
            logger.error("Invite response notification failed", e)
        }

        revalidatePath("/invites")
        revalidatePath("/notifications")
        revalidatePath("/dispatch")
        if (invite.type === "CASE") {
            revalidatePath("/cases")
            revalidatePath(`/cases/${invite.targetId}`)
        }
        if (invite.type === "TASK") {
            revalidatePath("/tasks")
            revalidatePath(`/tasks/${invite.targetId}`)
        }
        if (invite.type === "MEETING") {
            revalidatePath("/calendar")
        }
        if (result.forcedRejectReason) {
            return { success: false, error: result.forcedRejectReason }
        }
        return { success: true, data: result.updatedInvite }
    } catch (error) {
        logger.error("响应邀请失败", error)
        return { success: false, error: '响应邀请失败' }
    }
}

// [3.3] 获取我的邀请
export async function getMyInvites(type: 'sent' | 'received' = 'received') {
    return getMyInvitesImpl(type)
}

// ==============================================================================
// Phase 4: 活动聚合 Actions
// ==============================================================================

// [4.1] 获取用户活动
export async function getUserActivity(
    userId: string
) {
    return getUserActivityImpl(userId)
}

// [4.2] 获取团队活动
export async function getTeamActivity() {
    return getTeamActivityImpl()
}
