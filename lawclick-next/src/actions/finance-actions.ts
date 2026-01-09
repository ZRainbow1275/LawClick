"use server"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { revalidatePath } from "next/cache"
import { ExpenseStatus, InvoiceStatus, PaymentMethod, type Expense, type Invoice, type Payment, type Prisma } from "@prisma/client"
import type { ActionResponse } from "@/lib/action-response"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import {
    getActiveTenantContextWithPermissionOrThrow,
    getCaseListAccessWhereOrThrow,
    requireCaseAccess,
    requireTenantPermission,
} from "@/lib/server-auth"
import { ensureContactsInTenant, ensureUsersInTenant } from "@/lib/tenant-guards"
import { invoiceTenantScope } from "@/lib/tenant-scope"
import { z } from "zod"
import { DateInputSchema, NonNegativeNumber, OptionalNonEmptyString, PositiveNumber, UuidSchema } from "@/lib/zod"

// ==============================================================================
// 发票管理 Actions
// ==============================================================================

const GetInvoicesOptionsSchema = z
    .object({
        caseId: UuidSchema.optional(),
        status: z.nativeEnum(InvoiceStatus).optional(),
        clientId: UuidSchema.optional(),
    })
    .strict()
    .optional()

const CreateInvoiceSchema = z
    .object({
        caseId: UuidSchema.optional(),
        clientId: UuidSchema.optional(),
        amount: PositiveNumber(),
        tax: NonNegativeNumber().optional(),
        description: OptionalNonEmptyString(2000),
        dueDate: DateInputSchema.optional(),
    })
    .strict()

type InvoiceListItem = Prisma.InvoiceGetPayload<{
    include: {
        case: { select: { id: true; title: true; caseCode: true } }
        client: { select: { id: true; name: true } }
        payments: { select: { id: true; amount: true; receivedAt: true } }
    }
}>

type ExpenseListItem = Prisma.ExpenseGetPayload<{
    include: {
        case: { select: { id: true; title: true } }
        user: { select: { id: true; name: true } }
    }
}>

// 获取发票列表
export async function getInvoices(options?: {
    caseId?: string
    status?: InvoiceStatus
    clientId?: string
}) {
    try {
        const parsed = GetInvoicesOptionsSchema.safeParse(options)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败", data: [] as InvoiceListItem[] }
        }
        options = parsed.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("billing:view")
        const { user, tenantId, viewer } = ctx

        const rate = await enforceRateLimit({ ctx, action: "finance.invoices.list", limit: 600 })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [] as InvoiceListItem[] }
        }

        const where: Prisma.InvoiceWhereInput = { AND: [invoiceTenantScope(tenantId)] }

        if (options?.caseId) {
            await requireCaseAccess(options.caseId, viewer, "case:view")
            where.caseId = options.caseId
        } else if (user.role !== "PARTNER" && user.role !== "ADMIN") {
            where.case = getCaseListAccessWhereOrThrow(viewer, "case:view")
        }

        if (options?.status) where.status = options.status
        if (options?.clientId) {
            const ok = await ensureContactsInTenant({ tenantId, contactIds: [options.clientId] })
            if (!ok) {
                return { success: false as const, error: "客户不存在或不在当前租户", data: [] as InvoiceListItem[] }
            }
            where.clientId = options.clientId
        }

        const invoices = await prisma.invoice.findMany({
            where,
            include: {
                case: { select: { id: true, title: true, caseCode: true } },    
                client: { select: { id: true, name: true } },
                payments: { select: { id: true, amount: true, receivedAt: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
        })

        return { success: true as const, data: invoices }
    } catch (error) {
        logger.error("获取发票列表失败", error)
        return { success: false as const, error: '获取发票列表失败', data: [] as InvoiceListItem[] }
    }
}

// 创建发票
export async function createInvoice(data: {
    caseId?: string
    clientId?: string
    amount: number
    tax?: number
    description?: string
    dueDate?: Date
}): Promise<ActionResponse<{ data: Invoice }>> {
    try {
        const parsed = CreateInvoiceSchema.safeParse(data)
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        data = parsed.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("billing:create")
        const rate = await enforceRateLimit({ ctx, action: "finance.invoices.create", limit: 120 })
        if (!rate.allowed) {
            return { success: false, error: rate.error }
        }
        const { tenantId, viewer } = ctx

        const caseId = data.caseId || null
        if (caseId) {
            await requireCaseAccess(caseId, viewer, "case:view")
        }

        let clientId = data.clientId || null
        if (clientId) {
            const ok = await ensureContactsInTenant({ tenantId, contactIds: [clientId] })
            if (!ok) {
                return { success: false, error: "客户不存在或不在当前租户" }
            }
        }

        if (!clientId && caseId) {
            const row = await prisma.case.findFirst({ where: { id: caseId, tenantId }, select: { clientId: true } })
            clientId = row?.clientId || null
            if (clientId) {
                const ok = await ensureContactsInTenant({ tenantId, contactIds: [clientId] })
                if (!ok) {
                    return { success: false, error: "案件关联的客户不在当前租户（数据异常）" }
                }
            }
        }

        // 生成发票号：INV-YYYYMMDD-XXXX
        const today = new Date()
        const prefix = `INV-${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`
        const count = await prisma.invoice.count({
            where: { tenantId, invoiceNo: { startsWith: prefix } },
        })
        const invoiceNo = `${prefix}-${String(count + 1).padStart(4, '0')}`

        const tax = data.tax || 0
        const totalAmount = data.amount + tax

        const invoice = await prisma.invoice.create({
            data: {
                tenantId,
                invoiceNo,
                caseId,
                clientId,
                amount: data.amount,
                tax,
                totalAmount,
                description: data.description,
                dueDate: data.dueDate || null,
                status: 'DRAFT',
            },
        })

        revalidatePath('/admin/finance')
        if (invoice.caseId) revalidatePath(`/cases/${invoice.caseId}`)
        return { success: true, data: invoice }
    } catch (error) {
        logger.error("创建发票失败", error)
        return { success: false, error: '创建发票失败' }
    }
}

// 更新发票状态
export async function updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<ActionResponse<{ data: Invoice }>> {
    try {
        const parsed = z
            .object({ id: UuidSchema, status: z.nativeEnum(InvoiceStatus) })
            .strict()
            .safeParse({ id, status })
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        id = parsed.data.id
        status = parsed.data.status

        const ctx = await getActiveTenantContextWithPermissionOrThrow("billing:edit")
        const rate = await enforceRateLimit({
            ctx,
            action: "finance.invoices.status.update",
            limit: 120,
            extraKey: `${id}:${status}`,
        })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { tenantId, viewer } = ctx

        const existing = await prisma.invoice.findFirst({
            where: { id, AND: [invoiceTenantScope(tenantId)] },
            include: { payments: { select: { amount: true } } },
        })
        if (!existing) return { success: false, error: "发票不存在" }

        if (existing.caseId) {
            await requireCaseAccess(existing.caseId, viewer, "case:view")
        }

        const totalPaid = existing.payments.reduce((sum, p) => sum + Number(p.amount), 0)
        const totalAmount = Number(existing.totalAmount)

        const expectedByPayments: InvoiceStatus | null =
            totalPaid >= totalAmount ? "PAID" : totalPaid > 0 ? "PARTIAL" : null

        if (expectedByPayments) {
            if (status !== expectedByPayments) {
                return {
                    success: false,
                    error:
                        expectedByPayments === "PAID"
                            ? "该发票已完成收款，状态只能为“已付款”"
                            : "该发票已记录部分收款，状态只能为“部分付款”",     
                }
            }
        } else if (status === "PAID" || status === "PARTIAL") {
            return { success: false, error: "请先记录收款，再将状态设置为已付款/部分付款" }
        } else if (status === "CANCELLED") {
            // 取消前确保没有任何收款记录（避免与收款台账不一致）
            if (totalPaid > 0) {
                return { success: false, error: "该发票已记录收款，无法直接取消（需先处理收款记录）" }
            }
        }

        const issuedAt =
            status === "PENDING"
                ? existing.issuedAt ?? new Date()
                : status === "DRAFT"
                  ? null
                  : undefined

        const invoice = await prisma.$transaction(async (tx) => {
            const res = await tx.invoice.updateMany({
                where: { id, AND: [invoiceTenantScope(tenantId)] },
                data: {
                    status,
                    ...(typeof issuedAt !== "undefined" ? { issuedAt } : {}),
                },
            })
            if (res.count === 0) {
                throw new Error("发票不存在或无权限")
            }

            const row = await tx.invoice.findFirst({
                where: { id, AND: [invoiceTenantScope(tenantId)] },
            })
            if (!row) {
                throw new Error("发票不存在或无权限")
            }

            return row
        })

        revalidatePath('/admin/finance')
        if (invoice.caseId) revalidatePath(`/cases/${invoice.caseId}`)
        return { success: true as const, data: invoice }
    } catch (error) {
        logger.error("更新发票状态失败", error, { id, status })
        return { success: false as const, error: "更新发票状态失败" }
    }
}

// 获取发票统计
export async function getInvoiceStats() {
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("billing:view")
        const { user, tenantId, viewer } = ctx

        const rate = await enforceRateLimit({ ctx, action: "finance.invoices.stats", limit: 240 })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }

        const andClauses: Prisma.InvoiceWhereInput[] = [invoiceTenantScope(tenantId)]
        if (user.role !== "PARTNER" && user.role !== "ADMIN") {
            andClauses.push({ case: getCaseListAccessWhereOrThrow(viewer, "case:view") })
        }
        const scopeWhere: Prisma.InvoiceWhereInput = { AND: andClauses }

        const [total, pending, paid, overdue] = await Promise.all([
            prisma.invoice.aggregate({ where: scopeWhere, _sum: { totalAmount: true } }),
            prisma.invoice.aggregate({
                where: { ...scopeWhere, status: 'PENDING' },
                _sum: { totalAmount: true },
                _count: true,
            }),
            prisma.invoice.aggregate({
                where: { ...scopeWhere, status: 'PAID' },
                _sum: { totalAmount: true },
                _count: true,
            }),
            prisma.invoice.aggregate({
                where: { ...scopeWhere, status: 'OVERDUE' },
                _sum: { totalAmount: true },
                _count: true,
            }),
        ])

        return {
            success: true as const,
            data: {
                totalAmount: total._sum.totalAmount === null ? 0 : Number(total._sum.totalAmount),
                pendingAmount: pending._sum.totalAmount === null ? 0 : Number(pending._sum.totalAmount),
                pendingCount: pending._count || 0,
                paidAmount: paid._sum.totalAmount === null ? 0 : Number(paid._sum.totalAmount),
                paidCount: paid._count || 0,
                overdueAmount: overdue._sum.totalAmount === null ? 0 : Number(overdue._sum.totalAmount),
                overdueCount: overdue._count || 0,
            },
        }
    } catch (error) {
        logger.error("获取发票统计失败", error)
        return { success: false as const, error: '获取发票统计失败' }
    }
}

// ==============================================================================
// 收款记录 Actions
// ==============================================================================

// 记录收款
export async function recordPayment(data: {
    invoiceId: string
    amount: number
    method: PaymentMethod
    receivedAt: Date
    reference?: string
    note?: string
}): Promise<ActionResponse<{ data: Payment }>> {
    try {
        const parsed = z
            .object({
                invoiceId: UuidSchema,
                amount: PositiveNumber(),
                method: z.nativeEnum(PaymentMethod),
                receivedAt: DateInputSchema,
                reference: OptionalNonEmptyString(200),
                note: OptionalNonEmptyString(2000),
            })
            .strict()
            .safeParse(data)
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        data = parsed.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("billing:edit")
        const rate = await enforceRateLimit({
            ctx,
            action: "finance.payments.record",
            limit: 120,
            extraKey: data.invoiceId,
        })
        if (!rate.allowed) {
            return { success: false, error: rate.error }
        }
        const { user, tenantId, viewer } = ctx

        const invoice = await prisma.invoice.findFirst({
            where: { id: data.invoiceId, AND: [invoiceTenantScope(tenantId)] },
            select: { id: true, caseId: true, totalAmount: true },
        })
        if (!invoice) return { success: false, error: "发票不存在" }

        if (invoice.caseId) {
            await requireCaseAccess(invoice.caseId, viewer, "case:view")
        }

        // 创建收款记录
        const payment = await prisma.payment.create({
            data: {
                tenantId,
                invoiceId: data.invoiceId,
                amount: data.amount,
                method: data.method,
                receivedAt: data.receivedAt,
                reference: data.reference,
                note: data.note,
                recorderId: user.id,
            },
        })

        // 更新发票状态
        const invoiceWithPayments = await prisma.invoice.findFirst({
            where: { id: data.invoiceId, AND: [invoiceTenantScope(tenantId)] },
            include: { payments: true },
        })

        if (invoiceWithPayments) {
            const totalPaid = invoiceWithPayments.payments.reduce((sum, p) => sum + Number(p.amount), 0)

            let newStatus: InvoiceStatus = 'PENDING'
            if (totalPaid >= Number(invoiceWithPayments.totalAmount)) {
                newStatus = 'PAID'
            } else if (totalPaid > 0) {
                newStatus = 'PARTIAL'
            }

            await prisma.invoice.updateMany({
                where: { id: data.invoiceId, AND: [invoiceTenantScope(tenantId)] },
                data: { status: newStatus },
            })
        }

        revalidatePath('/admin/finance')
        if (invoice.caseId) revalidatePath(`/cases/${invoice.caseId}`)
        return { success: true, data: payment }
    } catch (error) {
        logger.error("记录收款失败", error)
        return { success: false, error: '记录收款失败' }
    }
}

// 获取收款记录
export async function getPayments(invoiceId?: string) {
    try {
        const parsed = UuidSchema.optional().safeParse(invoiceId)
        if (!parsed.success) {
            return { success: false as const, error: "输入校验失败", data: [] }
        }
        invoiceId = parsed.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("billing:view")
        const { user, tenantId, viewer } = ctx

        const rate = await enforceRateLimit({
            ctx,
            action: "finance.payments.list",
            limit: 600,
            extraKey: invoiceId ?? "all",
        })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [] }
        }

        let where: Prisma.PaymentWhereInput = {}

        if (invoiceId) {
            const invoice = await prisma.invoice.findFirst({
                where: { id: invoiceId, AND: [invoiceTenantScope(tenantId)] },  
                select: { caseId: true },
            })
            if (!invoice) {
                return { success: false as const, error: "发票不存在", data: [] }
            }
            if (invoice.caseId) {
                await requireCaseAccess(invoice.caseId, viewer, "case:view")    
            }
            where = { invoiceId, tenantId }
        } else if (user.role !== "PARTNER" && user.role !== "ADMIN") {
            where = {
                tenantId,
                invoice: {
                    AND: [invoiceTenantScope(tenantId), { case: getCaseListAccessWhereOrThrow(viewer, "case:view") }],
                },
            }
        } else {
            where = { tenantId, invoice: invoiceTenantScope(tenantId) }
        }

        const payments = await prisma.payment.findMany({
            where,
            include: {
                invoice: {
                    select: {
                        id: true,
                        invoiceNo: true,
                        totalAmount: true,
                        case: { select: { id: true, title: true, caseCode: true } },
                        client: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: { receivedAt: 'desc' },
            take: 200,
        })

        return { success: true as const, data: payments }
    } catch (error) {
        logger.error("获取收款记录失败", error, { invoiceId })
        return { success: false as const, error: "获取收款记录失败", data: [] }
    }
}

// ==============================================================================
// 费用记录 Actions
// ==============================================================================

// 获取费用列表
export async function getExpenses(options?: {
    caseId?: string
    userId?: string
    status?: ExpenseStatus
}) {
    try {
        const parsed = z
            .object({
                caseId: UuidSchema.optional(),
                userId: UuidSchema.optional(),
                status: z.nativeEnum(ExpenseStatus).optional(),
            })
            .strict()
            .optional()
            .safeParse(options)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败", data: [] as ExpenseListItem[] }
        }
        options = parsed.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("billing:view")
        const { user, tenantId, viewer } = ctx

        const rate = await enforceRateLimit({ ctx, action: "finance.expenses.list", limit: 600 })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [] as ExpenseListItem[] }
        }

        const where: Prisma.ExpenseWhereInput = { tenantId }

        if (options?.caseId) {
            await requireCaseAccess(options.caseId, viewer, "case:view")
            where.caseId = options.caseId
        }

        if (options?.userId) {
            if (options.userId !== user.id && user.role !== "PARTNER" && user.role !== "ADMIN") {
                requireTenantPermission(ctx, "user:view_all")
            }
            const ok = await ensureUsersInTenant({ tenantId, userIds: [options.userId] })
            if (!ok) {
                return { success: false as const, error: "用户不存在或不在当前租户", data: [] as ExpenseListItem[] }
            }
            where.userId = options.userId
        } else if (!options?.caseId && user.role !== "PARTNER" && user.role !== "ADMIN") {
            // 非管理员默认只看自己的费用
            where.userId = user.id
        }

        if (options?.status) where.status = options.status

        const expenses = await prisma.expense.findMany({
            where,
            include: {
                case: { select: { id: true, title: true } },
                user: { select: { id: true, name: true } },
            },
            orderBy: { expenseDate: 'desc' },
            take: 200,
        })

        return { success: true as const, data: expenses }
    } catch (error) {
        logger.error("获取费用列表失败", error)
        return { success: false as const, error: '获取费用列表失败', data: [] as ExpenseListItem[] }
    }
}

// 创建费用记录
export async function createExpense(data: {
    caseId?: string
    category: string
    amount: number
    description?: string
    expenseDate: Date
}): Promise<ActionResponse<{ data: Expense }>> {
    try {
        const parsed = z
            .object({
                caseId: UuidSchema.optional(),
                category: z.string().trim().min(1, "费用类别不能为空").max(200),
                amount: PositiveNumber(),
                description: OptionalNonEmptyString(2000),
                expenseDate: DateInputSchema,
            })
            .strict()
            .safeParse(data)
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        data = parsed.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("billing:create")
        const rate = await enforceRateLimit({ ctx, action: "finance.expenses.create", limit: 120 })
        if (!rate.allowed) {
            return { success: false, error: rate.error }
        }
        const { user, tenantId, viewer } = ctx

        const caseId = data.caseId || null
        if (caseId) {
            await requireCaseAccess(caseId, viewer, "case:view")
        }

        const expense = await prisma.expense.create({
            data: {
                tenantId,
                caseId,
                userId: user.id,
                category: data.category,
                amount: data.amount,
                description: data.description,
                expenseDate: data.expenseDate,
                status: 'PENDING',
            },
        })

        revalidatePath('/admin/finance')
        if (expense.caseId) revalidatePath(`/cases/${expense.caseId}`)
        return { success: true, data: expense }
    } catch (error) {
        logger.error("创建费用记录失败", error)
        return { success: false, error: '创建费用记录失败' }
    }
}
