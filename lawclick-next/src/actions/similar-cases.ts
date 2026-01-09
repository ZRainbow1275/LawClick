"use server"

import { z } from "zod"
import type { CaseStatus, ServiceType } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { checkRateLimit } from "@/lib/rate-limit"
import {
    getActiveTenantContextOrThrow,
    getCaseListAccessWhereOrThrow,
    requireCaseAccess,
    requireTenantPermission,
} from "@/lib/server-auth"

const InputSchema = z
    .object({
        caseId: z.string().uuid(),
        take: z.number().int().min(1).max(20).optional(),
    })
    .strict()

export type SimilarCaseItem = {
    id: string
    caseCode: string
    title: string
    status: CaseStatus
    serviceType: ServiceType
    updatedAt: string
    score: number
    match: {
        sameClient: boolean
        sameTemplate: boolean
        sharedPartyCount: number
        sharedKeywordCount: number
    }
}

function normalizeText(value: string) {
    return value.trim().toLowerCase()
}

function tokenize(text: string) {
    const tokens = new Set<string>()
    const value = normalizeText(text)

    const wordMatches = value.matchAll(/[a-z0-9]{2,}/g)
    for (const match of wordMatches) {
        tokens.add(match[0])
        if (tokens.size >= 120) return tokens
    }

    const cnMatches = value.matchAll(/[\u4e00-\u9fff]{2,}/g)
    for (const match of cnMatches) {
        const chunk = match[0]
        tokens.add(chunk)
        const maxBigrams = Math.min(24, Math.max(0, chunk.length - 1))
        for (let i = 0; i < maxBigrams; i++) {
            tokens.add(chunk.slice(i, i + 2))
            if (tokens.size >= 120) return tokens
        }
    }

    return tokens
}

function countIntersection(a: Set<string>, b: Set<string>) {
    if (a.size === 0 || b.size === 0) return 0
    const [small, large] = a.size <= b.size ? [a, b] : [b, a]
    let count = 0
    for (const token of small) {
        if (large.has(token)) count++
    }
    return count
}

function normalizePartyName(value: string | null | undefined) {
    const name = (value || "").trim()
    if (!name) return null
    return name.toLowerCase()
}

export async function getSimilarCases(input: unknown) {
    try {
        const parsed = InputSchema.safeParse(input)
        if (!parsed.success) {
            return {
                success: false as const,
                error: parsed.error.issues[0]?.message || "输入校验失败",
                data: [] as SimilarCaseItem[],
            }
        }

        const { caseId } = parsed.data
        const take = parsed.data.take ?? 8

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "case:view")
        const { tenantId, user: viewer } = ctx

        const rate = await checkRateLimit({
            key: `cases:similar:${tenantId}:${viewer.id}:${caseId}`,
            limit: 60,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return {
                success: false as const,
                error: "请求过于频繁，请稍后重试",
                data: [] as SimilarCaseItem[],
            }
        }

        await requireCaseAccess(caseId, viewer, "case:view")

        const current = await prisma.case.findFirst({
            where: { id: caseId, tenantId, deletedAt: null },
            select: {
                id: true,
                title: true,
                description: true,
                serviceType: true,
                clientId: true,
                templateId: true,
                parties: { select: { name: true } },
            },
        })
        if (!current) {
            return {
                success: false as const,
                error: "案件不存在或无访问权限",
                data: [] as SimilarCaseItem[],
            }
        }

        const accessWhere = getCaseListAccessWhereOrThrow(viewer, "case:view")
        const candidates = await prisma.case.findMany({
            where: {
                tenantId,
                deletedAt: null,
                id: { not: current.id },
                serviceType: current.serviceType,
                AND: [accessWhere],
            },
            take: Math.min(200, Math.max(50, take * 25)),
            orderBy: { updatedAt: "desc" },
            select: {
                id: true,
                caseCode: true,
                title: true,
                status: true,
                serviceType: true,
                updatedAt: true,
                description: true,
                clientId: true,
                templateId: true,
                parties: { select: { name: true } },
            },
        })

        const currentKeywords = tokenize(`${current.title} ${current.description || ""}`)
        const currentParties = new Set(
            current.parties
                .map((p) => normalizePartyName(p.name))
                .filter((p): p is string => Boolean(p))
        )

        const scored = candidates
            .map((c) => {
                const candidateKeywords = tokenize(`${c.title} ${c.description || ""}`)
                const candidateParties = new Set(
                    c.parties
                        .map((p) => normalizePartyName(p.name))
                        .filter((p): p is string => Boolean(p))
                )

                const sameClient = c.clientId === current.clientId
                const sameTemplate = Boolean(
                    c.templateId && current.templateId && c.templateId === current.templateId
                )

                const sharedPartyCount = countIntersection(currentParties, candidateParties)
                const sharedKeywordCount = countIntersection(currentKeywords, candidateKeywords)

                let score = 0
                if (sameClient) score += 5
                if (sameTemplate) score += 2
                score += Math.min(6, sharedPartyCount * 2)
                score += Math.min(8, sharedKeywordCount)

                return {
                    id: c.id,
                    caseCode: c.caseCode,
                    title: c.title,
                    status: c.status,
                    serviceType: c.serviceType,
                    updatedAt: c.updatedAt.toISOString(),
                    score,
                    match: { sameClient, sameTemplate, sharedPartyCount, sharedKeywordCount },
                } satisfies SimilarCaseItem
            })
            .filter((c) => c.score > 0)
            .sort((a, b) => (b.score !== a.score ? b.score - a.score : b.updatedAt.localeCompare(a.updatedAt)))
            .slice(0, take)

        return { success: true as const, data: scored }
    } catch (error) {
        logger.error("获取相似案件失败", error)
        return { success: false as const, error: "获取相似案件失败", data: [] as SimilarCaseItem[] }
    }
}

