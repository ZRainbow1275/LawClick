"use server"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { revalidatePath } from "next/cache"
import { AddMemberSchema } from "@/lib/schemas"
import { CaseRole, ChatThreadType, NotificationType } from "@prisma/client"
import { notifyUsersWithEmailQueue } from "@/lib/notifications"
import { getActiveTenantContextWithPermissionOrThrow, requireCaseAccess } from "@/lib/server-auth"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import type { ActionResponse } from "@/lib/action-response"

export async function addCaseMember(formData: FormData): Promise<ActionResponse> {
    const ctx = await getActiveTenantContextWithPermissionOrThrow("case:assign")
    const { user: currentUser, tenantId, viewer } = ctx

    const roleRaw = formData.get("role")
    const roleValue = typeof roleRaw === "string" ? roleRaw : undefined
    const normalizedRole = roleValue === "EDITOR" ? "MEMBER" : roleValue

    const rawData = {
        email: formData.get("email"),
        caseId: formData.get("caseId"),
        role: normalizedRole,
    }

    const validatedFields = AddMemberSchema.safeParse(rawData)
    if (!validatedFields.success) {
        return { success: false, error: validatedFields.error.issues[0].message }
    }

    const { email, caseId, role } = validatedFields.data

    const rate = await enforceRateLimit({ ctx, action: "cases.members.add", limit: 120, extraKey: caseId })
    if (!rate.allowed) {
        return { success: false, error: rate.error }
    }

    const caseItem = await prisma.case.findFirst({
        where: { id: caseId, tenantId },
        include: { members: true },
    })

    if (!caseItem) return { success: false, error: "案件不存在" }

    await requireCaseAccess(caseId, viewer, "case:view")

    const isOwner = caseItem.originatorId === currentUser.id
    const isPrivileged = currentUser.role === "PARTNER" || currentUser.role === "ADMIN"

    if (!isOwner && !isPrivileged) {
        return { success: false, error: "只有案件负责人或管理员可以邀请成员" }
    }

    const memberToAdd = await prisma.tenantMembership.findFirst({
        where: {
            tenantId,
            status: "ACTIVE",
            user: { email: { equals: email, mode: "insensitive" } },
        },
        select: { userId: true },
    })
    if (!memberToAdd) {
        return { success: false, error: "未找到该邮箱对应的用户（或不属于该租户）" }
    }
    const userToAddId = memberToAdd.userId

    if (caseItem.originatorId && userToAddId === caseItem.originatorId) {       
        return { success: false, error: "该用户已是案件负责人" }
    }

    const existingMember = await prisma.caseMember.findUnique({
        where: {
            caseId_userId: {
                caseId,
                userId: userToAddId,
            },
        },
    })

    if (existingMember) {
        return { success: false, error: "该用户已是案件成员" }
    }

    const roleToCreate: CaseRole =
        role === "OWNER" ? CaseRole.OWNER : role === "MEMBER" ? CaseRole.MEMBER : CaseRole.VIEWER

    await prisma.caseMember.create({
        data: {
            caseId,
            userId: userToAddId,
            role: roleToCreate,
        },
    })

    // 通知：成员加入案件（不阻塞主流程）
    try {
        if (userToAddId !== currentUser.id) {
            await notifyUsersWithEmailQueue({
                tenantId,
                userIds: [userToAddId],
                type: NotificationType.CASE_MEMBER_ADDED,
                title: `你被加入案件：${caseItem.caseCode}`,
                content: caseItem.title,
                actionUrl: `/cases/${caseId}`,
                actorId: currentUser.id,
                metadata: { caseId },
            })
        }
    } catch (e) {
        logger.error("Add case member notification failed", e)
    }

    // 同步到“案件群聊”参与人（保证 /chat 可见）
    try {
        const caseWithCode = await prisma.case.findFirst({
            where: { id: caseId, tenantId },
            select: { id: true, caseCode: true },
        })

        if (caseWithCode) {
            const thread = await prisma.chatThread.upsert({
                where: { tenantId_key: { tenantId, key: `CASE:${caseWithCode.id}` } },
                update: {
                    title: `案件群聊｜${caseWithCode.caseCode}`,
                    caseId: caseWithCode.id,
                    tenantId,
                },
                create: {
                    tenantId,
                    key: `CASE:${caseWithCode.id}`,
                    type: ChatThreadType.CASE,
                    title: `案件群聊｜${caseWithCode.caseCode}`,
                    caseId: caseWithCode.id,
                    createdById: currentUser.id,
                },
                select: { id: true },
            })

            await prisma.chatParticipant.upsert({
                where: { threadId_userId: { threadId: thread.id, userId: userToAddId } },
                update: {},
                create: { threadId: thread.id, userId: userToAddId },
            })
        }
    } catch (e) {
        // 不阻断主流程：成员已加入案件，只是聊天参与人同步失败
        logger.error("同步案件群聊参与人失败", e)
    }

    revalidatePath(`/cases/${caseId}`)
    return { success: true }
}

export async function removeCaseMember(caseId: string, userId: string): Promise<ActionResponse> {
    const ctx = await getActiveTenantContextWithPermissionOrThrow("case:view")
    const rate = await enforceRateLimit({ ctx, action: "cases.members.remove", limit: 120, extraKey: `${caseId}:${userId}` })
    if (!rate.allowed) {
        return { success: false, error: rate.error }
    }
    const { user: currentUser, tenantId, viewer } = ctx

    const caseItem = await prisma.case.findFirst({ where: { id: caseId, tenantId }, select: { id: true, originatorId: true } })

    if (!caseItem) return { success: false, error: "案件不存在" }

    await requireCaseAccess(caseId, viewer, "case:view")

    const isOwner = caseItem.originatorId === currentUser.id
    const isPrivileged = currentUser.role === "PARTNER" || currentUser.role === "ADMIN"

    if (!isOwner && !isPrivileged && userId !== currentUser.id) {
        return { success: false, error: "没有权限移除成员" }
    }

    await prisma.caseMember.delete({
        where: {
            caseId_userId: {
                caseId,
                userId,
            },
        },
    })

    // 同步移除聊天参与人（避免仍能在 /chat 列表看到会话）
    try {
        const thread = await prisma.chatThread.findFirst({
            where: { key: `CASE:${caseId}`, tenantId },
            select: { id: true },
        })
        if (thread) {
            await prisma.chatParticipant.deleteMany({
                where: { threadId: thread.id, userId },
            })
        }
    } catch (e) {
        logger.error("移除案件群聊参与人失败", e)
    }

    revalidatePath(`/cases/${caseId}`)
    return { success: true }
}
