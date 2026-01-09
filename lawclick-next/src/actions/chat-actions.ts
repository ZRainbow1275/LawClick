"use server"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import type { ActionResponse } from "@/lib/action-response"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import {
    AuthError,
    PermissionError,
    getActiveTenantContextWithPermissionOrThrow,
    requireCaseAccess,
} from "@/lib/server-auth"
import { notifyUsers } from "@/lib/notifications"
import { revalidatePath } from "next/cache"
import { ChatThreadType, NotificationType } from "@prisma/client"
import { z } from "zod"
import { UuidSchema } from "@/lib/zod"
import { ensureUsersInTenant } from "@/lib/tenant-guards"
import { filterActiveTenantMemberUserIds } from "@/lib/tenant-users"

function getTeamThreadKey(tenantId: string) {
    return `TEAM:${tenantId}`
}

function getDirectThreadKey(userAId: string, userBId: string) {
    const [a, b] = [userAId, userBId].sort()
    return `DIRECT:${a}:${b}`
}

function getCaseThreadKey(caseId: string) {
    return `CASE:${caseId}`
}

async function ensureParticipant(threadId: string, userId: string, lastReadAt?: Date) {
    await prisma.chatParticipant.upsert({
        where: { threadId_userId: { threadId, userId } },
        update: lastReadAt ? { lastReadAt } : {},
        create: {
            threadId,
            userId,
            lastReadAt,
        },
    })
}

async function syncCaseThreadParticipants(tenantId: string, caseId: string, threadId: string) {
    const caseItem = await prisma.case.findFirst({
        where: { id: caseId, tenantId },
        select: {
            originatorId: true,
            handlerId: true,
            members: { select: { userId: true } },
        },
    })

    if (!caseItem) return

    const userIds = new Set<string>()
    if (caseItem.originatorId) userIds.add(caseItem.originatorId)
    if (caseItem.handlerId) userIds.add(caseItem.handlerId)
    for (const m of caseItem.members) userIds.add(m.userId)

    const safeUserIds = await filterActiveTenantMemberUserIds({
        tenantId,
        userIds: Array.from(userIds),
    })

    const data = safeUserIds.map((userId) => ({ threadId, userId }))
    if (data.length === 0) return

    await prisma.chatParticipant.createMany({
        data,
        skipDuplicates: true,
    })
}

export async function getOrCreateTeamThread() {
    const ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")  
    const rate = await enforceRateLimit({ ctx, action: "chat.thread.team.getOrCreate", limit: 120 })
    if (!rate.allowed) throw new Error(rate.error)
    const { user, tenantId } = ctx

    const key = getTeamThreadKey(tenantId)
    const thread = await prisma.chatThread.upsert({
        where: { tenantId_key: { tenantId, key } },
        update: {},
        create: {
            tenantId,
            key,
            type: ChatThreadType.TEAM,
            title: "团队群聊",
            createdById: user.id,
        },
    })

    await ensureParticipant(thread.id, user.id)
    return thread
}

export async function getOrCreateCaseThread(caseId: string) {
    const parsedId = UuidSchema.safeParse(caseId)
    if (!parsedId.success) throw new Error("输入校验失败")
    caseId = parsedId.data

    const ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")  
    const rate = await enforceRateLimit({ ctx, action: "chat.thread.case.getOrCreate", limit: 120 })
    if (!rate.allowed) throw new Error(rate.error)
    const { user, tenantId, viewer } = ctx
    await requireCaseAccess(caseId, viewer, "case:view")

    const caseItem = await prisma.case.findFirst({
        where: { id: caseId, tenantId },
        select: { id: true, title: true, caseCode: true },
    })
    if (!caseItem) throw new Error("案件不存在")

    const key = getCaseThreadKey(caseId)

    const thread = await prisma.chatThread.upsert({
        where: { tenantId_key: { tenantId, key } },
        update: {
            title: `案件群聊｜${caseItem.caseCode}`,
            caseId,
            tenantId,
        },
        create: {
            tenantId,
            key,
            type: ChatThreadType.CASE,
            title: `案件群聊｜${caseItem.caseCode}`,
            caseId,
            createdById: user.id,
        },
    })

    await syncCaseThreadParticipants(tenantId, caseId, thread.id)
    await ensureParticipant(thread.id, user.id)
    return thread
}

export async function getOrCreateDirectThread(otherUserId: string) {
    const parsedId = UuidSchema.safeParse(otherUserId)
    if (!parsedId.success) {
        return { success: false as const, error: "输入校验失败", threadId: null as string | null }
    }
    otherUserId = parsedId.data

    let ctx: Awaited<ReturnType<typeof getActiveTenantContextWithPermissionOrThrow>>
    try {
        ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
    } catch (error) {
        if (error instanceof AuthError) {
            return { success: false as const, error: "请先登录", threadId: null as string | null }
        }
        if (error instanceof PermissionError) {
            return {
                success: false as const,
                error: getPublicActionErrorMessage(error, "权限不足"),
                threadId: null as string | null,
            }
        }
        throw error
    }

    const { user, tenantId } = ctx

    const rate = await enforceRateLimit({ ctx, action: "chat.thread.direct.getOrCreate", limit: 120 })
    if (!rate.allowed) {
        return { success: false as const, error: rate.error, threadId: null as string | null }
    }

    if (otherUserId === user.id) {
        return { success: false as const, error: "不能与自己创建私聊", threadId: null as string | null }
    }

    const ok = await ensureUsersInTenant({ tenantId, userIds: [otherUserId] })
    if (!ok) {
        return { success: false as const, error: "对方用户不存在或不在当前租户", threadId: null as string | null }
    }

    const other = await prisma.user.findUnique({
        where: { id: otherUserId },
        select: { id: true },
    })
    if (!other) {
        return { success: false as const, error: "对方用户不存在", threadId: null as string | null }
    }

    const key = getDirectThreadKey(user.id, otherUserId)

    const thread = await prisma.chatThread.upsert({
        where: { tenantId_key: { tenantId, key } },
        update: { tenantId },
        create: {
            tenantId,
            key,
            type: ChatThreadType.DIRECT,
            title: "私聊",
            createdById: user.id,
        },
    })

    await prisma.chatParticipant.createMany({
        data: [
            { threadId: thread.id, userId: user.id },
            { threadId: thread.id, userId: otherUserId },
        ],
        skipDuplicates: true,
    })

    revalidatePath("/chat")
    return { success: true as const, error: null as string | null, threadId: thread.id }
}

export async function getMyChatThreads() {
    const ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
    const rate = await enforceRateLimit({ ctx, action: "chat.threads.list", limit: 240 })
    if (!rate.allowed) throw new Error(rate.error)
    const { user, tenantId } = ctx

    // 确保 TEAM 会话始终存在且自己已加入，避免“空列表”体验
    await getOrCreateTeamThread()

    const participations = await prisma.chatParticipant.findMany({
        where: { userId: user.id, thread: { tenantId } },
        include: {
            thread: {
                include: {
                    case: { select: { id: true, title: true, caseCode: true } },
                    participants: {
                        include: {
                            user: { select: { id: true, name: true, email: true, avatarUrl: true } },
                        },
                    },
                    messages: {
                        take: 1,
                        orderBy: { createdAt: "desc" },
                        include: {
                            sender: { select: { id: true, name: true, email: true, avatarUrl: true } },
                        },
                    },
                },
            },
        },
        orderBy: { thread: { lastMessageAt: "desc" } },
        take: 200,
    })

    const threads = await Promise.all(
        participations.map(async (p) => {
            const thread = p.thread
            const lastMessage = thread.messages[0] || null

            const since = p.lastReadAt || p.joinedAt
            const unreadCount = await prisma.chatMessage.count({
                where: {
                    threadId: thread.id,
                    createdAt: { gt: since },
                    senderId: { not: user.id },
                },
            })

            return {
                id: thread.id,
                key: thread.key,
                type: thread.type,
                title: thread.title,
                case: thread.case,
                lastMessage: lastMessage
                    ? {
                        id: lastMessage.id,
                        content: lastMessage.content,
                        createdAt: lastMessage.createdAt,
                        sender: lastMessage.sender,
                    }
                    : null,
                unreadCount,
                participants: thread.participants.map((pp) => pp.user),
                lastMessageAt: thread.lastMessageAt,
            }
        })
    )

    return {
        me: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl },
        threads,
    }
}

export async function getChatMessages(threadId: string, limit = 50) {
    const parsed = z
        .object({ threadId: UuidSchema, limit: z.number().int().min(1).max(200) })
        .strict()
        .safeParse({ threadId, limit })
    if (!parsed.success) throw new Error("输入校验失败")
    threadId = parsed.data.threadId
    limit = parsed.data.limit

    const ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")  
    const rate = await enforceRateLimit({ ctx, action: "chat.messages.list", limit: 600 })
    if (!rate.allowed) throw new Error(rate.error)
    const { user, tenantId, viewer } = ctx

    const thread = await prisma.chatThread.findFirst({
        where: { id: threadId, tenantId },
        select: { id: true, type: true, caseId: true, title: true },
    })
    if (!thread) throw new Error("会话不存在")

    if (thread.type === "CASE") {
        if (!thread.caseId) throw new Error("会话缺少案件上下文")
        await requireCaseAccess(thread.caseId, viewer, "case:view")
        await syncCaseThreadParticipants(tenantId, thread.caseId, threadId)
    } else {
        const participant = await prisma.chatParticipant.findUnique({
            where: { threadId_userId: { threadId, userId: user.id } },
            select: { id: true },
        })
        if (!participant) throw new Error("无会话访问权限")
    }

    const messages = await prisma.chatMessage.findMany({
        where: { threadId },
        take: limit,
        orderBy: { createdAt: "asc" },
        include: {
            sender: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
    })

    await ensureParticipant(threadId, user.id, new Date())

    return {
        thread,
        messages,
    }
}

export async function sendChatMessage(threadId: string, content: string) {      
    const parsed = z
        .object({ threadId: UuidSchema, content: z.string() })
        .strict()
        .safeParse({ threadId, content })
    if (!parsed.success) {
        return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
    }
    threadId = parsed.data.threadId
    content = parsed.data.content

    const ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")  
    const { user, tenantId, viewer } = ctx

    const rate = await enforceRateLimit({ ctx, action: "chat.message.send", limit: 120 })
    if (!rate.allowed) return { success: false as const, error: rate.error }

    const text = (content || "").trim()
    if (!text) return { success: false as const, error: "消息内容不能为空" }
    if (text.length > 2000) return { success: false as const, error: "消息过长（最多 2000 字）" }

    const thread = await prisma.chatThread.findFirst({
        where: { id: threadId, tenantId },
        select: {
            id: true,
            type: true,
            caseId: true,
            title: true,
            case: { select: { id: true, title: true, caseCode: true } },
        },
    })
    if (!thread) return { success: false as const, error: "会话不存在" }

    if (thread.type === "CASE") {
        if (!thread.caseId) return { success: false as const, error: "会话缺少案件上下文" }
        await requireCaseAccess(thread.caseId, viewer, "case:view")
        await syncCaseThreadParticipants(tenantId, thread.caseId, threadId)
    } else {
        const participant = await prisma.chatParticipant.findUnique({
            where: { threadId_userId: { threadId, userId: user.id } },
            select: { id: true },
        })
        if (!participant) return { success: false as const, error: "无会话访问权限" }
    }

    const message = await prisma.chatMessage.create({
        data: {
            threadId,
            senderId: user.id,
            content: text,
        },
        include: {
            sender: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
    })

    await prisma.chatThread.updateMany({
        where: { id: threadId, tenantId },
        data: { lastMessageAt: message.createdAt },
    })

    await ensureParticipant(threadId, user.id, message.createdAt)

    // 通知：给其它参与人写“新消息”提醒（不阻塞主流程）
    try {
        const receivers = await prisma.chatParticipant.findMany({
            where: { threadId, userId: { not: user.id }, muted: false },        
            select: { userId: true },
            take: 500,
        })

        const receiverIds = receivers.map((r) => r.userId)
        const senderName = user.name || user.email.split("@")[0] || "有人"
        const title =
            thread.type === "CASE" && thread.case
                ? `案件新消息：${thread.case.caseCode}`
                : "新消息"

        await notifyUsers({
            tenantId,
            userIds: receiverIds,
            type: NotificationType.CHAT_MESSAGE,
            title,
            content: `${senderName}: ${text}`,
            actionUrl: `/chat?threadId=${threadId}`,
            actorId: user.id,
            metadata: {
                threadId,
                messageId: message.id,
                ...(thread.caseId ? { caseId: thread.caseId } : {}),
            },
        })
    } catch (e) {
        logger.error("Chat notification failed", e)
    }

    revalidatePath("/chat")
    return { success: true as const, message }
}

export async function markAllChatThreadsRead(): Promise<ActionResponse> {
    let ctx: Awaited<ReturnType<typeof getActiveTenantContextWithPermissionOrThrow>>
    try {
        ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
    } catch (error) {
        if (error instanceof AuthError) {
            return { success: false, error: "请先登录" }
        }
        if (error instanceof PermissionError) {
            return { success: false, error: getPublicActionErrorMessage(error, "权限不足") }
        }
        throw error
    }

    const { user, tenantId } = ctx

    const rate = await enforceRateLimit({ ctx, action: "chat.threads.markAllRead", limit: 60 })
    if (!rate.allowed) return { success: false, error: rate.error }

    await prisma.chatParticipant.updateMany({
        where: { userId: user.id, thread: { tenantId } },
        data: { lastReadAt: new Date() },
    })

    revalidatePath("/chat")
    return { success: true }
}
