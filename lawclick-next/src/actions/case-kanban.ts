"use server"

import { prisma } from "@/lib/prisma"
import { AuthError, PermissionError, getActiveTenantContextOrThrow, getCaseListAccessWhereOrThrow, requireTenantPermission } from "@/lib/server-auth"
import { CaseStatus, type Prisma } from "@prisma/client"
import { z } from "zod"

import { OptionalNonEmptyString } from "@/lib/zod"
import { logger } from "@/lib/logger"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { checkRateLimit } from "@/lib/rate-limit"

const GetCaseKanbanCardsOptionsSchema = z
    .object({
        query: OptionalNonEmptyString(200),
        status: z.array(z.nativeEnum(CaseStatus)).min(1).optional(),
        take: z.number().int().min(1).max(500).optional(),
    })
    .strict()
    .optional()

export type CaseKanbanCardMember = {
    id: string
    name: string | null
    email: string
    avatarUrl: string | null
}

export type CaseKanbanCard = {
    id: string
    title: string
    status: CaseStatus
    updatedAt: Date
    caseCode: string | null
    clientName: string | null
    members: CaseKanbanCardMember[]
    openTasksCount: number
    uploadedDocumentsCount: number
    nextEventStartTime: Date | null
}

export async function getCaseKanbanCards(options?: unknown): Promise<
    | { success: true; data: CaseKanbanCard[] }
    | { success: false; error: string; data: CaseKanbanCard[] }
> {
    try {
        const parsed = GetCaseKanbanCardsOptionsSchema.safeParse(options)
        if (!parsed.success) {
            logger.warn("getCaseKanbanCards 输入校验失败", { issues: parsed.error.flatten() })
            return { success: false, error: "输入校验失败", data: [] }
        }

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:view")
        const { user, tenantId } = ctx

        const request = parsed.data
        const queryKey = (request?.query || "").trim().toLowerCase().slice(0, 128)
        const statusKey = request?.status?.length ? request.status.join(",") : "all"
        const take = request?.take ?? 200

        const rate = await checkRateLimit({
            key: `case:kanban_cards:tenant:${tenantId}:user:${user.id}:status:${statusKey}:q:${queryKey}:take:${take}`,
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return { success: false, error: `请求过于频繁，请在 ${rate.retryAfterSeconds} 秒后重试`, data: [] }
        }

        const accessWhere = getCaseListAccessWhereOrThrow(user, "case:view")

        const filters: Prisma.CaseWhereInput[] = [accessWhere]

        if (request?.query) {
            filters.push({
                OR: [
                    { title: { contains: request.query } },
                    { caseCode: { contains: request.query } },
                    { client: { name: { contains: request.query } } },
                ],
            })
        }

        if (request?.status?.length) {
            filters.push({ status: { in: request.status } })
        }

        const cases = await prisma.case.findMany({
            where: { AND: filters },
            orderBy: { updatedAt: "desc" },
            take,
            select: {
                id: true,
                title: true,
                status: true,
                updatedAt: true,
                caseCode: true,
                client: { select: { name: true } },
                members: {
                    orderBy: { joinedAt: "asc" },
                    take: 8,
                    select: {
                        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
                    },
                },
            },
        })

        const caseIds = cases.map((c) => c.id)

        const [openTaskAgg, docAgg, nextEvents] = await Promise.all([
            caseIds.length
                ? prisma.task.groupBy({
                      by: ["caseId"],
                      where: { tenantId, caseId: { in: caseIds }, status: { not: "DONE" } },
                      _count: { _all: true },
                  })
                : Promise.resolve([]),
            caseIds.length
                ? prisma.document.groupBy({
                      by: ["caseId"],
                      where: { caseId: { in: caseIds }, fileUrl: { not: null }, case: { tenantId } },
                      _count: { _all: true },
                  })
                : Promise.resolve([]),
            caseIds.length
                ? prisma.event.findMany({
                      where: {
                          tenantId,
                          caseId: { in: caseIds },
                          status: "SCHEDULED",
                          startTime: { gte: new Date() },
                      },
                      orderBy: { startTime: "asc" },
                      distinct: ["caseId"],
                      take: caseIds.length,
                      select: { caseId: true, startTime: true },
                  })
                : Promise.resolve([]),
        ])

        const openTasksByCaseId = new Map(openTaskAgg.map((row) => [row.caseId, row._count?._all ?? 0]))
        const uploadedDocsByCaseId = new Map(docAgg.map((row) => [row.caseId, row._count?._all ?? 0]))
        const nextEventByCaseId = new Map(nextEvents.map((e) => [e.caseId as string, e.startTime]))

        const cards = cases.map((c): CaseKanbanCard => ({
            id: c.id,
            title: c.title,
            status: c.status,
            updatedAt: c.updatedAt,
            caseCode: c.caseCode,
            clientName: c.client?.name ?? null,
            members: c.members.map((m) => ({
                id: m.user.id,
                name: m.user.name,
                email: m.user.email,
                avatarUrl: m.user.avatarUrl,
            })),
            openTasksCount: openTasksByCaseId.get(c.id) ?? 0,
            uploadedDocumentsCount: uploadedDocsByCaseId.get(c.id) ?? 0,
            nextEventStartTime: nextEventByCaseId.get(c.id) ?? null,
        }))

        return { success: true, data: cards }
    } catch (error) {
        if (error instanceof AuthError) {
            return { success: false, error: "请先登录", data: [] }
        }
        if (error instanceof PermissionError) {
            return { success: false, error: getPublicActionErrorMessage(error, "权限不足"), data: [] }
        }
        logger.error("getCaseKanbanCards 失败", error)
        return { success: false, error: "获取案件看板失败", data: [] }
    }
}
