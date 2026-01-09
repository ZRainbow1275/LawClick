"use server"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { revalidatePath } from "next/cache"
import { ContractStatus } from "@prisma/client"
import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { DateInputSchema, NonNegativeNumber, OptionalNonEmptyString, UuidSchema } from "@/lib/zod"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import {
    getActiveTenantContextWithPermissionOrThrow,
    getCaseListAccessWhereOrThrow,
    requireCaseAccess,
    requireTenantPermission,
} from "@/lib/server-auth"
import { ensureContactsInTenant } from "@/lib/tenant-guards"
import { contractTenantScope } from "@/lib/tenant-scope"

function parseDateInput(value?: string | Date | null) {
    if (value === undefined || value === null) return null
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) throw new Error("无效日期")
    return date
}

const CreateContractSchema = z
    .object({
        contractNo: OptionalNonEmptyString(120),
        title: z.string().trim().min(1, "合同标题不能为空").max(200),
        status: z.nativeEnum(ContractStatus).optional(),
        amount: NonNegativeNumber().optional(),
        signedAt: DateInputSchema.nullable().optional(),
        startDate: DateInputSchema.nullable().optional(),
        endDate: DateInputSchema.nullable().optional(),
        notes: OptionalNonEmptyString(5000),
        caseId: UuidSchema.optional(),
        clientId: UuidSchema.optional(),
        documentId: UuidSchema.optional(),
    })
    .strict()

export async function createContract(input: {
    contractNo?: string
    title: string
    status?: ContractStatus
    amount?: number
    signedAt?: string | Date | null
    startDate?: string | Date | null
    endDate?: string | Date | null
    notes?: string
    caseId?: string
    clientId?: string
    documentId?: string
}) {
    try {
        const parsed = CreateContractSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        input = parsed.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("billing:create")
        const { user, tenantId, viewer } = ctx

        const rate = await enforceRateLimit({ ctx, action: "contracts.create", limit: 120 })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }

        let caseId = input.caseId || null
        let clientId = input.clientId || null

        if (input.documentId) {
            const doc = await prisma.document.findFirst({
                where: { id: input.documentId, case: { tenantId } },
                select: { id: true, caseId: true },
            })
            if (!doc) return { success: false as const, error: "文档不存在" }

            if (!caseId) caseId = doc.caseId
            if (caseId !== doc.caseId) return { success: false as const, error: "合同与文档所属案件不一致" }
        }

        if (caseId) {
            await requireCaseAccess(caseId, viewer, "case:view")
            if (!clientId) {
                const row = await prisma.case.findFirst({ where: { id: caseId, tenantId }, select: { clientId: true } })
                clientId = row?.clientId || null
            }
        }

        if (clientId) {
            const ok = await ensureContactsInTenant({ tenantId, contactIds: [clientId] })
            if (!ok) return { success: false as const, error: "客户不存在或不在当前租户" }
        }

        const signedAt = parseDateInput(input.signedAt)
        const startDate = parseDateInput(input.startDate)
        const endDate = parseDateInput(input.endDate)

        let contractNo = (input.contractNo || "").trim()
        if (!contractNo) {
            const today = new Date()
            const prefix = `CTR-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`
            const count = await prisma.contract.count({ where: { tenantId, contractNo: { startsWith: prefix } } })
            contractNo = `${prefix}-${String(count + 1).padStart(4, "0")}`
        }

        const contract = await prisma.contract.create({
            data: {
                tenantId,
                contractNo,
                title: input.title,
                status: input.status ?? ContractStatus.DRAFT,
                amount: input.amount,
                signedAt,
                startDate,
                endDate,
                notes: input.notes,
                caseId,
                clientId,
                documentId: input.documentId ?? null,
                creatorId: user.id,
            },
            include: {
                case: { select: { id: true, title: true, caseCode: true } },
                client: { select: { id: true, name: true, type: true } },
                document: { select: { id: true, title: true, fileType: true, fileUrl: true } },
                creator: { select: { id: true, name: true } },
            },
        })

        if (contract.caseId) revalidatePath(`/cases/${contract.caseId}`)
        if (contract.clientId) revalidatePath(`/crm/customers/${contract.clientId}`)
        revalidatePath("/admin/finance")

        return { success: true as const, data: contract }
    } catch (error) {
        logger.error("创建合同失败", error)
        return { success: false as const, error: "创建合同失败" }
    }
}

export async function getContracts(options?: {
    caseId?: string
    clientId?: string
    status?: ContractStatus
    search?: string
    limit?: number
}) {
    type ContractListItem = Prisma.ContractGetPayload<{
        include: {
            case: { select: { id: true; title: true; caseCode: true } }
            client: { select: { id: true; name: true; type: true } }
            document: { select: { id: true; title: true; fileType: true } }
            creator: { select: { id: true; name: true } }
        }
    }>

    try {
        const parsed = z
            .object({
                caseId: UuidSchema.optional(),
                clientId: UuidSchema.optional(),
                status: z.nativeEnum(ContractStatus).optional(),
                search: OptionalNonEmptyString(200),
                limit: z.number().int().min(1).max(200).optional(),
            })
            .strict()
            .optional()
            .safeParse(options)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败", data: [] as ContractListItem[] }
        }
        options = parsed.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("billing:view")
        const { user, tenantId, viewer } = ctx

        const rate = await enforceRateLimit({ ctx, action: "contracts.list", limit: 600 })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [] as ContractListItem[] }
        }

        const where: Prisma.ContractWhereInput = { AND: [contractTenantScope(tenantId)] }

        if (options?.caseId) {
            await requireCaseAccess(options.caseId, viewer, "case:view")
            where.caseId = options.caseId
        } else if (user.role !== "PARTNER" && user.role !== "ADMIN") {
            where.case = getCaseListAccessWhereOrThrow(viewer, "case:view")
        }

        if (options?.clientId) {
            const ok = await ensureContactsInTenant({ tenantId, contactIds: [options.clientId] })
            if (!ok) {
                return { success: false as const, error: "客户不存在或不在当前租户", data: [] as ContractListItem[] }
            }
            where.clientId = options.clientId
        }
        if (options?.status) where.status = options.status

        const search = (options?.search || "").trim()
        if (search) {
            where.OR = [
                { contractNo: { contains: search, mode: "insensitive" } },
                { title: { contains: search, mode: "insensitive" } },
            ]
        }

        const take = Math.max(1, Math.min(200, options?.limit ?? 50))

        const contracts = await prisma.contract.findMany({
            where,
            include: {
                case: { select: { id: true, title: true, caseCode: true } },
                client: { select: { id: true, name: true, type: true } },
                document: { select: { id: true, title: true, fileType: true } },
                creator: { select: { id: true, name: true } },
            },
            orderBy: { updatedAt: "desc" },
            take,
        })

        return { success: true as const, data: contracts }
    } catch (error) {
        logger.error("获取合同列表失败", error)
        return { success: false as const, error: "获取合同列表失败", data: [] as ContractListItem[] }
    }
}

export async function getContractById(id: string) {
    try {
        const parsedId = UuidSchema.safeParse(id)
        if (!parsedId.success) {
            return { success: false as const, error: "输入校验失败" }
        }
        id = parsedId.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("billing:view")
        const rate = await enforceRateLimit({ ctx, action: "contracts.get", limit: 600, extraKey: id })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { tenantId, viewer } = ctx

        const contract = await prisma.contract.findFirst({
            where: { id, AND: [contractTenantScope(tenantId)] },
            include: {
                case: { select: { id: true, title: true, caseCode: true } },
                client: { select: { id: true, name: true, type: true, email: true, phone: true } },
                document: { select: { id: true, title: true, fileType: true, fileUrl: true } },
                creator: { select: { id: true, name: true } },
            },
        })
        if (!contract) return { success: false as const, error: "合同不存在" }

        if (contract.caseId) {
            await requireCaseAccess(contract.caseId, viewer, "case:view")
        } else {
            requireTenantPermission(ctx, "admin:access")
        }

        return { success: true as const, data: contract }
    } catch (error) {
        logger.error("获取合同详情失败", error)
        return { success: false as const, error: "获取合同详情失败" }
    }
}

export async function updateContractStatus(id: string, status: ContractStatus) {
    try {
        const parsed = z
            .object({ id: UuidSchema, status: z.nativeEnum(ContractStatus) })
            .strict()
            .safeParse({ id, status })
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        id = parsed.data.id
        status = parsed.data.status

        const ctx = await getActiveTenantContextWithPermissionOrThrow("billing:edit")
        const rate = await enforceRateLimit({
            ctx,
            action: "contracts.status.update",
            limit: 120,
            extraKey: `${id}:${status}`,
        })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { tenantId, viewer } = ctx

        const existing = await prisma.contract.findFirst({ where: { id, AND: [contractTenantScope(tenantId)] }, select: { caseId: true, clientId: true } })
        if (!existing) return { success: false as const, error: "合同不存在" }
        if (existing.caseId) await requireCaseAccess(existing.caseId, viewer, "case:view")

        const updated = await prisma.contract.updateMany({
            where: { id, AND: [contractTenantScope(tenantId)] },
            data: { status },
        })
        if (updated.count === 0) return { success: false as const, error: "合同不存在" }

        const contract = await prisma.contract.findFirst({ where: { id, AND: [contractTenantScope(tenantId)] } })
        if (!contract) return { success: false as const, error: "合同不存在" }

        revalidatePath("/admin/finance")
        revalidatePath(`/contracts/${id}`)
        if (existing.caseId) revalidatePath(`/cases/${existing.caseId}`)
        if (existing.clientId) revalidatePath(`/crm/customers/${existing.clientId}`)

        return { success: true as const, data: contract }
    } catch (error) {
        logger.error("更新合同状态失败", error)
        return { success: false as const, error: "更新合同状态失败" }
    }
}

export async function deleteContract(id: string) {
    try {
        const parsed = UuidSchema.safeParse(id)
        if (!parsed.success) {
            return { success: false as const, error: "输入校验失败" }
        }
        id = parsed.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("billing:edit")
        const rate = await enforceRateLimit({ ctx, action: "contracts.delete", limit: 60, extraKey: id })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { tenantId, viewer, user } = ctx

        const existing = await prisma.contract.findFirst({
            where: { id, tenantId },
            select: { id: true, caseId: true, clientId: true, deletedAt: true },
        })
        if (!existing) return { success: false as const, error: "合同不存在" }
        if (existing.deletedAt) return { success: true as const }

        if (existing.caseId) {
            await requireCaseAccess(existing.caseId, viewer, "case:view")
        } else {
            requireTenantPermission(ctx, "admin:access")
        }

        const deleted = await prisma.contract.updateMany({
            where: { id, AND: [contractTenantScope(tenantId)] },
            data: {
                deletedAt: new Date(),
                deletedById: user.id,
                status: ContractStatus.CANCELLED,
            },
        })
        if (deleted.count === 0) return { success: false as const, error: "合同不存在或已删除" }

        revalidatePath("/admin/finance")
        revalidatePath(`/contracts/${id}`)
        if (existing.caseId) revalidatePath(`/cases/${existing.caseId}`)
        if (existing.clientId) revalidatePath(`/crm/customers/${existing.clientId}`)

        return { success: true as const }
    } catch (error) {
        logger.error("删除合同失败", error, { id })
        return { success: false as const, error: "删除合同失败" }
    }
}

export async function linkContractDocument(contractId: string, documentId: string) {
    try {
        const parsed = z
            .object({ contractId: UuidSchema, documentId: UuidSchema })
            .strict()
            .safeParse({ contractId, documentId })
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        contractId = parsed.data.contractId
        documentId = parsed.data.documentId

        const ctx = await getActiveTenantContextWithPermissionOrThrow("billing:edit")
        const rate = await enforceRateLimit({
            ctx,
            action: "contracts.document.link",
            limit: 120,
            extraKey: `${contractId}:${documentId}`,
        })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { tenantId, viewer } = ctx

        const [contract, doc] = await Promise.all([
            prisma.contract.findFirst({
                where: { id: contractId, AND: [contractTenantScope(tenantId)] },
                select: { id: true, caseId: true, clientId: true },
            }),
            prisma.document.findFirst({ where: { id: documentId, case: { tenantId } }, select: { id: true, caseId: true } }),
        ])
        if (!contract) return { success: false as const, error: "合同不存在" }
        if (!doc) return { success: false as const, error: "文档不存在" }

        const nextCaseId = contract.caseId ?? doc.caseId
        if (nextCaseId !== doc.caseId) return { success: false as const, error: "合同与文档所属案件不一致" }

        if (nextCaseId) await requireCaseAccess(nextCaseId, viewer, "case:view")

        const updated = await prisma.contract.updateMany({
            where: { id: contractId, AND: [contractTenantScope(tenantId)] },
            data: {
                documentId: doc.id,
                caseId: nextCaseId,
            },
        })
        if (updated.count === 0) return { success: false as const, error: "合同不存在" }

        const contractNext = await prisma.contract.findFirst({ where: { id: contractId, AND: [contractTenantScope(tenantId)] } })
        if (!contractNext) return { success: false as const, error: "合同不存在" }

        revalidatePath("/admin/finance")
        revalidatePath(`/contracts/${contractId}`)
        if (nextCaseId) revalidatePath(`/cases/${nextCaseId}`)
        if (contract.clientId) revalidatePath(`/crm/customers/${contract.clientId}`)

        return { success: true as const, data: contractNext }
    } catch (error) {
        logger.error("关联合同文档失败", error)
        return { success: false as const, error: "关联合同文档失败" }
    }
}

export async function unlinkContractDocument(contractId: string) {
    try {
        const parsed = UuidSchema.safeParse(contractId)
        if (!parsed.success) {
            return { success: false as const, error: "输入校验失败" }
        }
        contractId = parsed.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("billing:edit")
        const rate = await enforceRateLimit({ ctx, action: "contracts.document.unlink", limit: 120, extraKey: contractId })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { tenantId, viewer } = ctx

        const existing = await prisma.contract.findFirst({
            where: { id: contractId, AND: [contractTenantScope(tenantId)] },
            select: { caseId: true, clientId: true, documentId: true },
        })
        if (!existing) return { success: false as const, error: "合同不存在" }
        if (!existing.documentId) return { success: true as const }

        if (existing.caseId) {
            await requireCaseAccess(existing.caseId, viewer, "case:view")
        } else {
            requireTenantPermission(ctx, "admin:access")
        }

        const updated = await prisma.contract.updateMany({
            where: { id: contractId, AND: [contractTenantScope(tenantId)] },
            data: { documentId: null },
        })
        if (updated.count === 0) return { success: false as const, error: "合同不存在" }

        revalidatePath("/admin/finance")
        revalidatePath(`/contracts/${contractId}`)
        if (existing.caseId) revalidatePath(`/cases/${existing.caseId}`)
        if (existing.clientId) revalidatePath(`/crm/customers/${existing.clientId}`)

        return { success: true as const }
    } catch (error) {
        logger.error("取消关联合同文档失败", error, { contractId })
        return { success: false as const, error: "取消关联合同文档失败" }
    }
}
