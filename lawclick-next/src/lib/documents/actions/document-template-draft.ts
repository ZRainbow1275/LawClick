import "server-only"

import { revalidatePath } from "next/cache"

import { z } from "zod"

import { enforceActionRateLimit } from "@/lib/action-rate-limit"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { logger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { getActiveTenantContextOrThrow, requireCaseAccess, requireTenantPermission } from "@/lib/server-auth"
import { compileTemplateContent, listTemplatePlaceholders } from "@/lib/templates/compile"
import { TemplateCodeSchema, TemplateVariablesSchema } from "@/lib/templates/schemas"
import { getTemplateCodeForStageDocumentType } from "@/lib/templates/stage-document-template-map"
import { UuidSchema } from "@/lib/zod"

const TemplateDraftDataSchema = z
    .record(z.string().trim().min(1).max(64), z.string().trim().max(5000))
    .superRefine((value, ctx) => {
        const keys = Object.keys(value)
        if (keys.length > 200) {
            ctx.addIssue({ code: "custom", message: "模板数据字段数量过多" })
        }
    })

const GenerateDocumentInputSchema = z
    .object({
        caseId: UuidSchema,
        templateCode: TemplateCodeSchema,
        data: TemplateDraftDataSchema,
    })
    .strict()

const DraftExistingDocumentFromTemplateInputSchema = z
    .object({
        documentId: UuidSchema,
        templateCode: TemplateCodeSchema.optional(),
        mode: z.enum(["replace", "append"]).optional(),
        data: TemplateDraftDataSchema,
    })
    .strict()

async function compileDocumentTemplateDraft(input: {
    tenantId: string
    templateCode: string
    data: Record<string, string>
}): Promise<
    | { ok: true; templateCode: string; templateName: string; compiled: string }
    | { ok: false; error: string }
> {
    const template = await prisma.documentTemplate.findUnique({
        where: { tenantId_code: { tenantId: input.tenantId, code: input.templateCode } },
        select: {
            code: true,
            name: true,
            content: true,
            variables: true,
            isActive: true,
        },
    })

    if (!template || !template.isActive) {
        return { ok: false, error: "模板不存在或已停用" }
    }

    const variablesParsed = TemplateVariablesSchema.safeParse(template.variables)
    if (!variablesParsed.success) {
        logger.error(`[DocumentTemplate] variables corrupted: ${template.code}`, variablesParsed.error)
        return { ok: false, error: "模板配置损坏，请联系管理员" }
    }

    const variables = variablesParsed.data
    const variableMap = new Map<string, (typeof variables)[number]>()
    for (const v of variables) variableMap.set(v.key, v)

    const placeholders = listTemplatePlaceholders(template.content)
    const usedKeys = new Set<string>()
    for (const key of placeholders) {
        if (key === "date") continue
        if (!variableMap.has(key)) {
            logger.warn("[DocumentTemplate] content references unknown key", { templateCode: template.code, key })
            return { ok: false, error: "模板配置损坏，请联系管理员" }
        }
        usedKeys.add(key)
    }

    for (const key of Object.keys(input.data)) {
        if (!variableMap.has(key)) {
            return { ok: false, error: `模板不支持字段：${key}` }
        }
    }

    function formatVariableValue(input: {
        type: string
        label: string
        value: string
    }): { ok: true; value: string } | { ok: false; error: string } {
        const v = input.value.trim()
        if (!v) return { ok: true, value: "" }

        if (input.type === "date") {
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
            if (!m) return { ok: false, error: `日期格式不正确：${input.label}` }
            const year = Number(m[1])
            const month = Number(m[2])
            const day = Number(m[3])
            if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
                return { ok: false, error: `日期格式不正确：${input.label}` }
            }
            const date = new Date(Date.UTC(year, month - 1, day))
            if (Number.isNaN(date.getTime())) {
                return { ok: false, error: `日期格式不正确：${input.label}` }
            }
            const formatted = new Intl.DateTimeFormat("zh-CN", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                timeZone: "Asia/Shanghai",
            }).format(date)
            return { ok: true, value: formatted }
        }

        if (input.type === "number" || input.type === "currency") {
            const normalized = v.replace(/,/g, "")
            const n = Number(normalized)
            if (!Number.isFinite(n)) {
                return {
                    ok: false,
                    error: `${input.type === "currency" ? "金额" : "数字"}格式不正确：${input.label}`,
                }
            }
            if (input.type === "currency") {
                return {
                    ok: true,
                    value: new Intl.NumberFormat("zh-CN", {
                        style: "currency",
                        currency: "CNY",
                        maximumFractionDigits: 2,
                    }).format(n),
                }
            }
            return { ok: true, value: new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(n) }
        }

        return { ok: true, value: v }
    }

    const compiledData: Record<string, string> = {}
    for (const v of variables) {
        const raw = input.data[v.key] ?? ""
        const required = Boolean(v.required) || usedKeys.has(v.key)
        if (required && !raw.trim()) {
            return { ok: false, error: `请填写：${v.label}` }
        }

        const formatted = formatVariableValue({ type: v.type, label: v.label, value: raw })
        if (!formatted.ok) {
            return { ok: false, error: formatted.error }
        }
        compiledData[v.key] = formatted.value
    }

    const compiled = compileTemplateContent({ content: template.content, data: compiledData })
    return { ok: true, templateCode: template.code, templateName: template.name, compiled }
}

export async function generateDocumentImpl(caseId: string, templateCode: string, data: Record<string, string>) {
    try {
        const parsed = GenerateDocumentInputSchema.safeParse({ caseId, templateCode, data })
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        caseId = parsed.data.caseId
        templateCode = parsed.data.templateCode
        data = parsed.data.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "document:upload")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "documents.generate",
            limit: 20,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false as const, error: rate.error }

        await requireCaseAccess(caseId, user, "case:view")

        const compiled = await compileDocumentTemplateDraft({ tenantId, templateCode, data })
        if (!compiled.ok) {
            return { success: false as const, error: compiled.error }
        }

        const title = `草稿：${compiled.templateName}`
        const document = await prisma.document.create({
            data: {
                title,
                fileUrl: null,
                fileType: null,
                fileSize: 0,
                version: 0,
                caseId,
                category: "draft",
                tags: ["草稿", `template:${compiled.templateCode}`],
                notes: compiled.compiled,
                uploaderId: user.id,
            },
        })

        revalidatePath(`/cases/${caseId}`)
        revalidatePath("/documents")

        return { success: true as const, documentId: document.id }
    } catch (error) {
        logger.error("Doc Gen Failed", error)
        return { success: false as const, error: getPublicActionErrorMessage(error, "生成文档失败，请稍后重试") }
    }
}

export async function draftStageDocumentFromTemplateImpl(input: {
    documentId: string
    templateCode?: string
    mode?: "replace" | "append"
    data: Record<string, string>
}) {
    try {
        const parsed = DraftExistingDocumentFromTemplateInputSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }

        const documentId = parsed.data.documentId
        const templateCodeInput = parsed.data.templateCode
        const mode = parsed.data.mode ?? "replace"
        const data = parsed.data.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "document:edit")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "documents.stage.draft",
            limit: 30,
            windowMs: 60_000,
            extraKey: documentId,
        })
        if (!rate.allowed) return { success: false as const, error: rate.error }

        const existing = await prisma.document.findFirst({
            where: { id: documentId, case: { tenantId } },
            select: {
                id: true,
                caseId: true,
                documentType: true,
                notes: true,
                tags: true,
            },
        })
        if (!existing) {
            return { success: false as const, error: "文档不存在" }
        }

        await requireCaseAccess(existing.caseId, user, "case:view")

        const inferredTemplateCode = getTemplateCodeForStageDocumentType(existing.documentType)
        const templateCode = templateCodeInput || inferredTemplateCode
        if (!templateCode) {
            return { success: false as const, error: "该阶段文书未绑定默认模板，请手动选择模板" }
        }

        const compiled = await compileDocumentTemplateDraft({
            tenantId,
            templateCode,
            data,
        })
        if (!compiled.ok) {
            return { success: false as const, error: compiled.error }
        }

        const nextNotes = (() => {
            const prev = typeof existing.notes === "string" ? existing.notes.trim() : ""
            if (mode !== "append" || !prev) return compiled.compiled
            return `${prev}\n\n---\n\n${compiled.compiled}`
        })()

        const existingTags = Array.isArray(existing.tags) ? existing.tags : []
        const templateTag = `template:${compiled.templateCode}`
        const nextTags = existingTags.includes(templateTag) ? existingTags : [...existingTags, templateTag]
        if (nextTags.length > 50) {
            return { success: false as const, error: "标签数量已达上限，请先清理标签" }
        }

        const updated = await prisma.document.updateMany({
            where: { id: documentId, case: { tenantId } },
            data: { notes: nextNotes, tags: nextTags },
        })
        if (updated.count === 0) {
            return { success: false as const, error: "文档不存在" }
        }

        revalidatePath(`/cases/${existing.caseId}`)
        revalidatePath(`/documents/${existing.id}`)
        revalidatePath("/documents")

        return {
            success: true as const,
            documentId: existing.id,
            templateCode: compiled.templateCode,
            templateName: compiled.templateName,
        }
    } catch (error) {
        logger.error("阶段文书模板起草失败", error)
        return { success: false as const, error: getPublicActionErrorMessage(error, "模板起草失败，请稍后重试") }
    }
}

