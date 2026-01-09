"use server"

import { z } from "zod"
import { EventType, TenantMembershipRole, type Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { checkRateLimit } from "@/lib/rate-limit"
import { buildCaseVisibilityWhere } from "@/lib/case-visibility"
import {
    getActiveTenantContextWithPermissionOrThrow,
    hasTenantPermission,
    hasTenantRole,
} from "@/lib/server-auth"

const DashboardRecentDocumentsInputSchema = z
    .object({
        take: z.coerce.number().int().min(1).max(20).optional(),
    })
    .strict()
    .optional()

export type DashboardRecentDocument = {
    id: string
    title: string
    category: string | null
    fileType: string | null
    updatedAt: string
    case: { id: string; title: string; caseCode: string | null }
}

export async function getDashboardRecentDocuments(input?: { take?: number }) {  
    try {
        const parsed = DashboardRecentDocumentsInputSchema.safeParse(input)
        if (!parsed.success) {
            return {
                success: false as const,
                error: parsed.error.issues[0]?.message || "输入校验失败",
                data: [] as DashboardRecentDocument[],
            }
        }
        input = parsed.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("document:view")
        const { tenantId, user } = ctx

        const rate = await checkRateLimit({
            key: `dashboard:recent_documents:${tenantId}:${user.id}`,
            limit: 60,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            logger.warn("dashboard recent documents rate limited", { tenantId, userId: user.id })
            return {
                success: false as const,
                error: "请求过于频繁，请稍后重试",
                data: [] as DashboardRecentDocument[],
            }
        }

        const take = Math.max(1, Math.min(20, input?.take ?? 8))

        const where: Prisma.DocumentWhereInput = {
            case: buildCaseVisibilityWhere({
                userId: user.id,
                role: user.role,
                tenantId,
            }),
        }

        type RecentDocumentRow = Prisma.DocumentGetPayload<{
            select: {
                id: true
                title: true
                category: true
                fileType: true
                updatedAt: true
                case: { select: { id: true; title: true; caseCode: true } }
            }
        }>

        const rows: RecentDocumentRow[] = await prisma.document.findMany({
            where,
            take,
            orderBy: { updatedAt: "desc" },
            select: {
                id: true,
                title: true,
                category: true,
                fileType: true,
                updatedAt: true,
                case: { select: { id: true, title: true, caseCode: true } },
            },
        })

        const data: DashboardRecentDocument[] = rows.map((r) => ({
            id: r.id,
            title: r.title,
            category: r.category,
            fileType: r.fileType,
            updatedAt: r.updatedAt.toISOString(),
            case: r.case,
        }))

        return { success: true as const, data }
    } catch (error) {
        logger.error("获取仪表盘最近文档失败", error)
        return {
            success: false as const,
            error: "获取仪表盘最近文档失败",
            data: [] as DashboardRecentDocument[],
        }
    }
}

const DashboardUpcomingEventsInputSchema = z
    .object({
        take: z.coerce.number().int().min(1).max(20).optional(),
    })
    .strict()
    .optional()

export type DashboardUpcomingEvent = {
    id: string
    title: string
    type: EventType
    startTime: string
    endTime: string
    case: { id: string; title: string; caseCode: string | null } | null
}

export async function getDashboardUpcomingEvents(input?: { take?: number }) {
    try {
        const parsed = DashboardUpcomingEventsInputSchema.safeParse(input)
        if (!parsed.success) {
            return {
                success: false as const,
                error: parsed.error.issues[0]?.message || "输入校验失败",
                data: [] as DashboardUpcomingEvent[],
            }
        }
        input = parsed.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:view")
        const { tenantId, user } = ctx

        const rate = await checkRateLimit({
            key: `dashboard:upcoming_events:${tenantId}:${user.id}`,
            limit: 60,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            logger.warn("dashboard upcoming events rate limited", {
                tenantId,
                userId: user.id,
            })
            return {
                success: false as const,
                error: "请求过于频繁，请稍后重试",
                data: [] as DashboardUpcomingEvent[],
            }
        }

        const take = Math.max(1, Math.min(20, input?.take ?? 5))
        const now = new Date()

        const canViewCases = hasTenantPermission(ctx, "case:view")
        const caseAccessWhere = canViewCases
            ? buildCaseVisibilityWhere({ userId: user.id, role: user.role, tenantId })
            : null

        if (!canViewCases || !caseAccessWhere) {
            const rows = await prisma.event.findMany({
                where: {
                    tenantId,
                    status: "SCHEDULED",
                    startTime: { gte: now },
                    OR: [
                        { creatorId: user.id },
                        { participants: { some: { userId: user.id } } },
                    ],
                },
                take,
                orderBy: { startTime: "asc" },
                select: {
                    id: true,
                    title: true,
                    type: true,
                    startTime: true,
                    endTime: true,
                },
            })

            const data: DashboardUpcomingEvent[] = rows.map((e) => ({
                id: e.id,
                title: e.title,
                type: e.type,
                startTime: e.startTime.toISOString(),
                endTime: e.endTime.toISOString(),
                case: null,
            }))

            return { success: true as const, data }
        }

        const rows = await prisma.event.findMany({
            where: {
                tenantId,
                status: "SCHEDULED",
                startTime: { gte: now },
                OR: [
                    { creatorId: user.id },
                    { participants: { some: { userId: user.id } } },
                    { case: caseAccessWhere },
                ],
            },
            take,
            orderBy: { startTime: "asc" },
            select: {
                id: true,
                title: true,
                type: true,
                startTime: true,
                endTime: true,
                caseId: true,
                case: { select: { id: true, title: true, caseCode: true } },
            },
        })

        const caseIds = Array.from(new Set(rows.map((e) => e.caseId).filter(Boolean))) as string[]
        const accessibleCaseIds = new Set<string>()
        if (caseIds.length) {
            const accessible = await prisma.case.findMany({
                where: { AND: [{ id: { in: caseIds } }, caseAccessWhere] },     
                select: { id: true },
                take: caseIds.length,
            })
            for (const c of accessible) accessibleCaseIds.add(c.id)
        }

        const data: DashboardUpcomingEvent[] = rows.map((e) => ({
            id: e.id,
            title: e.title,
            type: e.type,
            startTime: e.startTime.toISOString(),
            endTime: e.endTime.toISOString(),
            case: e.caseId && accessibleCaseIds.has(e.caseId) ? e.case : null,
        }))

        return { success: true as const, data }
    } catch (error) {
        logger.error("获取仪表盘近期日程失败", error)
        return {
            success: false as const,
            error: "获取仪表盘近期日程失败",
            data: [] as DashboardUpcomingEvent[],
        }
    }
}

export type FirmOverviewSnapshot = {
    scope: "TENANT" | "USER"
    generatedAt: string
    tenant: { id: string; name: string; firmName: string | null }
    cases: null | { total: number; active: number; closed: number; archived: number }
    tasks: null | { open: number; overdue: number; due7d: number }
    documents: null | { total: number; updated7d: number }
    crm: null | { customers: number }
    approvals: null | { pending: number }
    finance: null | { invoicesPending: number; invoicesOverdue: number }
}

export async function getFirmOverviewSnapshot() {
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:view")
        const { tenantId, user, tenant, membership } = ctx

        const rate = await checkRateLimit({
            key: `dashboard:firm_overview:${tenantId}:${user.id}`,
            limit: 30,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            logger.warn("dashboard firm overview rate limited", { tenantId, userId: user.id })
            return { success: false as const, error: "请求过于频繁，请稍后重试" }
        }

        const isTenantAdmin = hasTenantRole(membership.role, TenantMembershipRole.ADMIN)
        const scope: FirmOverviewSnapshot["scope"] = isTenantAdmin ? "TENANT" : "USER"

        const now = new Date()
        const next7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        const recent7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

        const canViewCases = hasTenantPermission(ctx, "case:view")
        const canViewTasks = hasTenantPermission(ctx, "task:view")
        const canViewDocuments = hasTenantPermission(ctx, "document:view")
        const canViewCrm = hasTenantPermission(ctx, "crm:view")

        const canAccessAdmin = isTenantAdmin && hasTenantPermission(ctx, "admin:access")
        const canViewApprovals = canAccessAdmin && hasTenantPermission(ctx, "approval:view_all")
        const canViewFinance = canAccessAdmin && hasTenantPermission(ctx, "billing:view")

        const caseWhere: Prisma.CaseWhereInput | null = canViewCases
            ? scope === "TENANT"
                ? { tenantId, deletedAt: null }
                : buildCaseVisibilityWhere({ tenantId, userId: user.id, role: user.role })
            : null

        const tasksWhereBase: Prisma.TaskWhereInput | null = canViewTasks
            ? {
                  tenantId,
                  status: { not: "DONE" },
                  ...(scope === "USER" ? { assigneeId: user.id } : {}),
                  AND: [
                      { OR: [{ caseId: null }, { case: { deletedAt: null } }] },
                      { OR: [{ projectId: null }, { project: { deletedAt: null } }] },
                  ],
              }
            : null

        const approvalsWhere: Prisma.ApprovalRequestWhereInput | null = canViewApprovals
            ? { tenantId, status: "PENDING" }
            : null

        const invoicesPendingWhere: Prisma.InvoiceWhereInput | null = canViewFinance
            ? { tenantId, status: "PENDING" }
            : null

        const invoicesOverdueWhere: Prisma.InvoiceWhereInput | null = canViewFinance
            ? { tenantId, status: "OVERDUE" }
            : null

        const [
            caseStatusCounts,
            tasksOpen,
            tasksOverdue,
            tasksDue7d,
            documentsTotal,
            documentsUpdated7d,
            customersTotal,
            approvalsPending,
            invoicesPending,
            invoicesOverdue,
        ] = await Promise.all([
            caseWhere
                ? prisma.case.groupBy({
                      by: ["status"],
                      where: caseWhere,
                      _count: { _all: true },
                  })
                : Promise.resolve(null),
            tasksWhereBase ? prisma.task.count({ where: tasksWhereBase }) : Promise.resolve(null),
            tasksWhereBase ? prisma.task.count({ where: { ...tasksWhereBase, dueDate: { lt: now } } }) : Promise.resolve(null),
            tasksWhereBase
                ? prisma.task.count({ where: { ...tasksWhereBase, dueDate: { gte: now, lt: next7d } } })
                : Promise.resolve(null),
            canViewDocuments && caseWhere ? prisma.document.count({ where: { case: caseWhere } }) : Promise.resolve(null),
            canViewDocuments && caseWhere
                ? prisma.document.count({ where: { case: caseWhere, updatedAt: { gte: recent7d } } })
                : Promise.resolve(null),
            canViewCrm ? prisma.contact.count({ where: { tenantId, deletedAt: null } }) : Promise.resolve(null),
            approvalsWhere ? prisma.approvalRequest.count({ where: approvalsWhere }) : Promise.resolve(null),
            invoicesPendingWhere ? prisma.invoice.count({ where: invoicesPendingWhere }) : Promise.resolve(null),
            invoicesOverdueWhere ? prisma.invoice.count({ where: invoicesOverdueWhere }) : Promise.resolve(null),
        ])

        const cases: FirmOverviewSnapshot["cases"] = caseStatusCounts
            ? (() => {
                  const byStatus = new Map<string, number>()
                  for (const row of caseStatusCounts) {
                      byStatus.set(row.status, row._count._all)
                  }
                  const total = Array.from(byStatus.values()).reduce((sum, v) => sum + v, 0)
                  const archived = byStatus.get("ARCHIVED") || 0
                  const closed = byStatus.get("CLOSED") || 0
                  const active = total - archived - closed
                  return { total, active: Math.max(0, active), closed, archived }
              })()
            : null

        const tasks: FirmOverviewSnapshot["tasks"] =
            tasksWhereBase && tasksOpen !== null && tasksOverdue !== null && tasksDue7d !== null
                ? { open: tasksOpen, overdue: tasksOverdue, due7d: tasksDue7d }
                : null

        const documents: FirmOverviewSnapshot["documents"] =
            documentsTotal !== null && documentsUpdated7d !== null
                ? { total: documentsTotal, updated7d: documentsUpdated7d }
                : null

        const crm: FirmOverviewSnapshot["crm"] = customersTotal !== null ? { customers: customersTotal } : null

        const approvals: FirmOverviewSnapshot["approvals"] = approvalsPending !== null ? { pending: approvalsPending } : null

        const finance: FirmOverviewSnapshot["finance"] =
            invoicesPending !== null && invoicesOverdue !== null ? { invoicesPending, invoicesOverdue } : null

        const snapshot: FirmOverviewSnapshot = {
            scope,
            generatedAt: now.toISOString(),
            tenant: {
                id: tenant.id,
                name: tenant.name,
                firmName: tenant.firm?.name || null,
            },
            cases,
            tasks,
            documents,
            crm,
            approvals,
            finance,
        }

        return { success: true as const, data: snapshot }
    } catch (error) {
        logger.error("获取工作区概览失败", error)
        return { success: false as const, error: "获取工作区概览失败" }
    }
}
