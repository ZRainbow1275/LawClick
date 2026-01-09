"use server"

import { prisma } from "@/lib/prisma"
import { getActiveTenantContextWithPermissionOrThrow, getCaseListAccessWhereOrNull, hasTenantPermission } from "@/lib/server-auth"
import { logger } from "@/lib/logger"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { checkRateLimit } from "@/lib/rate-limit"
import { z } from "zod"
import type { ActionResponse } from "@/lib/action-response"

export type GlobalSearchItemType = "CASE" | "TASK" | "DOCUMENT" | "CONTACT"

export type GlobalSearchItem = {
    type: GlobalSearchItemType
    id: string
    title: string
    subtitle: string
    url: string
}

export type GlobalSearchGroup = {
    type: GlobalSearchItemType
    label: string
    items: GlobalSearchItem[]
}

export async function globalSearch(
    input: string,
    options?: { takePerType?: number }
): Promise<
    ActionResponse<
        { data: { query: string; groups: GlobalSearchGroup[]; total: number } },
        { data: { query: string; groups: GlobalSearchGroup[]; total: number } }
    >
> {
    try {
        const parsed = z
            .object({
                input: z.string(),
                options: z.object({ takePerType: z.number().int().min(1).max(20).optional() }).strict().optional(),
            })
            .strict()
            .safeParse({ input, options })
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败", data: { query: "", groups: [], total: 0 } }
        }
        input = parsed.data.input
        options = parsed.data.options

        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:view")
        const { user, tenantId, viewer } = ctx

        const query = (input || "").trim()
        if (query.length < 2) {
            return { success: true, data: { query, groups: [], total: 0 } }
        }

        const rate = await checkRateLimit({
            key: `search:global:tenant:${tenantId}:user:${user.id}`,
            limit: 240,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            logger.warn("globalSearch rate limited", { tenantId, userId: user.id })
            return {
                success: false,
                error: `请求过于频繁，请在 ${rate.retryAfterSeconds} 秒后重试`,
                data: { query, groups: [], total: 0 },
            }
        }

        const takePerType = Math.max(1, Math.min(options?.takePerType ?? 6, 20))

        const canViewTasks = hasTenantPermission(ctx, "task:view")
        const canViewDocuments = hasTenantPermission(ctx, "document:view")
        const canViewContacts = hasTenantPermission(ctx, "crm:view")

        const canViewCases = hasTenantPermission(ctx, "case:view")
        const caseAccessWhere = canViewCases ? getCaseListAccessWhereOrNull(viewer, "case:view") : null

        const casePromise = canViewCases
            ? prisma.case.findMany({
                where: {
                    AND: [
                        caseAccessWhere ?? {},
                        {
                            OR: [
                                { caseCode: { contains: query, mode: "insensitive" } },
                                { title: { contains: query, mode: "insensitive" } },
                                { description: { contains: query, mode: "insensitive" } },
                                { client: { name: { contains: query, mode: "insensitive" } } },
                            ],
                        },
                    ],
                },
                take: takePerType,
                orderBy: [{ updatedAt: "desc" }],
                select: {
                    id: true,
                    caseCode: true,
                    title: true,
                    status: true,
                    client: { select: { name: true } },
                    updatedAt: true,
                },
            })
            : Promise.resolve([])

        const taskPromise = canViewTasks
            ? prisma.task.findMany({
                where: {
                    AND: [
                        { tenantId },
                        {
                            OR: [
                                { title: { contains: query, mode: "insensitive" } },
                                { description: { contains: query, mode: "insensitive" } },
                            ],
                        },
                        canViewCases && caseAccessWhere ? { case: caseAccessWhere } : { assigneeId: user.id },
                    ],
                },
                take: takePerType,
                orderBy: [{ updatedAt: "desc" }],
                select: {
                    id: true,
                    title: true,
                    description: true,
                    caseId: true,
                    case: { select: { id: true, title: true, caseCode: true } },
                },
            })
            : Promise.resolve([])

        const documentPromise = canViewDocuments
            ? prisma.document.findMany({
                where: {
                    AND: [
                        {
                            OR: [
                                { title: { contains: query, mode: "insensitive" } },
                                { notes: { contains: query, mode: "insensitive" } },
                                { tags: { has: query } },
                            ],
                        },
                        canViewCases && caseAccessWhere ? { case: caseAccessWhere } : { uploaderId: user.id },
                    ],
                },
                take: takePerType,
                orderBy: [{ updatedAt: "desc" }],
                select: {
                    id: true,
                    title: true,
                    notes: true,
                    caseId: true,
                    case: { select: { id: true, title: true, caseCode: true } },
                },
            })
            : Promise.resolve([])

        const contactPromise = canViewContacts
            ? prisma.contact.findMany({
                where: {
                    tenantId,
                    deletedAt: null,
                    OR: [
                        { name: { contains: query, mode: "insensitive" } },
                        { email: { contains: query, mode: "insensitive" } },
                        { phone: { contains: query, mode: "insensitive" } },
                        { industry: { contains: query, mode: "insensitive" } },
                    ],
                },
                take: takePerType,
                orderBy: [{ updatedAt: "desc" }],
                select: {
                    id: true,
                    name: true,
                    type: true,
                    email: true,
                    phone: true,
                    industry: true,
                },
            })
            : Promise.resolve([])

        const [cases, tasks, documents, contacts] = await Promise.all([
            casePromise,
            taskPromise,
            documentPromise,
            contactPromise,
        ])

        const groups: GlobalSearchGroup[] = []

        if (canViewCases && cases.length > 0) {
            groups.push({
                type: "CASE",
                label: "案件",
                items: cases.map((c) => ({
                    type: "CASE",
                    id: c.id,
                    title: c.title,
                    subtitle: `${c.caseCode} · ${c.client?.name || "客户"} · ${c.status}`,
                    url: `/cases/${c.id}`,
                })),
            })
        }

        if (canViewTasks && tasks.length > 0) {
            groups.push({
                type: "TASK",
                label: "任务",
                items: tasks.map((t) => ({
                    type: "TASK",
                    id: t.id,
                    title: t.title,
                    subtitle: t.case
                        ? `任务 · ${t.case.caseCode} · ${t.case.title}`
                        : "任务",
                    url: t.caseId ? `/cases/${t.caseId}?tab=tasks` : "/tasks",
                })),
            })
        }

        if (canViewDocuments && documents.length > 0) {
            groups.push({
                type: "DOCUMENT",
                label: "文档",
                items: documents.map((d) => ({
                    type: "DOCUMENT",
                    id: d.id,
                    title: d.title,
                    subtitle: d.case ? `文档 · ${d.case.caseCode} · ${d.case.title}` : "文档",
                    url: `/documents/${d.id}`,
                })),
            })
        }

        if (canViewContacts && contacts.length > 0) {
            groups.push({
                type: "CONTACT",
                label: "客户/联系人",
                items: contacts.map((c) => ({
                    type: "CONTACT",
                    id: c.id,
                    title: c.name,
                    subtitle: [
                        c.type === "COMPANY" ? "公司" : "个人",
                        c.industry || "",
                        c.email || "",
                        c.phone || "",
                    ]
                        .filter(Boolean)
                        .join(" · "),
                    url: `/crm/customers/${c.id}`,
                })),
            })
        }

        const total = groups.reduce((sum, g) => sum + g.items.length, 0)
        return { success: true, data: { query, groups, total } }
    } catch (error) {
        logger.error("globalSearch failed", error)
        return {
            success: false,
            error: getPublicActionErrorMessage(error, "全局搜索失败，请稍后重试"),
            data: { query: (input || "").trim(), groups: [], total: 0 },
        }
    }
}
