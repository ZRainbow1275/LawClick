"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { ApprovalStatus, ApprovalType } from "@prisma/client"
import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { JsonValueSchema, NonNegativeNumber, OptionalNonEmptyString, UuidSchema } from "@/lib/zod"
import { getActiveTenantContextOrThrow, hasTenantPermission, requireCaseAccess, requireTenantPermission } from "@/lib/server-auth"
import { ensureContactsInTenant } from "@/lib/tenant-guards"
import { approvalTenantScope } from "@/lib/tenant-scope"
import { logger } from "@/lib/logger"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { checkRateLimit } from "@/lib/rate-limit"
import type { ActionResponse } from "@/lib/action-response"

// ==============================================================================
// [2.1] 创建审批申请
// ==============================================================================

export type ApprovalListItem = Prisma.ApprovalRequestGetPayload<{
    include: {
        requester: { select: { id: true; name: true; avatarUrl: true } }
        approver: { select: { id: true; name: true; avatarUrl: true } }
        case: { select: { id: true; title: true; caseCode: true } }
        client: { select: { id: true; name: true; type: true } }
    }
}>

const CreateApprovalRequestSchema = z
    .object({
        type: z.nativeEnum(ApprovalType),
        title: z.string().trim().min(1, "标题不能为空"),
        description: z.string().trim().min(1).optional(),
        amount: NonNegativeNumber().optional(),
        approverId: UuidSchema.optional(),
        caseId: UuidSchema.optional(),
        clientId: UuidSchema.optional(),
        metadata: z.record(z.string(), JsonValueSchema).optional(),
        submit: z.boolean().optional(),
    })
    .strict()

export async function createApprovalRequest(data: {
    type: ApprovalType
    title: string
    description?: string
    amount?: number
    approverId?: string
    caseId?: string
    clientId?: string
    metadata?: Record<string, unknown>
    submit?: boolean // 是否直接提交
}): Promise<ActionResponse<{ data: ApprovalListItem }>> {
    try {
        const parsed = CreateApprovalRequestSchema.safeParse(data)
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        const input = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "approval:create")
        const { user, tenantId } = ctx

        const rate = await enforceRateLimit({ ctx, action: "approvals.create", limit: 30 })
        if (!rate.allowed) return { success: false, error: rate.error }

        const caseId = input.caseId || null
        if (caseId) {
            await requireCaseAccess(caseId, user, "case:view")
        }

        let clientId = input.clientId || null
        if (!clientId && caseId) {
            const row = await prisma.case.findFirst({ where: { id: caseId, tenantId }, select: { clientId: true } })
            clientId = row?.clientId || null
        }

        if (clientId) {
            const ok = await ensureContactsInTenant({ tenantId, contactIds: [clientId] })
            if (!ok) {
                return { success: false, error: "客户不存在或不在当前租户" }
            }
        }

        const approval = await prisma.approvalRequest.create({
            data: {
                tenantId,
                type: input.type,
                title: input.title,
                description: input.description,
                amount: input.amount,
                requesterId: user.id,
                approverId: input.approverId || null,
                metadata: input.metadata || {},
                status: input.submit ? ApprovalStatus.PENDING : ApprovalStatus.DRAFT,
                submittedAt: input.submit ? new Date() : null,
                caseId,
                clientId,
            },
            include: {
                requester: { select: { id: true, name: true, avatarUrl: true, department: true } },
                approver: { select: { id: true, name: true, avatarUrl: true, department: true } },
                case: { select: { id: true, title: true, caseCode: true } },
                client: { select: { id: true, name: true, type: true, email: true, phone: true } },
            },
        })

        revalidatePath('/admin/approvals')
        if (approval.caseId) revalidatePath(`/cases/${approval.caseId}`)
        return { success: true, data: approval }
    } catch (error) {
        logger.error('创建审批失败:', error)
        return { success: false, error: '创建审批失败' }
    }
}

// ==============================================================================
// [2.2] 获取我的审批
// ==============================================================================

export async function getMyApprovals(
    filter: 'pending' | 'approved' | 'mine' = 'pending',
    options?: { caseId?: string }
) {
    try {
        const parsed = z
            .object({
                filter: z.enum(["pending", "approved", "mine"]),
                options: z.object({ caseId: UuidSchema.optional() }).strict().optional(),
            })
            .strict()
            .safeParse({ filter, options })
        if (!parsed.success) {
            return {
                success: false as const,
                error: parsed.error.issues[0]?.message || "输入校验失败",
                data: [],
            }
        }
        filter = parsed.data.filter
        options = parsed.data.options

        const ctx = await getActiveTenantContextOrThrow()
        const { user, tenantId } = ctx
        requireTenantPermission(ctx, filter === "mine" ? "approval:create" : "approval:approve")

        const rate = await checkRateLimit({
            key: `approvals:list:${tenantId}:${user.id}:${filter}`,
            limit: 60,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            logger.warn("approvals.list rate limited", { tenantId, userId: user.id, filter })
            return { success: false as const, error: "请求过于频繁，请稍后重试", data: [] }
        }

        const where: Prisma.ApprovalRequestWhereInput = approvalTenantScope(tenantId)
        if (options?.caseId) {
            await requireCaseAccess(options.caseId, user, "case:view")
            where.caseId = options.caseId
        }

        if (filter === 'pending') {
            // 待我审批的
            where.status = ApprovalStatus.PENDING
            where.OR = [{ approverId: user.id }, { approverId: null }]
        } else if (filter === 'approved') {
            // 我已处理的
            where.approverId = user.id
            where.status = { in: [ApprovalStatus.APPROVED, ApprovalStatus.REJECTED] }
        } else {
            // 我发起的
            where.requesterId = user.id
        }

        const approvals = await prisma.approvalRequest.findMany({
            where,
            include: {
                requester: { select: { id: true, name: true, avatarUrl: true } },
                approver: { select: { id: true, name: true, avatarUrl: true } },
                case: { select: { id: true, title: true, caseCode: true } },
                client: { select: { id: true, name: true, type: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
        })

        return { success: true as const, data: approvals }
    } catch (error) {
        logger.error('获取审批失败:', error)
        return { success: false as const, error: '获取审批失败', data: [] }
    }
}

// ==============================================================================
// [2.3] 获取审批详情
// ==============================================================================

export async function getApprovalById(id: string): Promise<ActionResponse<{ data: ApprovalListItem }>> {
    try {
        const parsedId = UuidSchema.safeParse(id)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败" }
        }
        id = parsedId.data

        const ctx = await getActiveTenantContextOrThrow()
        const rate = await enforceRateLimit({ ctx, action: "approvals.getById", limit: 240 })
        if (!rate.allowed) return { success: false, error: rate.error }
        const { user, tenantId } = ctx
        const approval = await prisma.approvalRequest.findFirst({
            where: { id, ...approvalTenantScope(tenantId) },
            include: {
                requester: { select: { id: true, name: true, avatarUrl: true, department: true } },
                approver: { select: { id: true, name: true, avatarUrl: true } },
                case: { select: { id: true, title: true, caseCode: true } },
                client: { select: { id: true, name: true, type: true } },
            },
        })

        if (!approval) {
            return { success: false, error: '审批不存在' }
        }

        const canViewOwn = approval.requesterId === user.id && hasTenantPermission(ctx, "approval:create")
        const canViewAsApprover = approval.approverId === user.id && hasTenantPermission(ctx, "approval:approve")
        const canViewAll = hasTenantPermission(ctx, "approval:view_all")
        const canView = canViewOwn || canViewAsApprover || canViewAll

        if (!canView) {
            return { success: false, error: '无权查看该审批' }
        }

        return { success: true, data: approval }
    } catch (error) {
        logger.error('获取审批详情失败:', error)
        return { success: false, error: '获取审批详情失败' }
    }
}

// ==============================================================================
// [2.4] 批准
// ==============================================================================

export async function approveRequest(id: string, note?: string): Promise<ActionResponse<{ data: { id: string } }>> {
    try {
        const parsed = z
            .object({
                id: UuidSchema,
                note: OptionalNonEmptyString(2000),
            })
            .strict()
            .safeParse({ id, note })
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        id = parsed.data.id
        note = parsed.data.note

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "approval:approve")
        const { user, tenantId } = ctx

        const rate = await enforceRateLimit({ ctx, action: "approvals.approve", limit: 120 })
        if (!rate.allowed) return { success: false, error: rate.error }

        const approval = await prisma.approvalRequest.findFirst({ where: { id, ...approvalTenantScope(tenantId) } })
        if (!approval) {
            return { success: false, error: '审批不存在' }
        }

        if (approval.approverId && approval.approverId !== user.id) {
            return { success: false, error: '无权审批此申请' }
        }

        if (approval.status !== ApprovalStatus.PENDING) {
            return { success: false, error: '此申请已处理' }
        }

        const resolvedAt = new Date()
        const updated = await prisma.$transaction(async (tx) => {
            const res = await tx.approvalRequest.updateMany({
                where: {
                    id,
                    tenantId,
                    status: ApprovalStatus.PENDING,
                    OR: [{ approverId: null }, { approverId: user.id }],
                },
                data: {
                    status: ApprovalStatus.APPROVED,
                    approverId: user.id,
                    resolvedAt,
                    approvalNote: note,
                },
            })

            if (res.count === 0) {
                throw new Error("审批不存在或已处理，请刷新后重试")
            }

            const row = await tx.approvalRequest.findFirst({ where: { id, tenantId } })
            if (!row) {
                throw new Error("审批不存在或无权限")
            }

            return row
        })

        revalidatePath('/admin/approvals')
        if (updated.caseId) revalidatePath(`/cases/${updated.caseId}`)
        return { success: true, data: updated }
    } catch (error) {
        logger.error('审批失败:', error)
        return { success: false, error: '审批失败' }
    }
}

// ==============================================================================
// [2.5] 驳回
// ==============================================================================

export async function rejectRequest(id: string, note?: string): Promise<ActionResponse<{ data: { id: string } }>> {
    try {
        const parsed = z
            .object({
                id: UuidSchema,
                note: OptionalNonEmptyString(2000),
            })
            .strict()
            .safeParse({ id, note })
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        id = parsed.data.id
        note = parsed.data.note

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "approval:approve")
        const rate = await enforceRateLimit({ ctx, action: "approval.reject", limit: 120 })
        if (!rate.allowed) {
            return { success: false, error: rate.error }
        }
        const { user, tenantId } = ctx

        const approval = await prisma.approvalRequest.findFirst({ where: { id, ...approvalTenantScope(tenantId) } })
        if (!approval) {
            return { success: false, error: '审批不存在' }
        }

        if (approval.approverId && approval.approverId !== user.id) {
            return { success: false, error: '无权审批此申请' }
        }

        if (approval.status !== ApprovalStatus.PENDING) {
            return { success: false, error: '此申请已处理' }
        }

        const resolvedAt = new Date()
        const updated = await prisma.$transaction(async (tx) => {
            const res = await tx.approvalRequest.updateMany({
                where: {
                    id,
                    tenantId,
                    status: ApprovalStatus.PENDING,
                    OR: [{ approverId: null }, { approverId: user.id }],
                },
                data: {
                    status: ApprovalStatus.REJECTED,
                    approverId: user.id,
                    resolvedAt,
                    approvalNote: note || '已驳回',
                },
            })

            if (res.count === 0) {
                throw new Error("审批不存在或已处理，请刷新后重试")
            }

            const row = await tx.approvalRequest.findFirst({ where: { id, tenantId } })
            if (!row) {
                throw new Error("审批不存在或无权限")
            }

            return row
        })

        revalidatePath('/admin/approvals')
        if (updated.caseId) revalidatePath(`/cases/${updated.caseId}`)
        return { success: true, data: updated }
    } catch (error) {
        logger.error('驳回失败:', error)
        return { success: false, error: '驳回失败' }
    }
}

// ==============================================================================
// [2.6] 撤回
// ==============================================================================

export async function cancelRequest(id: string): Promise<ActionResponse<{ data: { id: string } }>> {
    try {
        const parsedId = UuidSchema.safeParse(id)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败" }
        }
        id = parsedId.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "approval:create")
        const rate = await enforceRateLimit({ ctx, action: "approval.cancel", limit: 120 })
        if (!rate.allowed) {
            return { success: false, error: rate.error }
        }
        const { user, tenantId } = ctx

        const approval = await prisma.approvalRequest.findFirst({ where: { id, ...approvalTenantScope(tenantId) } })
        if (!approval) {
            return { success: false, error: '审批不存在' }
        }

        if (approval.requesterId !== user.id) {
            return { success: false, error: '只有申请人可以撤回' }
        }

        if (approval.status !== ApprovalStatus.PENDING && approval.status !== ApprovalStatus.DRAFT) {
            return { success: false, error: '已处理的申请无法撤回' }
        }

        const updated = await prisma.$transaction(async (tx) => {
            const res = await tx.approvalRequest.updateMany({
                where: {
                    id,
                    tenantId,
                    requesterId: user.id,
                    status: { in: [ApprovalStatus.PENDING, ApprovalStatus.DRAFT] },
                },
                data: { status: ApprovalStatus.CANCELLED },
            })

            if (res.count === 0) {
                throw new Error("审批不存在或已处理，请刷新后重试")
            }

            const row = await tx.approvalRequest.findFirst({ where: { id, tenantId } })
            if (!row) {
                throw new Error("审批不存在或无权限")
            }

            return row
        })

        revalidatePath('/admin/approvals')
        if (updated.caseId) revalidatePath(`/cases/${updated.caseId}`)
        return { success: true, data: updated }
    } catch (error) {
        logger.error('撤回失败:', error)
        return { success: false, error: '撤回失败' }
    }
}

// ==============================================================================
// 获取可选审批人（上级/部门主管）
// ==============================================================================

type AvailableApprover = {
    id: string
    title: string | null
    name: string | null
    avatarUrl: string | null
    department: string | null
}

export async function getAvailableApprovers(): Promise<
    ActionResponse<{ data: AvailableApprover[] }, { data: AvailableApprover[] }>
> {
    try {
        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "approval:create")
        const { tenantId } = ctx

        const rate = await enforceRateLimit({ ctx, action: "approvals.approvers.list", limit: 240 })
        if (!rate.allowed) return { success: false, error: rate.error, data: [] }

        // 获取有审批权限的用户（合伙人/高级律师/管理员）
        const approvers = await prisma.tenantMembership.findMany({
            where: {
                tenantId,
                status: "ACTIVE",
                role: { in: ["ADMIN", "OWNER"] },
                user: {
                    isActive: true,
                    role: { in: ["PARTNER", "SENIOR_LAWYER", "ADMIN"] },
                },
            },
            select: {
                user: { select: { id: true, name: true, title: true, department: true, avatarUrl: true } },
            },
            orderBy: { user: { name: "asc" } },
            take: 200,
        })

        return { success: true, data: approvers.map((m) => m.user) }
    } catch (error) {
        logger.error('获取审批人失败:', error)
        return { success: false, error: '获取审批人失败', data: [] }
    }
}

// ==============================================================================
// [2.7] 案件视角：按案件获取审批（用于案件详情联动）
// ==============================================================================

export async function getApprovalsByCase(
    caseId: string
): Promise<ActionResponse<{ data: ApprovalListItem[] }, { data: ApprovalListItem[] }>> {
    try {
        const parsedId = UuidSchema.safeParse(caseId)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败", data: [] as ApprovalListItem[] }
        }
        caseId = parsedId.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "approval:create")
        const { user, tenantId } = ctx

        const rate = await enforceRateLimit({ ctx, action: "approvals.byCase.list", limit: 240 })
        if (!rate.allowed) return { success: false, error: rate.error, data: [] }
        await requireCaseAccess(caseId, user, "case:view")

        const approvals = await prisma.approvalRequest.findMany({
            where: { caseId, ...approvalTenantScope(tenantId) },
            include: {
                requester: { select: { id: true, name: true, avatarUrl: true } },
                approver: { select: { id: true, name: true, avatarUrl: true } },
                case: { select: { id: true, title: true, caseCode: true } },
                client: { select: { id: true, name: true, type: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 200,
        })

        return { success: true, data: approvals }
    } catch (error) {
        logger.error("获取案件审批失败:", error)
        return { success: false, error: "获取案件审批失败", data: [] as ApprovalListItem[] }
    }
}
