import "server-only"

import { revalidatePath } from "next/cache"

import type { Prisma } from "@prisma/client"
import { z } from "zod"

import { enforceActionRateLimit } from "@/lib/action-rate-limit"
import { buildCaseVisibilityWhere } from "@/lib/case-visibility"
import { logger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { getStorageProvider } from "@/lib/s3"
import { getActiveTenantContextOrThrow, requireCaseAccess, requireTenantPermission } from "@/lib/server-auth"
import { DateInputSchema, OptionalNonEmptyString, UuidSchema } from "@/lib/zod"

const GetDocumentsOptionsSchema = z
    .object({
        caseId: UuidSchema.optional(),
        category: OptionalNonEmptyString(64),
        query: OptionalNonEmptyString(200),
        onlyFavorites: z.boolean().optional(),
        take: z.coerce.number().int().min(1).max(200).optional(),
        cursor: z
            .object({ updatedAt: DateInputSchema, id: UuidSchema })
            .strict()
            .nullable()
            .optional(),
    })
    .strict()
    .optional()

const UpdateDocumentInputSchema = z
    .object({
        title: OptionalNonEmptyString(200),
        category: OptionalNonEmptyString(64),
        notes: OptionalNonEmptyString(20_000),
        tags: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
        isConfidential: z.boolean().optional(),
    })
    .strict()
    .refine((v) => Object.values(v).some((value) => value !== undefined), { message: "没有需要更新的字段" })

const DocumentTagSchema = z.string().trim().min(1).max(64)

export async function getDocumentsImpl(options?: {
    caseId?: string
    category?: string
    query?: string
    onlyFavorites?: boolean
    take?: number
    cursor?: { updatedAt: string | Date; id: string } | null
}) {
    type DocumentListItem = Prisma.DocumentGetPayload<{
        include: {
            case: { select: { id: true; title: true; caseCode: true } }
            uploader: { select: { id: true; name: true } }
        }
    }>

    try {
        const parsed = GetDocumentsOptionsSchema.safeParse(options)
        if (!parsed.success) {
            return {
                success: false as const,
                error: parsed.error.issues[0]?.message || "输入校验失败",
                data: [] as DocumentListItem[],
            }
        }
        options = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "document:view")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "documents.list",
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [] as DocumentListItem[] }
        }

        if (options?.caseId) {
            await requireCaseAccess(options.caseId, user, "case:view")
        }

        const where: Prisma.DocumentWhereInput = {
            case: buildCaseVisibilityWhere({ userId: user.id, role: user.role, tenantId }),
        }

        if (options?.caseId) where.caseId = options.caseId
        if (options?.category && options.category !== "all") where.category = options.category
        if (options?.onlyFavorites) where.isFavorite = true
        if (options?.query) {
            where.OR = [
                { title: { contains: options.query, mode: "insensitive" } },
                { notes: { contains: options.query, mode: "insensitive" } },
            ]
        }

        const documents = await prisma.document.findMany({
            where,
            include: {
                case: { select: { id: true, title: true, caseCode: true } },
                uploader: { select: { id: true, name: true } },
            },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: options?.take ?? 200,
        })

        return { success: true as const, data: documents }
    } catch (error) {
        logger.error("获取文档列表失败", error)
        return { success: false as const, error: "获取文档列表失败", data: [] as DocumentListItem[] }
    }
}

export async function getDocumentByIdImpl(id: string) {
    try {
        const parsedId = UuidSchema.safeParse(id)
        if (!parsedId.success) {
            return { success: false as const, error: "输入校验失败" }
        }
        id = parsedId.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "document:view")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "documents.get",
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false as const, error: rate.error }

        const document = await prisma.document.findFirst({
            where: { id, case: { tenantId } },
            include: {
                case: { select: { id: true, title: true, caseCode: true } },
                uploader: { select: { id: true, name: true } },
                tasks: { select: { id: true, title: true, status: true } },
                versions: {
                    orderBy: { version: "desc" },
                    include: { uploader: { select: { id: true, name: true } } },
                },
            },
        })

        if (!document) {
            return { success: false as const, error: "文档不存在" }
        }

        await requireCaseAccess(document.caseId, user, "case:view")

        return { success: true as const, data: document }
    } catch (error) {
        logger.error("获取文档详情失败", error)
        return { success: false as const, error: "获取文档详情失败" }
    }
}

export async function updateDocumentImpl(
    id: string,
    data: {
        title?: string
        category?: string
        notes?: string
        tags?: string[]
        isConfidential?: boolean
    }
) {
    try {
        const parsed = z
            .object({ id: UuidSchema, data: UpdateDocumentInputSchema })
            .strict()
            .safeParse({ id, data })
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        id = parsed.data.id
        data = parsed.data.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "document:edit")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "documents.update",
            limit: 60,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false as const, error: rate.error }

        const existing = await prisma.document.findFirst({
            where: { id, case: { tenantId } },
            select: { caseId: true },
        })
        if (!existing) {
            return { success: false as const, error: "文档不存在" }
        }

        await requireCaseAccess(existing.caseId, user, "case:view")

        const updated = await prisma.document.updateMany({
            where: { id, case: { tenantId } },
            data: {
                title: data.title,
                category: data.category,
                notes: data.notes,
                tags: data.tags,
                isConfidential: data.isConfidential,
            },
        })
        if (updated.count === 0) {
            return { success: false as const, error: "文档不存在" }
        }

        const document = await prisma.document.findFirst({ where: { id, case: { tenantId } } })
        if (!document) {
            return { success: false as const, error: "文档不存在" }
        }

        revalidatePath("/documents")
        revalidatePath(`/documents/${id}`)
        return { success: true as const, data: document }
    } catch (error) {
        logger.error("更新文档失败", error)
        return { success: false as const, error: "更新文档失败" }
    }
}

export async function deleteDocumentImpl(id: string) {
    try {
        const parsedId = UuidSchema.safeParse(id)
        if (!parsedId.success) {
            return { success: false as const, error: "输入校验失败" }
        }
        id = parsedId.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "document:delete")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "documents.delete",
            limit: 20,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false as const, error: rate.error }

        const storage = getStorageProvider()
        const document = await prisma.document.findFirst({
            where: { id, case: { tenantId } },
            include: { versions: { select: { fileKey: true } } },
        })
        if (!document) {
            return { success: false as const, error: "文档不存在" }
        }

        await requireCaseAccess(document.caseId, user, "case:view")

        const fileKeys = document.versions
            .map((v) => v.fileKey)
            .filter((v): v is string => typeof v === "string" && v.length > 0)

        if (fileKeys.length > 0) {
            const results = await Promise.allSettled(fileKeys.map((key) => storage.deleteObject(key)))
            const failed = results.filter((r) => r.status === "rejected")
            if (failed.length > 0) {
                logger.error("删除存储对象失败", failed[0])
                return { success: false as const, error: "删除存储对象失败，请稍后重试" }
            }
        }

        const deleted = await prisma.document.deleteMany({ where: { id, case: { tenantId } } })
        if (deleted.count === 0) {
            return { success: false as const, error: "文档不存在" }
        }

        revalidatePath("/documents")
        revalidatePath(`/cases/${document.caseId}`)
        return { success: true as const }
    } catch (error) {
        logger.error("删除文档失败", error)
        return { success: false as const, error: "删除文档失败" }
    }
}

export async function toggleDocumentFavoriteImpl(id: string) {
    try {
        const parsedId = UuidSchema.safeParse(id)
        if (!parsedId.success) {
            return { success: false as const, error: "输入校验失败" }
        }
        id = parsedId.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "document:edit")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "documents.favorite.toggle",
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false as const, error: rate.error }

        const document = await prisma.document.findFirst({ where: { id, case: { tenantId } } })
        if (!document) {
            return { success: false as const, error: "文档不存在" }
        }

        await requireCaseAccess(document.caseId, user, "case:view")

        const updated = await prisma.document.updateMany({
            where: { id, case: { tenantId } },
            data: { isFavorite: !document.isFavorite },
        })
        if (updated.count === 0) {
            return { success: false as const, error: "文档不存在" }
        }

        const docNext = await prisma.document.findFirst({ where: { id, case: { tenantId } } })
        if (!docNext) {
            return { success: false as const, error: "文档不存在" }
        }

        revalidatePath("/documents")
        revalidatePath(`/documents/${id}`)
        return { success: true as const, data: docNext }
    } catch (error) {
        logger.error("切换收藏失败", error)
        return { success: false as const, error: "切换收藏失败" }
    }
}

export async function addDocumentTagImpl(id: string, tag: string) {
    try {
        const parsed = z
            .object({ id: UuidSchema, tag: DocumentTagSchema })
            .strict()
            .safeParse({ id, tag })
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        id = parsed.data.id
        tag = parsed.data.tag

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "document:edit")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "documents.tag.add",
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false as const, error: rate.error }

        const document = await prisma.document.findFirst({ where: { id, case: { tenantId } } })
        if (!document) {
            return { success: false as const, error: "文档不存在" }
        }

        await requireCaseAccess(document.caseId, user, "case:view")

        const newTags = [...(document.tags || []), tag].filter((v, i, a) => a.indexOf(v) === i)
        if (newTags.length > 50) {
            return { success: false as const, error: "标签数量已达上限，请先清理标签" }
        }

        const updated = await prisma.document.updateMany({
            where: { id, case: { tenantId } },
            data: { tags: newTags },
        })
        if (updated.count === 0) {
            return { success: false as const, error: "文档不存在" }
        }

        const docNext = await prisma.document.findFirst({ where: { id, case: { tenantId } } })
        if (!docNext) {
            return { success: false as const, error: "文档不存在" }
        }

        revalidatePath("/documents")
        revalidatePath(`/documents/${id}`)
        return { success: true as const, data: docNext }
    } catch (error) {
        logger.error("添加标签失败", error)
        return { success: false as const, error: "添加标签失败" }
    }
}

export async function removeDocumentTagImpl(id: string, tag: string) {
    try {
        const parsed = z
            .object({ id: UuidSchema, tag: DocumentTagSchema })
            .strict()
            .safeParse({ id, tag })
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        id = parsed.data.id
        tag = parsed.data.tag

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "document:edit")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "documents.tag.remove",
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false as const, error: rate.error }

        const document = await prisma.document.findFirst({ where: { id, case: { tenantId } } })
        if (!document) {
            return { success: false as const, error: "文档不存在" }
        }

        await requireCaseAccess(document.caseId, user, "case:view")

        const newTags = (document.tags || []).filter((t) => t !== tag)

        const updated = await prisma.document.updateMany({
            where: { id, case: { tenantId } },
            data: { tags: newTags },
        })
        if (updated.count === 0) {
            return { success: false as const, error: "文档不存在" }
        }

        const docNext = await prisma.document.findFirst({ where: { id, case: { tenantId } } })
        if (!docNext) {
            return { success: false as const, error: "文档不存在" }
        }

        revalidatePath("/documents")
        revalidatePath(`/documents/${id}`)
        return { success: true as const, data: docNext }
    } catch (error) {
        logger.error("移除标签失败", error)
        return { success: false as const, error: "移除标签失败" }
    }
}

