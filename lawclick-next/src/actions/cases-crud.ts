"use server"

import { prisma } from "@/lib/prisma"
import { notifyUsersWithEmailQueue } from "@/lib/notifications"
import { ChatThreadType, NotificationType, ServiceType, BillingMode, CaseStatus, Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { getActiveTenantContextOrThrow, requireCaseAccess, requireTenantPermission } from "@/lib/server-auth"
import { ensureUsersInTenant } from "@/lib/tenant-guards"
import { logger } from "@/lib/logger"
import { enforceActionRateLimit } from "@/lib/action-rate-limit"
import { getPublicActionErrorMessage, UserFacingError } from "@/lib/action-errors"
import { z } from "zod"
import { NonNegativeNumber, NullableNonEmptyString, OptionalNonEmptyString, UuidSchema } from "@/lib/zod"
import type { ActionResponse } from "@/lib/action-response"
import {
    CreateCaseInputSchema,
    checkConflict,
    generateCaseCode,
    syncCaseHandlerMembershipAndChat,
    type UpdateCaseInput,
} from "@/lib/cases/case-crud-domain"

// ==============================================================================
// Types
// ==============================================================================

export interface CreateCaseInput {
    // 基本信息
    title: string
    serviceType: ServiceType
    billingMode: BillingMode
    description?: string
    contractValue?: number

    // 客户信息
    clientId?: string      // 现有客户ID
    newClient?: {          // 或新建客户
        name: string
        type: 'COMPANY' | 'INDIVIDUAL'
        email?: string
        phone?: string
        industry?: string
    }
    opposingParties?: string[]  // 对方当事人名称（用于冲突检查）

    // 团队配置
    originatorId?: string   // 案源律师
    handlerId: string       // 承办律师
    memberIds?: string[]    // 其他成员

    // 模板配置
    templateId?: string     // 使用的模板
}

export type CreateCaseConflictCheck = {
    hasConflict: boolean
    details: Array<{
        entityType: string
        entityId: string
        entityName: string
        reason: string
    }>
}

export type CreateCaseResult = ActionResponse<{
    caseId: string
    caseCode: string
    conflictCheck: CreateCaseConflictCheck
}>

// ==============================================================================
// 案号生成
// ==============================================================================

// ==============================================================================
// 利益冲突检查
// ==============================================================================
// ==============================================================================
// 创建案件
// ==============================================================================

export async function createCase(input: CreateCaseInput): Promise<CreateCaseResult> {
    try {
        const parsed = CreateCaseInputSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        input = parsed.data

        // 1. 验证权限
        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:create")
        const { user: currentUser, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: currentUser.id,
            action: "cases.create",
            limit: 20,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        // 2. 使用事务处理
        const result = await prisma.$transaction(async (tx) => {
            const memberIdsToCheck = new Set<string>()
            memberIdsToCheck.add(input.handlerId)
            memberIdsToCheck.add(input.originatorId || currentUser.id)
            for (const id of input.memberIds || []) {
                memberIdsToCheck.add(id)
            }

            const membersOk = await ensureUsersInTenant({
                tenantId,
                userIds: Array.from(memberIdsToCheck),
                db: tx,
            })
            if (!membersOk) {
                throw new UserFacingError("案件成员不存在或不在当前租户")
            }

            // 2.1 处理客户（新建或使用现有）
            let clientId = input.clientId

            if (clientId) {
                const existingClient = await tx.contact.findFirst({ where: { id: clientId, tenantId }, select: { id: true } })
                if (!existingClient) {
                    throw new UserFacingError("客户不存在或不在当前租户")
                }
            }

            if (!clientId && input.newClient) {
                const newContact = await tx.contact.create({
                    data: {
                        tenantId,
                        name: input.newClient.name,
                        type: input.newClient.type,
                        email: input.newClient.email,
                        phone: input.newClient.phone,
                        industry: input.newClient.industry
                    }
                })
                clientId = newContact.id
            }

            if (!clientId) {
                throw new UserFacingError("必须指定客户或创建新客户")
            }

            // 2.2 生成案号
            const caseCode = await generateCaseCode(tenantId, input.serviceType, tx)

            // 2.3 确定初始阶段
            let initialStage: string | null = null
            if (input.serviceType === 'LITIGATION') {
                initialStage = 'INTAKE_CONSULTATION'
            } else if (input.serviceType === 'NON_LITIGATION') {
                initialStage = 'DUE_DILIGENCE'
            } else if (input.serviceType === 'ARBITRATION') {
                initialStage = 'INTAKE_CONSULTATION'
            }

            // 2.3.1 校验案件模板归属与类型（防止跨租户/错模板）
            if (input.templateId) {
                const template = await tx.caseTemplate.findFirst({
                    where: { id: input.templateId, tenantId, isActive: true },
                    select: { id: true, serviceType: true },
                })
                if (!template) {
                    throw new UserFacingError("案件模板不存在或不在当前租户")
                }
                if (template.serviceType !== input.serviceType) {
                    throw new UserFacingError("案件模板与服务类型不匹配")
                }
            }

            // 2.4 创建案件
            const newCase = await tx.case.create({
                data: {
                    tenantId,
                    caseCode,
                    title: input.title,
                    serviceType: input.serviceType,
                    billingMode: input.billingMode,
                    description: input.description,
                    contractValue: input.contractValue,
                    clientId,
                    originatorId: input.originatorId || currentUser.id,
                    handlerId: input.handlerId,
                    currentStage: initialStage,
                    templateId: input.templateId,
                    status: 'INTAKE'
                }
            })

            // 2.5 添加承办律师为成员
            await tx.caseMember.create({
                data: {
                    caseId: newCase.id,
                    userId: input.handlerId,
                    role: 'HANDLER'
                }
            })

            // 2.6 添加其他团队成员
            if (input.memberIds && input.memberIds.length > 0) {
                const memberData = input.memberIds
                    .filter(id => id !== input.handlerId) // 排除已添加的承办律师
                    .map(userId => ({
                        caseId: newCase.id,
                        userId,
                        role: 'MEMBER' as const
                    }))

                if (memberData.length > 0) {
                    await tx.caseMember.createMany({ data: memberData })
                }
            }

            // 2.7 执行利益冲突检查
            const conflictResult = await checkConflict(tenantId, clientId, input.opposingParties, tx)

            await tx.conflictCheck.create({
                data: {
                    caseId: newCase.id,
                    checkResult: conflictResult.hasConflict ? 'CONFLICT' : 'CLEAR',
                    conflictsWith: conflictResult.details.length > 0 ? conflictResult.details : Prisma.JsonNull,
                    checkedById: currentUser.id
                }
            })

            // 2.8 自动创建“案件群聊”（消息沟通以案件为中心）
            const caseThread = await tx.chatThread.create({
                data: {
                    tenantId,
                    key: `CASE:${newCase.id}`,
                    type: ChatThreadType.CASE,
                    title: `案件群聊｜${newCase.caseCode}`,
                    caseId: newCase.id,
                    createdById: currentUser.id,
                },
                select: { id: true },
            })

            const participantIds = new Set<string>([currentUser.id])
            if (newCase.originatorId) participantIds.add(newCase.originatorId)
            if (newCase.handlerId) participantIds.add(newCase.handlerId)
            if (input.memberIds) {
                for (const id of input.memberIds) participantIds.add(id)
            }

            if (participantIds.size > 0) {
                await tx.chatParticipant.createMany({
                    data: Array.from(participantIds).map((userId) => ({
                        threadId: caseThread.id,
                        userId,
                    })),
                    skipDuplicates: true,
                })
            }

            return {
                caseId: newCase.id,
                caseCode: newCase.caseCode,
                conflictCheck: conflictResult
            }
        })

        // 2.9 通知：案件分配 / 成员加入（不阻塞主流程）
        try {
            if (result?.caseId && result?.caseCode) {
                const caseId = result.caseId
                const caseCode = result.caseCode
                const caseTitle = input.title
                const originatorId = input.originatorId || currentUser.id

                // 1) 承办人：案件分配
                if (input.handlerId && input.handlerId !== currentUser.id) {
                    await notifyUsersWithEmailQueue({
                        tenantId,
                        userIds: [input.handlerId],
                        type: NotificationType.CASE_ASSIGNED,
                        title: `案件分配：${caseCode}`,
                        content: `你被指派为承办人：${caseTitle}`,
                        actionUrl: `/cases/${caseId}`,
                        actorId: currentUser.id,
                        metadata: { caseId },
                    })
                }

                // 2) 其它成员：案件成员加入（案源人 + memberIds）
                const others = new Set<string>()
                if (originatorId) others.add(originatorId)
                for (const id of input.memberIds || []) others.add(id)
                others.delete(currentUser.id)
                others.delete(input.handlerId)

                if (others.size > 0) {
                    await notifyUsersWithEmailQueue({
                        tenantId,
                        userIds: Array.from(others),
                        type: NotificationType.CASE_MEMBER_ADDED,
                        title: `你被加入案件：${caseCode}`,
                        content: caseTitle,
                        actionUrl: `/cases/${caseId}`,
                        actorId: currentUser.id,
                        metadata: { caseId },
                    })
                }
            }
        } catch (e) {
            logger.error("Case notification failed", e)
        }

        // 3. 刷新缓存
        revalidatePath('/cases')
        revalidatePath('/dashboard')

        return {
            success: true,
            ...result
        }

    } catch (error) {
        logger.error('创建案件失败:', error)
        return { success: false, error: getPublicActionErrorMessage(error, "创建案件失败") }
    }
}

// ==============================================================================
// 获取案件模板列表
// ==============================================================================

export async function getCaseTemplates(serviceType?: ServiceType) {
    try {
        const parsed = z
            .object({ serviceType: z.nativeEnum(ServiceType).optional() })
            .strict()
            .safeParse({ serviceType })
        if (!parsed.success) {
            logger.warn("getCaseTemplates 输入校验失败", { issues: parsed.error.flatten() })
            return []
        }
        serviceType = parsed.data.serviceType

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:view")
        const { tenantId, user } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "cases.templates.list",
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) return []

        const templates = await prisma.caseTemplate.findMany({
            where: {
                tenantId,
                isActive: true,
                ...(serviceType ? { serviceType } : {})
            },
            orderBy: { name: 'asc' },
            take: 200,
        })
        return templates
    } catch (error) {
        logger.error('获取模板失败:', error)
        return []
    }
}

// ==============================================================================
// 获取可用客户列表（用于下拉选择）
// ==============================================================================

export async function getClientsForSelect(query?: string) {
    try {
        const parsed = z
            .object({ query: OptionalNonEmptyString(200) })
            .strict()
            .safeParse({ query })
        if (!parsed.success) {
            logger.warn("getClientsForSelect input validation failed", { issues: parsed.error.flatten() })
            return []
        }
        query = parsed.data.query

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:view")
        const { tenantId, user } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "cases.clients.select",
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) return []

        const clients = await prisma.contact.findMany({
            where: {
                tenantId,
                deletedAt: null,
                ...(query ? { name: { contains: query, mode: "insensitive" } } : {}),
            },
            take: 20,
            orderBy: { name: 'asc' },
            select: {
                id: true,
                name: true,
                type: true,
                email: true,
                phone: true
            }
        })
        return clients
    } catch (error) {
        logger.error("getClientsForSelect failed", error)
        return []
    }
}

// ==============================================================================
// 获取可用律师列表（用于团队配置）
// ==============================================================================

export async function getLawyersForSelect() {
    try {
        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:create")
        const { tenantId, user } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "cases.lawyers.select",
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) return []

        const lawyers = await prisma.tenantMembership.findMany({
            where: {
                tenantId,
                status: "ACTIVE",
                user: {
                    isActive: true,
                    role: { in: ['PARTNER', 'SENIOR_LAWYER', 'LAWYER', 'TRAINEE', 'LEGAL_SECRETARY'] },
                },
            },
            orderBy: { user: { name: 'asc' } },
            take: 2000,
            select: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                        hourlyRate: true,
                    },
                },
            },
        })
        return lawyers.map(({ user: l }) => ({
            ...l,
            hourlyRate: l.hourlyRate ? Number(l.hourlyRate) : null,
        }))
    } catch (error) {
        logger.error('获取律师列表失败:', error)
        return []
    }
}

// ==============================================================================
// 更新案件信息
// ==============================================================================

export async function updateCase(
    caseId: string,
    input: UpdateCaseInput
): Promise<ActionResponse> {
    try {
        const parsed = z
            .object({
                caseId: UuidSchema,
                input: z
                    .object({
                        title: OptionalNonEmptyString(200),
                        description: NullableNonEmptyString(10_000),
                        billingMode: z.nativeEnum(BillingMode).optional(),
                        contractValue: NonNegativeNumber().nullable().optional(),
                        handlerId: UuidSchema.nullable().optional(),
                        originatorId: UuidSchema.nullable().optional(),
                        templateId: NullableNonEmptyString(200),
                        currentStage: NullableNonEmptyString(64),
                    })
                    .strict()
                    .refine((v) => Object.values(v).some((value) => value !== undefined), { message: "没有需要更新的字段" }),
            })
            .strict()
            .safeParse({ caseId, input })
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        caseId = parsed.data.caseId
        input = parsed.data.input

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:edit")
        if (input.handlerId !== undefined) {
            requireTenantPermission(ctx, "case:assign")
        }
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "cases.update",
            limit: 60,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        await requireCaseAccess(caseId, user, "case:edit")

        const idsToValidate: string[] = []
        if (input.handlerId !== undefined && input.handlerId) idsToValidate.push(input.handlerId)
        if (input.originatorId !== undefined && input.originatorId) idsToValidate.push(input.originatorId)
        if (idsToValidate.length > 0) {
            const ok = await ensureUsersInTenant({ tenantId, userIds: idsToValidate })
            if (!ok) return { success: false, error: "案件成员不存在或不在当前租户" }
        }

        const before = await prisma.case.findFirst({
            where: { id: caseId, tenantId },
            select: { id: true, caseCode: true, title: true, handlerId: true, serviceType: true },
        })
        if (!before) {
            return { success: false, error: "案件不存在" }
        }

        if (input.templateId !== undefined && input.templateId) {
            const template = await prisma.caseTemplate.findFirst({
                where: { id: input.templateId, tenantId, isActive: true },
                select: { id: true, serviceType: true },
            })
            if (!template) {
                return { success: false, error: "案件模板不存在或不在当前租户" }
            }
            if (template.serviceType !== before.serviceType) {
                return { success: false, error: "案件模板与服务类型不匹配" }
            }
        }

        const updated = await prisma.case.updateMany({
            where: { id: caseId, tenantId },
            data: {
                title: input.title,
                description: input.description,
                billingMode: input.billingMode,
                contractValue: input.contractValue,
                handlerId: input.handlerId === undefined ? undefined : input.handlerId,
                originatorId: input.originatorId === undefined ? undefined : input.originatorId,
                templateId: input.templateId === undefined ? undefined : input.templateId,
                currentStage: input.currentStage === undefined ? undefined : input.currentStage,
            },
        })
        if (updated.count === 0) {
            return { success: false, error: "案件不存在" }
        }

        // 承办人变更：成员/群聊同步 + 通知（不阻塞主流程）
        const handlerChanged = input.handlerId !== undefined && input.handlerId !== before.handlerId

        if (handlerChanged) {
            try {
                if (input.handlerId) {
                    await syncCaseHandlerMembershipAndChat({
                        caseId: before.id,
                        caseCode: before.caseCode,
                        handlerId: input.handlerId,
                        actorId: user.id,
                        tenantId,
                    })
                } else {
                    await prisma.caseMember.updateMany({
                        where: { caseId: before.id, role: "HANDLER" },
                        data: { role: "MEMBER" },
                    })
                }
            } catch (e) {
                logger.error("同步承办人到成员/群聊失败", e)
            }
        }

        // 通知：承办人变更（不阻塞主流程）
        try {
            const nextHandlerId = input.handlerId ?? before.handlerId
            if (nextHandlerId && nextHandlerId !== before.handlerId && nextHandlerId !== user.id) {
                const title = input.title ?? before.title
                await notifyUsersWithEmailQueue({
                    tenantId,
                    userIds: [nextHandlerId],
                    type: NotificationType.CASE_ASSIGNED,
                    title: `案件分配：${before.caseCode}`,
                    content: `你被指派为承办人：${title}`,
                    actionUrl: `/cases/${before.id}`,
                    actorId: user.id,
                    metadata: { caseId: before.id },
                })
            }
        } catch (e) {
            logger.error("Case reassignment notification failed", e)
        }

        revalidatePath("/cases")
        revalidatePath(`/cases/${caseId}`)
        return { success: true }
    } catch (error) {
        logger.error("更新案件失败", error)
        return { success: false, error: getPublicActionErrorMessage(error, "更新案件失败") }
    }
}

export async function assignCaseHandler(
    caseId: string,
    handlerId: string | null
): Promise<ActionResponse> {
    try {
        const parsed = z
            .object({ caseId: UuidSchema, handlerId: UuidSchema.nullable() })
            .strict()
            .safeParse({ caseId, handlerId })
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        caseId = parsed.data.caseId
        handlerId = parsed.data.handlerId

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:assign")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "cases.assign",
            limit: 60,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        await requireCaseAccess(caseId, user, "case:assign")

        if (handlerId) {
            const ok = await ensureUsersInTenant({ tenantId, userIds: [handlerId] })
            if (!ok) return { success: false, error: "案件成员不存在或不在当前租户" }
        }

        const before = await prisma.case.findFirst({
            where: { id: caseId, tenantId },
            select: { id: true, caseCode: true, title: true, handlerId: true },
        })
        if (!before) {
            return { success: false, error: "案件不存在" }
        }

        const updated = await prisma.case.updateMany({
            where: { id: caseId, tenantId },
            data: { handlerId },
        })
        if (updated.count === 0) {
            return { success: false, error: "案件不存在" }
        }

        if (handlerId && handlerId !== before.handlerId) {
            try {
                await syncCaseHandlerMembershipAndChat({
                    caseId: before.id,
                    caseCode: before.caseCode,
                    handlerId,
                    actorId: user.id,
                    tenantId,
                })
            } catch (e) {
                logger.error("同步承办人到成员/群聊失败", e)
            }
        } else if (!handlerId) {
            try {
                await prisma.caseMember.updateMany({
                    where: { caseId: before.id, role: "HANDLER" },
                    data: { role: "MEMBER" },
                })
            } catch (e) {
                logger.error("同步清除承办人角色失败", e)
            }
        }

        // 通知：承办人变更（不阻塞主流程）
        try {
            if (handlerId && handlerId !== before.handlerId && handlerId !== user.id) {
                await notifyUsersWithEmailQueue({
                    tenantId,
                    userIds: [handlerId],
                    type: NotificationType.CASE_ASSIGNED,
                    title: `案件分配：${before.caseCode}`,
                    content: `你被指派为承办人：${before.title}`,
                    actionUrl: `/cases/${before.id}`,
                    actorId: user.id,
                    metadata: { caseId: before.id },
                })
            }
        } catch (e) {
            logger.error("Case reassignment notification failed", e)
        }

        revalidatePath("/dispatch")
        revalidatePath("/cases")
        revalidatePath(`/cases/${caseId}`)
        return { success: true }
    } catch (error) {
        logger.error("分配承办人失败", error)
        return { success: false, error: getPublicActionErrorMessage(error, "分配承办人失败") }
    }
}

// ==============================================================================
// 变更案件状态（带合法迁移校验）
// ==============================================================================

const CASE_STATUS_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
    LEAD: ["INTAKE"],
    INTAKE: ["ACTIVE", "SUSPENDED", "CLOSED"],
    ACTIVE: ["SUSPENDED", "CLOSED"],
    SUSPENDED: ["ACTIVE", "CLOSED"],
    CLOSED: ["ARCHIVED"],
    ARCHIVED: [],
}

export async function changeCaseStatus(
    caseId: string,
    status: CaseStatus
): Promise<ActionResponse> {
    try {
        const parsed = z
            .object({ caseId: UuidSchema, status: z.nativeEnum(CaseStatus) })
            .strict()
            .safeParse({ caseId, status })
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        caseId = parsed.data.caseId
        status = parsed.data.status

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:edit")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "cases.status.change",
            limit: 90,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        await requireCaseAccess(caseId, user, "case:edit")

        const caseItem = await prisma.case.findFirst({
            where: { id: caseId, tenantId },
            select: { status: true },
        })
        if (!caseItem) return { success: false, error: "案件不存在" }

        const currentStatus = caseItem.status
        const isPrivileged = user.role === "PARTNER" || user.role === "ADMIN"

        if (!isPrivileged) {
            const allowed = CASE_STATUS_TRANSITIONS[currentStatus] || []
            if (!allowed.includes(status)) {
                return { success: false, error: `不允许从 ${currentStatus} 迁移到 ${status}` }
            }
        }

        const updated = await prisma.case.updateMany({
            where: { id: caseId, tenantId },
            data: { status },
        })
        if (updated.count === 0) {
            return { success: false, error: "案件不存在" }
        }

        revalidatePath("/cases")
        revalidatePath(`/cases/${caseId}`)
        return { success: true }
    } catch (error) {
        logger.error("变更案件状态失败", error)
        return { success: false, error: getPublicActionErrorMessage(error, "变更案件状态失败") }
    }
}

// ==============================================================================
// 归档案件
// ==============================================================================

export async function archiveCase(caseId: string): Promise<ActionResponse> {
    try {
        const parsedId = UuidSchema.safeParse(caseId)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败" }
        }
        caseId = parsedId.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:archive")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "cases.archive",
            limit: 30,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        await requireCaseAccess(caseId, user, "case:archive")

        const updated = await prisma.case.updateMany({ where: { id: caseId, tenantId }, data: { status: "ARCHIVED" } })
        if (updated.count === 0) {
            return { success: false, error: "案件不存在" }
        }

        revalidatePath("/cases")
        revalidatePath(`/cases/${caseId}`)
        return { success: true }
    } catch (error) {
        logger.error("归档案件失败", error)
        return { success: false, error: getPublicActionErrorMessage(error, "归档案件失败") }
    }
}

// =============================================================================
// 软删除案件
// =============================================================================

export async function deleteCase(caseId: string): Promise<ActionResponse> {
    try {
        const parsedId = UuidSchema.safeParse(caseId)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败" }
        }
        caseId = parsedId.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:delete")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "cases.delete",
            limit: 10,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        await requireCaseAccess(caseId, user, "case:delete")

        const updated = await prisma.case.updateMany({
            where: { id: caseId, tenantId, deletedAt: null },
            data: {
                status: "ARCHIVED",
                deletedAt: new Date(),
                deletedById: user.id,
            },
        })

        if (updated.count === 0) {
            return { success: false, error: "案件不存在或已删除" }
        }

        revalidatePath("/cases")
        revalidatePath(`/cases/${caseId}`)
        revalidatePath("/dashboard")
        return { success: true }
    } catch (error) {
        logger.error("删除案件失败", error)
        return { success: false, error: getPublicActionErrorMessage(error, "删除案件失败") }
    }
}
