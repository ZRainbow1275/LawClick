"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { CustomerGrade, CustomerStage, Prisma } from "@prisma/client"
import { getActiveTenantContextWithPermissionOrThrow } from "@/lib/server-auth"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { ensureCustomerTagsInTenant, ensureUsersInTenant } from "@/lib/tenant-guards"
import { logger } from "@/lib/logger"
import { z } from "zod"
import { DateInputSchema, NullableNonEmptyString, OptionalNonEmptyString, UuidSchema } from "@/lib/zod"
import { DEFAULT_CUSTOMER_TAG_COLOR } from "@/lib/ui/brand-colors"

const GetCustomersOptionsSchema = z
    .object({
        page: z.coerce.number().int().min(1).max(10_000).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
        search: OptionalNonEmptyString(200),
        stage: z.nativeEnum(CustomerStage).optional(),
        grade: z.nativeEnum(CustomerGrade).optional(),
        assigneeId: UuidSchema.optional(),
    })
    .strict()
    .optional()

const CustomerTypeSchema = z.enum(["COMPANY", "INDIVIDUAL"])

const CreateCustomerInputSchema = z
    .object({
        name: z.string().trim().min(1, "客户名称不能为空").max(200),
        type: CustomerTypeSchema,
        email: z.string().trim().email("邮箱格式不正确").optional(),
        phone: OptionalNonEmptyString(50),
        industry: OptionalNonEmptyString(200),
        source: OptionalNonEmptyString(200),
        address: OptionalNonEmptyString(500),
        notes: OptionalNonEmptyString(20_000),
        stage: z.nativeEnum(CustomerStage).optional(),
        grade: z.nativeEnum(CustomerGrade).optional(),
    })
    .strict()

const UpdateCustomerInputSchema = z
    .object({
        name: OptionalNonEmptyString(200),
        email: z.string().trim().email("邮箱格式不正确").nullable().optional(),
        phone: NullableNonEmptyString(50),
        industry: NullableNonEmptyString(200),
        source: NullableNonEmptyString(200),
        address: NullableNonEmptyString(500),
        notes: NullableNonEmptyString(20_000),
        stage: z.nativeEnum(CustomerStage).optional(),
        grade: z.nativeEnum(CustomerGrade).optional(),
        nextFollowUp: DateInputSchema.nullable().optional(),
        assigneeId: UuidSchema.nullable().optional(),
    })
    .strict()
    .refine((v) => Object.values(v).some((value) => value !== undefined), { message: "没有需要更新的字段" })

const CustomerTagColorSchema = z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "颜色格式不正确（应为 #RRGGBB）")
    .optional()

// ==============================================================================
// [2.1] 获取客户列表（分页+筛选+搜索）
// ==============================================================================

export async function getCustomers(options?: {
    page?: number
    limit?: number
    search?: string
    stage?: CustomerStage
    grade?: CustomerGrade
    assigneeId?: string
}) {
    type CustomerRow = Prisma.ContactGetPayload<{
        include: {
            assignee: { select: { id: true; name: true; avatarUrl: true } }
            tags: { select: { id: true; name: true; color: true } }
            _count: { select: { casesAsClient: true; serviceRecords: true } }
        }
    }>

    const parsedOptions = GetCustomersOptionsSchema.safeParse(options)
    const page = parsedOptions.success ? (parsedOptions.data?.page ?? 1) : 1
    const limit = parsedOptions.success ? (parsedOptions.data?.limit ?? 20) : 20

    try {
        if (!parsedOptions.success) {
            return { success: false as const, error: parsedOptions.error.issues[0]?.message || "输入校验失败", data: [] as CustomerRow[], total: 0, page, limit }
        }
        options = parsedOptions.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("crm:view")
        const rate = await enforceRateLimit({ ctx, action: "customers.list", limit: 600 })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [] as CustomerRow[], total: 0, page, limit }
        }
        const { tenantId } = ctx

        const skip = (page - 1) * limit

        const where: Prisma.ContactWhereInput = { tenantId, deletedAt: null }

        // 搜索条件
        if (options?.search) {
            where.OR = [
                { name: { contains: options.search, mode: 'insensitive' } },
                { email: { contains: options.search, mode: 'insensitive' } },
                { phone: { contains: options.search } },
            ]
        }

        // 筛选条件
        if (options?.stage) where.stage = options.stage
        if (options?.grade) where.grade = options.grade
        if (options?.assigneeId) where.assigneeId = options.assigneeId

        const [customers, total] = await Promise.all([
            prisma.contact.findMany({
                where,
                include: {
                    assignee: { select: { id: true, name: true, avatarUrl: true } },
                    tags: { select: { id: true, name: true, color: true } },
                    _count: { select: { casesAsClient: true, serviceRecords: true } },
                },
                orderBy: { updatedAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.contact.count({ where }),
        ])

        return { success: true as const, data: customers, total, page, limit }
    } catch (error) {
        logger.error("获取客户列表失败", error)
        return { success: false as const, error: "获取客户列表失败", data: [] as CustomerRow[], total: 0, page, limit }
    }
}

// ==============================================================================
// [2.2] 获取客户详情
// ==============================================================================

export async function getCustomerById(id: string) {
    try {
        const parsedId = UuidSchema.safeParse(id)
        if (!parsedId.success) {
            return { success: false as const, error: "输入校验失败" }
        }
        id = parsedId.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("crm:view")
        const rate = await enforceRateLimit({ ctx, action: "customers.get", limit: 600, extraKey: id })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { tenantId } = ctx

        const customer = await prisma.contact.findFirst({
            where: { id, tenantId, deletedAt: null },
            include: {
                assignee: { select: { id: true, name: true, avatarUrl: true, title: true } },
                tags: { select: { id: true, name: true, color: true } },
                casesAsClient: {
                    where: { tenantId },
                    select: { id: true, title: true, caseCode: true, status: true },
                    take: 10,
                    orderBy: { createdAt: 'desc' },
                },
                serviceRecords: {
                    include: { lawyer: { select: { name: true } } },
                    orderBy: { serviceDate: 'desc' },
                    take: 10,
                },
            },
        })

        if (!customer) {
            return { success: false as const, error: "客户不存在" }
        }

        return { success: true as const, data: customer }
    } catch (error) {
        logger.error("获取客户详情失败", error, { id })
        return { success: false as const, error: "获取客户详情失败" }
    }
}

// ==============================================================================
// [2.3] 创建客户
// ==============================================================================

export async function createCustomer(data: {
    name: string
    type: 'COMPANY' | 'INDIVIDUAL'
    email?: string
    phone?: string
    industry?: string
    source?: string
    address?: string
    notes?: string
    stage?: CustomerStage
    grade?: CustomerGrade
}) {
    try {
        const parsed = CreateCustomerInputSchema.safeParse(data)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        data = parsed.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("crm:edit")
        const rate = await enforceRateLimit({ ctx, action: "customers.create", limit: 120 })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { user, tenantId } = ctx

        const customer = await prisma.contact.create({
            data: {
                tenantId,
                name: data.name,
                type: data.type,
                email: data.email,
                phone: data.phone,
                industry: data.industry,
                source: data.source,
                address: data.address,
                notes: data.notes,
                stage: data.stage || 'POTENTIAL',
                grade: data.grade || 'POTENTIAL',
                assigneeId: user.id, // 创建人默认为负责人
            },
        })

        revalidatePath('/crm/customers')
        return { success: true as const, data: customer }
    } catch (error) {
        logger.error("创建客户失败", error)
        return { success: false as const, error: "创建客户失败" }
    }
}

// ==============================================================================
// [2.3.1] 更新客户（基础信息/负责人/下次跟进）
// ==============================================================================

export async function updateCustomer(id: string, data: {
    name?: string
    email?: string | null
    phone?: string | null
    industry?: string | null
    source?: string | null
    address?: string | null
    notes?: string | null
    stage?: CustomerStage
    grade?: CustomerGrade
    nextFollowUp?: Date | null
    assigneeId?: string | null
}) {
    try {
        const parsed = z
            .object({ id: UuidSchema, data: UpdateCustomerInputSchema })
            .strict()
            .safeParse({ id, data })
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        id = parsed.data.id
        data = parsed.data.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("crm:edit")
        const rate = await enforceRateLimit({ ctx, action: "customers.update", limit: 120, extraKey: id })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { tenantId } = ctx

        const existing = await prisma.contact.findFirst({
            where: { id, tenantId, deletedAt: null },
            select: { id: true },
        })
        if (!existing) {
            return { success: false as const, error: "客户不存在" }
        }

        if (data.assigneeId !== undefined && data.assigneeId !== null) {
            const ok = await ensureUsersInTenant({ tenantId, userIds: [data.assigneeId] })
            if (!ok) return { success: false as const, error: "负责人不存在或不在当前租户" }
        }

        const updated = await prisma.contact.updateMany({
            where: { id, tenantId, deletedAt: null },
            data: {
                ...(data.name !== undefined ? { name: data.name } : {}),
                ...(data.email !== undefined ? { email: data.email } : {}),
                ...(data.phone !== undefined ? { phone: data.phone } : {}),
                ...(data.industry !== undefined ? { industry: data.industry } : {}),
                ...(data.source !== undefined ? { source: data.source } : {}),
                ...(data.address !== undefined ? { address: data.address } : {}),
                ...(data.notes !== undefined ? { notes: data.notes } : {}),
                ...(data.stage !== undefined ? { stage: data.stage } : {}),
                ...(data.grade !== undefined ? { grade: data.grade } : {}),
                ...(data.nextFollowUp !== undefined ? { nextFollowUp: data.nextFollowUp } : {}),
                ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId } : {}),
            },
        })
        if (updated.count === 0) {
            return { success: false as const, error: "客户不存在" }
        }

        const customer = await prisma.contact.findFirst({ where: { id, tenantId, deletedAt: null } })
        if (!customer) {
            return { success: false as const, error: "客户不存在" }
        }

        revalidatePath('/crm/customers')
        revalidatePath(`/crm/customers/${id}`)
        return { success: true as const, data: customer }
    } catch (error) {
        logger.error("更新客户失败", error, { id })
        return { success: false as const, error: "更新客户失败" }
    }
}

// =========================================================================
// [2.3.2] 删除客户（软删除 -> 回收站可恢复）
// =========================================================================

export async function deleteCustomer(contactId: string) {
    try {
        const parsedId = UuidSchema.safeParse(contactId)
        if (!parsedId.success) {
            return { success: false as const, error: "输入校验失败" }
        }
        contactId = parsedId.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("crm:edit")
        const rate = await enforceRateLimit({ ctx, action: "customers.delete", limit: 60, extraKey: contactId })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { tenantId, user } = ctx

        const updated = await prisma.contact.updateMany({
            where: { id: contactId, tenantId, deletedAt: null },
            data: { deletedAt: new Date(), deletedById: user.id },
        })
        if (updated.count === 0) {
            return { success: false as const, error: "客户不存在或已删除" }
        }

        revalidatePath("/crm/customers")
        revalidatePath(`/crm/customers/${contactId}`)
        revalidatePath("/cases")

        return { success: true as const }
    } catch (error) {
        logger.error("删除客户失败", error, { contactId })
        return { success: false as const, error: "删除客户失败" }
    }
}

// ==============================================================================
// [2.4] 更新客户阶段
// ==============================================================================

export async function updateCustomerStage(id: string, stage: CustomerStage) {   
    try {
        const parsed = z
            .object({ id: UuidSchema, stage: z.nativeEnum(CustomerStage) })
            .strict()
            .safeParse({ id, stage })
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        id = parsed.data.id
        stage = parsed.data.stage

        const ctx = await getActiveTenantContextWithPermissionOrThrow("crm:edit")
        const rate = await enforceRateLimit({
            ctx,
            action: "customers.stage.update",
            limit: 120,
            extraKey: `${id}:${stage}`,
        })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { tenantId } = ctx

        const existing = await prisma.contact.findFirst({ where: { id, tenantId, deletedAt: null }, select: { id: true } })
        if (!existing) {
            return { success: false as const, error: "客户不存在" }
        }

        const updated = await prisma.contact.updateMany({
            where: { id, tenantId, deletedAt: null },
            data: { stage },
        })
        if (updated.count === 0) {
            return { success: false as const, error: "客户不存在" }
        }

        const customer = await prisma.contact.findFirst({ where: { id, tenantId, deletedAt: null } })
        if (!customer) {
            return { success: false as const, error: "客户不存在" }
        }

        revalidatePath('/crm/customers')
        revalidatePath(`/crm/customers/${id}`)
        return { success: true as const, data: customer }
    } catch (error) {
        logger.error("更新客户阶段失败", error, { id })
        return { success: false as const, error: "更新客户阶段失败" }
    }
}

// ==============================================================================
// [2.5] 标签管理
// ==============================================================================

// 获取所有标签
export async function getTags() {
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("crm:view")
        const rate = await enforceRateLimit({ ctx, action: "customers.tags.list", limit: 600 })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [] }
        }
        const { tenantId } = ctx

        const tags = await prisma.customerTag.findMany({
            where: { tenantId },
            include: { _count: { select: { contacts: true } } },
            orderBy: { name: 'asc' },
            take: 500,
        })
        return { success: true as const, data: tags }
    } catch (error) {
        logger.error("获取标签失败", error)
        return { success: false as const, error: "获取标签失败", data: [] }
    }
}

// 添加标签到客户
export async function addTagToCustomer(customerId: string, tagId: string) {     
    try {
        const parsed = z
            .object({ customerId: UuidSchema, tagId: UuidSchema })
            .strict()
            .safeParse({ customerId, tagId })
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        customerId = parsed.data.customerId
        tagId = parsed.data.tagId

        const ctx = await getActiveTenantContextWithPermissionOrThrow("crm:edit")
        const rate = await enforceRateLimit({
            ctx,
            action: "customers.tags.attach",
            limit: 120,
            extraKey: `${customerId}:${tagId}`,
        })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { tenantId } = ctx

        const customer = await prisma.contact.findFirst({
            where: { id: customerId, tenantId, deletedAt: null },
            select: { id: true },
        })
        if (!customer) {
            return { success: false as const, error: "客户不存在" }
        }

        const ok = await ensureCustomerTagsInTenant({ tenantId, tagIds: [tagId] })
        if (!ok) {
            return { success: false as const, error: "标签不存在或不在当前租户" }        
        }

        await prisma.$executeRaw(
            Prisma.sql`
                INSERT INTO "_ContactTags" ("A", "B")
                SELECT ${customerId}, ${tagId}
                WHERE EXISTS (
                    SELECT 1 FROM "Contact"
                    WHERE id = ${customerId} AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
                )
                AND EXISTS (
                    SELECT 1 FROM "CustomerTag"
                    WHERE id = ${tagId} AND "tenantId" = ${tenantId}
                )
                ON CONFLICT DO NOTHING
            `
        )

        revalidatePath(`/crm/customers/${customerId}`)
        return { success: true as const }
    } catch (error) {
        logger.error("添加标签失败", error, { customerId, tagId })
        return { success: false as const, error: "添加标签失败" }
    }
}

// 创建新标签
export async function createTag(name: string, color?: string) {
    try {
        const parsed = z
            .object({ name: z.string().trim().min(1, "标签名称不能为空").max(64), color: CustomerTagColorSchema })
            .strict()
            .safeParse({ name, color })
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        name = parsed.data.name
        color = parsed.data.color

        const ctx = await getActiveTenantContextWithPermissionOrThrow("crm:edit")
        const rate = await enforceRateLimit({ ctx, action: "customers.tags.create", limit: 120, extraKey: name })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { tenantId } = ctx

        const tag = await prisma.customerTag.create({
            data: { tenantId, name, color: color || DEFAULT_CUSTOMER_TAG_COLOR },
        })

        return { success: true as const, data: tag }
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            return { success: false as const, error: "标签已存在" }
        }
        logger.error("创建标签失败", error)
        return { success: false as const, error: "创建标签失败" }
    }
}

// ==============================================================================
// [2.6] 服务记录管理
// ==============================================================================

// 添加服务记录
export async function addServiceRecord(data: {
    contactId: string
    type: string
    content: string
    serviceDate: Date
    satisfaction?: number
    followUpNote?: string
    nextAction?: string
}) {
    try {
        const parsed = z
            .object({
                contactId: UuidSchema,
                type: z.string().trim().min(1, "服务类型不能为空").max(64),
                content: z.string().trim().min(1, "服务内容不能为空").max(20_000),
                serviceDate: DateInputSchema,
                satisfaction: z.number().int().min(1).max(5).optional(),
                followUpNote: OptionalNonEmptyString(5000),
                nextAction: OptionalNonEmptyString(5000),
            })
            .strict()
            .safeParse(data)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        data = parsed.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("crm:edit")
        const rate = await enforceRateLimit({
            ctx,
            action: "customers.serviceRecords.create",
            limit: 120,
            extraKey: data.contactId,
        })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { user, tenantId } = ctx

        const contact = await prisma.contact.findFirst({
            where: { id: data.contactId, tenantId, deletedAt: null },
            select: { id: true },
        })
        if (!contact) {
            return { success: false as const, error: "客户不存在" }
        }

        const record = await prisma.serviceRecord.create({
            data: {
                contactId: data.contactId,
                lawyerId: user.id,
                type: data.type,
                content: data.content,
                serviceDate: data.serviceDate,
                satisfaction: data.satisfaction,
                followUpNote: data.followUpNote,
                nextAction: data.nextAction,
            },
        })

        revalidatePath(`/crm/customers/${data.contactId}`)
        return { success: true as const, data: record }
    } catch (error) {
        logger.error("添加服务记录失败", error, { contactId: data.contactId })  
        return { success: false as const, error: "添加服务记录失败" }
    }
}

// 获取服务记录
export async function getServiceRecords(contactId: string) {
    try {
        const parsedId = UuidSchema.safeParse(contactId)
        if (!parsedId.success) {
            return { success: false as const, error: "输入校验失败", data: [] }
        }
        contactId = parsedId.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("crm:view")
        const rate = await enforceRateLimit({
            ctx,
            action: "customers.serviceRecords.list",
            limit: 600,
            extraKey: contactId,
        })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [] }
        }
        const { tenantId } = ctx

        const records = await prisma.serviceRecord.findMany({
            where: { contactId, contact: { tenantId, deletedAt: null } },       
            include: { lawyer: { select: { name: true, avatarUrl: true } } },   
            orderBy: { serviceDate: 'desc' },
            take: 200,
        })
        return { success: true as const, data: records }
    } catch (error) {
        logger.error("获取服务记录失败", error, { contactId })
        return { success: false as const, error: "获取服务记录失败", data: [] }
    }
}

// ==============================================================================
// 客户统计
// ==============================================================================

export async function getCustomerStats() {
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("crm:view")
        const rate = await enforceRateLimit({ ctx, action: "customers.stats", limit: 240 })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { tenantId } = ctx

        const [total, byStage, byGrade] = await Promise.all([
            prisma.contact.count({ where: { tenantId, deletedAt: null } }),
            prisma.contact.groupBy({
                where: { tenantId, deletedAt: null },
                by: ['stage'],
                _count: true,
            }),
            prisma.contact.groupBy({
                where: { tenantId, deletedAt: null },
                by: ['grade'],
                _count: true,
            }),
        ])

        return {
            success: true as const,
            data: {
                total,
                byStage: byStage.reduce((acc, item) => {
                    acc[item.stage] = item._count
                    return acc
                }, {} as Record<string, number>),
                byGrade: byGrade.reduce((acc, item) => {
                    acc[item.grade] = item._count
                    return acc
                }, {} as Record<string, number>),
            },
        }
    } catch (error) {
        logger.error("获取客户统计失败", error)
        return { success: false as const, error: "获取客户统计失败" }
    }
}

// ==============================================================================
// 轻量目录（用于 Select/搜索）
// ==============================================================================

export async function getCustomerDirectory(options?: { search?: string; limit?: number }) {
    type CustomerDirectoryRow = Prisma.ContactGetPayload<{
        select: { id: true; name: true; type: true; email: true; phone: true; stage: true; grade: true }
    }>

    try {
        const parsed = z
            .object({ search: OptionalNonEmptyString(200), limit: z.coerce.number().int().min(1).max(100).optional() })
            .strict()
            .optional()
            .safeParse(options)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败", data: [] as CustomerDirectoryRow[] }
        }
        options = parsed.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("crm:view")
        const rate = await enforceRateLimit({ ctx, action: "customers.directory", limit: 600 })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [] as CustomerDirectoryRow[] }
        }
        const { tenantId } = ctx

        const limit = Math.max(1, Math.min(100, options?.limit ?? 30))
        const search = (options?.search || "").trim()

        const where: Prisma.ContactWhereInput = { tenantId, deletedAt: null }
        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { phone: { contains: search } },
            ]
        }

        const rows = await prisma.contact.findMany({
            where,
            select: { id: true, name: true, type: true, email: true, phone: true, stage: true, grade: true },
            orderBy: { updatedAt: "desc" },
            take: limit,
        })

        return { success: true as const, data: rows }
    } catch (error) {
        logger.error("获取客户目录失败", error)
        return { success: false as const, error: "获取客户目录失败", data: [] as CustomerDirectoryRow[] }
    }
}
