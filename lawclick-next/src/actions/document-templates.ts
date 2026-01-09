"use server"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { getActiveTenantContextOrThrow, requireTenantPermission } from "@/lib/server-auth"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { OptionalNonEmptyString } from "@/lib/zod"
import { z } from "zod"

import type { DocumentTemplateDetail, DocumentTemplateListItem, DocumentTemplateVariable } from "@/lib/templates/types"
import { BUILTIN_TEMPLATE_KEYS, listTemplatePlaceholders } from "@/lib/templates/compile"
import { TemplateCodeSchema, TemplateVariablesSchema } from "@/lib/templates/schemas"
import { getBuiltinDocumentTemplateLegacySnapshot, listBuiltinDocumentTemplates } from "@/lib/templates/builtin/builtin-document-templates"

function toListItem(row: {
    code: string
    name: string
    description: string | null
    variables: unknown
    isActive: boolean
    updatedAt: Date
}): DocumentTemplateListItem {
    const parsedVars = TemplateVariablesSchema.safeParse(row.variables)
    if (!parsedVars.success) {
        throw new Error(`模板变量数据损坏：${row.code}`)
    }
    return {
        code: row.code,
        name: row.name,
        description: row.description,
        variables: parsedVars.data satisfies DocumentTemplateVariable[],
        isActive: row.isActive,
        updatedAt: row.updatedAt.toISOString(),
    }
}

function validateTemplateContent(input: { code: string; content: string; variables: DocumentTemplateVariable[] }): { ok: true } | { ok: false; error: string } {
    const allowed = new Set<string>([...BUILTIN_TEMPLATE_KEYS, ...input.variables.map((v) => v.key)])
    const placeholders = listTemplatePlaceholders(input.content)
    const unknown = placeholders.filter((key) => !allowed.has(key))

    if (unknown.length > 0) {
        return {
            ok: false,
            error: `模板内容引用了未声明变量：${unknown.join("、")}`,
        }
    }

    return { ok: true }
}

export async function getDocumentTemplatesForDrafting() {
    try {
        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "document:upload")

        const rate = await enforceRateLimit({ ctx, action: "docTemplates.drafting.list", limit: 240 })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [] as DocumentTemplateListItem[] }
        }

        const { tenantId } = ctx

        const templates = await prisma.documentTemplate.findMany({
            where: { tenantId, isActive: true },
            orderBy: [{ name: "asc" }],
            take: 200,
            select: {
                code: true,
                name: true,
                description: true,
                variables: true,
                isActive: true,
                updatedAt: true,
            },
        })

        return {
            success: true as const,
            data: templates.map(toListItem),
        }
    } catch (error) {
        logger.error("获取模板失败", error)
        return { success: false as const, error: "加载模板失败", data: [] as DocumentTemplateListItem[] }
    }
}

export async function getAllDocumentTemplates(options?: { includeInactive?: boolean }) {
    const parsedOptions = z
        .object({
            includeInactive: z.boolean().optional(),
        })
        .strict()
        .optional()
        .safeParse(options)
    if (!parsedOptions.success) {
        return { success: false as const, error: "输入校验失败", data: [] as DocumentTemplateListItem[] }
    }
    options = parsedOptions.data

    const ctx = await getActiveTenantContextOrThrow()
    requireTenantPermission(ctx, "document:template_manage")
    const rate = await enforceRateLimit({ ctx, action: "docTemplates.admin.list", limit: 240 })
    if (!rate.allowed) {
        return { success: false as const, error: rate.error, data: [] as DocumentTemplateListItem[] }
    }
    const { tenantId } = ctx

    try {
        const templates = await prisma.documentTemplate.findMany({
            where: options?.includeInactive ? { tenantId } : { tenantId, isActive: true },
            orderBy: [{ updatedAt: "desc" }],
            take: 200,
            select: {
                code: true,
                name: true,
                description: true,
                variables: true,
                isActive: true,
                updatedAt: true,
            },
        })

        return { success: true as const, data: templates.map(toListItem) }
    } catch (error) {
        logger.error("获取全部模板失败", error)
        return { success: false as const, error: "加载模板失败", data: [] as DocumentTemplateListItem[] }
    }
}

export async function getDocumentTemplateForEdit(code: string) {
    const parsed = z.object({ code: TemplateCodeSchema }).strict().safeParse({ code })
    if (!parsed.success) {
        return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
    }

    try {
        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "document:template_manage")
        const rate = await enforceRateLimit({
            ctx,
            action: "docTemplates.getForEdit",
            limit: 240,
            extraKey: parsed.data.code,
        })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { tenantId } = ctx

        const row = await prisma.documentTemplate.findUnique({
            where: { tenantId_code: { tenantId, code: parsed.data.code } },
            select: {
                code: true,
                name: true,
                description: true,
                variables: true,
                content: true,
                isActive: true,
                updatedAt: true,
            },
        })

        if (!row) {
            return { success: false as const, error: "模板不存在" }
        }

        const listItem = toListItem(row)
        const detail: DocumentTemplateDetail = {
            ...listItem,
            content: row.content,
        }

        return { success: true as const, data: detail }
    } catch (error) {
        logger.error("获取模板详情失败", error)
        return { success: false as const, error: "加载模板失败" }
    }
}

const CreateDocumentTemplateInputSchema = z
    .object({
        code: TemplateCodeSchema,
        name: z.string().trim().min(1, "模板名称不能为空").max(120, "模板名称过长"),
        description: OptionalNonEmptyString(500),
        variables: TemplateVariablesSchema,
        content: z.string().trim().min(1, "模板内容不能为空").max(200_000, "模板内容过长"),
        isActive: z.boolean().optional(),
    })
    .strict()

export async function createDocumentTemplate(input: {
    code: string
    name: string
    description?: string
    variables: DocumentTemplateVariable[]
    content: string
    isActive?: boolean
}) {
    const parsed = CreateDocumentTemplateInputSchema.safeParse(input)
    if (!parsed.success) {
        return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
    }

    const ctx = await getActiveTenantContextOrThrow()
    requireTenantPermission(ctx, "document:template_manage")
    const rate = await enforceRateLimit({ ctx, action: "docTemplates.create", limit: 60, extraKey: parsed.data.code })
    if (!rate.allowed) {
        return { success: false as const, error: rate.error }
    }
    const { tenantId } = ctx

    const contentCheck = validateTemplateContent({
        code: parsed.data.code,
        content: parsed.data.content,
        variables: parsed.data.variables,
    })
    if (!contentCheck.ok) {
        return { success: false as const, error: contentCheck.error }
    }

    try {
        const created = await prisma.documentTemplate.create({
            data: {
                tenantId,
                code: parsed.data.code,
                name: parsed.data.name,
                description: parsed.data.description,
                variables: parsed.data.variables,
                content: parsed.data.content,
                isActive: parsed.data.isActive ?? true,
            },
            select: {
                code: true,
                name: true,
                description: true,
                variables: true,
                isActive: true,
                updatedAt: true,
            },
        })

        return { success: true as const, data: toListItem(created) }
    } catch (error) {
        const message = error instanceof Error ? error.message : "创建模板失败"
        return { success: false as const, error: message }
    }
}

const UpdateDocumentTemplateInputSchema = z
    .object({
        code: TemplateCodeSchema,
        data: z
            .object({
                name: z.string().trim().min(1, "模板名称不能为空").max(120, "模板名称过长").optional(),
                description: OptionalNonEmptyString(500).optional(),
                variables: TemplateVariablesSchema.optional(),
                content: z.string().trim().min(1, "模板内容不能为空").max(200_000, "模板内容过长").optional(),
                isActive: z.boolean().optional(),
            })
            .strict()
            .refine((v) => Object.values(v).some((val) => val !== undefined), { message: "没有需要更新的字段" }),
    })
    .strict()

export async function updateDocumentTemplate(code: string, data: Partial<Omit<z.infer<typeof CreateDocumentTemplateInputSchema>, "code">>) {
    const parsed = UpdateDocumentTemplateInputSchema.safeParse({ code, data })
    if (!parsed.success) {
        return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
    }

    const ctx = await getActiveTenantContextOrThrow()
    requireTenantPermission(ctx, "document:template_manage")
    const rate = await enforceRateLimit({ ctx, action: "docTemplates.update", limit: 60, extraKey: parsed.data.code })
    if (!rate.allowed) {
        return { success: false as const, error: rate.error }
    }
    const { tenantId } = ctx

    try {
        const existing = await prisma.documentTemplate.findUnique({
            where: { tenantId_code: { tenantId, code: parsed.data.code } },
            select: {
                code: true,
                variables: true,
                content: true,
            },
        })
        if (!existing) {
            return { success: false as const, error: "模板不存在" }
        }

        const mergedVariables = parsed.data.data.variables ?? existing.variables
        const mergedContent = parsed.data.data.content ?? existing.content

        const variablesParsed = TemplateVariablesSchema.safeParse(mergedVariables)
        if (!variablesParsed.success) {
            logger.error(`[DocumentTemplate] variables corrupted: ${parsed.data.code}`, variablesParsed.error)
            return { success: false as const, error: "模板变量数据损坏" }
        }

        const contentCheck = validateTemplateContent({
            code: parsed.data.code,
            content: mergedContent,
            variables: variablesParsed.data,
        })
        if (!contentCheck.ok) {
            return { success: false as const, error: contentCheck.error }
        }

        const updated = await prisma.documentTemplate.update({
            where: { tenantId_code: { tenantId, code: parsed.data.code } },
            data: {
                name: parsed.data.data.name,
                description: parsed.data.data.description,
                variables: parsed.data.data.variables,
                content: parsed.data.data.content,
                isActive: parsed.data.data.isActive,
            },
            select: {
                code: true,
                name: true,
                description: true,
                variables: true,
                isActive: true,
                updatedAt: true,
            },
        })

        return { success: true as const, data: toListItem(updated) }
    } catch (error) {
        const message = error instanceof Error ? error.message : "更新模板失败"
        return { success: false as const, error: message }
    }
}

export async function syncBuiltinDocumentTemplates(options?: { dryRun?: boolean }) {
    const parsedOptions = z
        .object({ dryRun: z.boolean().optional() })
        .strict()
        .optional()
        .safeParse(options)
    if (!parsedOptions.success) {
        return { success: false as const, error: "输入校验失败" }
    }
    options = parsedOptions.data

    const ctx = await getActiveTenantContextOrThrow()
    requireTenantPermission(ctx, "document:template_manage")

    const rate = await enforceRateLimit({ ctx, action: "docTemplates.builtin.sync", limit: 6 })
    if (!rate.allowed) {
        return { success: false as const, error: rate.error }
    }

    try {
        const templates = listBuiltinDocumentTemplates()
        const codes = templates.map((t) => t.code)
        const byCode = new Map(templates.map((t) => [t.code, t] as const))
        const { tenantId } = ctx

        const existing = await prisma.documentTemplate.findMany({
            where: { tenantId, code: { in: codes } },
            select: { code: true, content: true, variables: true },
            take: 5000,
        })
        const existingSet = new Set(existing.map((row) => row.code))
        const missing = templates.filter((t) => !existingSet.has(t.code))

        const legacyUpdatableCodes: string[] = []
        for (const row of existing) {
            const legacy = getBuiltinDocumentTemplateLegacySnapshot(row.code)
            const builtin = byCode.get(row.code)
            if (!legacy || !builtin) continue

            const parsedVars = TemplateVariablesSchema.safeParse(row.variables)
            if (!parsedVars.success) continue

            const sameVariables = JSON.stringify(parsedVars.data) === JSON.stringify(legacy.variables)
            const sameContent = row.content === legacy.content
            if (!sameVariables || !sameContent) continue

            const needsUpdate =
                JSON.stringify(parsedVars.data) !== JSON.stringify(builtin.variables) || row.content !== builtin.content
            if (needsUpdate) legacyUpdatableCodes.push(row.code)
        }

        if (options?.dryRun) {
            return {
                success: true as const,
                data: {
                    total: templates.length,
                    existing: existingSet.size,
                    missing: missing.length,
                    missingCodes: missing.map((t) => t.code),
                    legacyUpdatable: legacyUpdatableCodes.length,
                    legacyUpdatableCodes,
                    created: 0,
                    updated: 0,
                    skipped: existingSet.size,
                    createdCodes: [] as string[],
                    updatedCodes: [] as string[],
                },
            }
        }

        if (missing.length > 0) {
            await prisma.documentTemplate.createMany({
                data: missing.map((t) => ({
                    tenantId,
                    code: t.code,
                    name: t.name,
                    description: t.description,
                    variables: t.variables,
                    content: t.content,
                    isActive: true,
                })),
                skipDuplicates: true,
            })
        }

        if (legacyUpdatableCodes.length > 0) {
            const updates = []
            for (const code of legacyUpdatableCodes) {
                const builtin = byCode.get(code)
                if (!builtin) continue
                updates.push(
                    prisma.documentTemplate.update({
                        where: { tenantId_code: { tenantId, code: builtin.code } },
                        data: {
                            variables: builtin.variables,
                            content: builtin.content,
                        },
                    })
                )
            }
            if (updates.length > 0) await prisma.$transaction(updates)
        }

        return {
            success: true as const,
            data: {
                total: templates.length,
                existing: existingSet.size,
                missing: missing.length,
                missingCodes: missing.map((t) => t.code),
                created: missing.length,
                legacyUpdatable: legacyUpdatableCodes.length,
                legacyUpdatableCodes,
                updated: legacyUpdatableCodes.length,
                skipped: existingSet.size - legacyUpdatableCodes.length,
                createdCodes: missing.map((t) => t.code),
                updatedCodes: legacyUpdatableCodes,
            },
        }
    } catch (error) {
        logger.error("同步内置文书模板失败", error)
        return { success: false as const, error: "同步内置文书模板失败" }
    }
}
