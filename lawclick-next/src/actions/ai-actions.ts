"use server"

import { z } from "zod"
import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { getActiveTenantContextWithPermissionOrThrow, requireCaseAccess } from "@/lib/server-auth"
import { UuidSchema, OptionalNonEmptyString } from "@/lib/zod"
import { aiChat, getAiRuntimeStatus } from "@/lib/ai/ai-service"
import { AiConversationMessagesSchema } from "@/lib/ai/ai-schemas"
import type { AiChatMessage } from "@/lib/ai/ai-types"

const AiConversationContextSchema = z
    .object({
        caseId: UuidSchema.optional(),
        documentId: UuidSchema.optional(),
        taskId: UuidSchema.optional(),
        approvalId: UuidSchema.optional(),
    })
    .strict()

const CreateConversationInputSchema = z
    .object({
        title: OptionalNonEmptyString(200),
        caseId: UuidSchema.optional(),
        context: AiConversationContextSchema.optional(),
    })
    .strict()

const ListConversationsInputSchema = z
    .object({
        take: z.number().int().min(1).max(50).optional(),
    })
    .strict()

const SendMessageInputSchema = z
    .object({
        conversationId: UuidSchema.optional(),
        message: z.string().trim().min(1, "请输入内容").max(10_000, "内容过长"),
        context: AiConversationContextSchema.optional(),
    })
    .strict()

function safeParseMessages(value: unknown) {
    const parsed = AiConversationMessagesSchema.safeParse(value)
    return parsed.success ? parsed.data : []
}

function toPrismaJson<TValue>(value: TValue): Prisma.InputJsonValue {
    return value as unknown as Prisma.InputJsonValue
}

function buildDeveloperPrompt(input: { context?: z.infer<typeof AiConversationContextSchema> }) {
    const blocks: string[] = []
    blocks.push("你是 LegalMind LawClick 的 AI 助手。")
    blocks.push("要求：")
    blocks.push("- 用中文回答（zh-CN）。")
    blocks.push("- 仅基于用户提供的信息与系统上下文进行归纳；不确定时要明确说明“不确定”。")
    blocks.push("- 不要编造法律条文、案例引用或法院观点。")
    blocks.push("- 输出尽量结构化（标题/要点/清单），便于落库与复核。")
    if (input.context?.caseId) blocks.push(`上下文：caseId=${input.context.caseId}`)
    if (input.context?.documentId) blocks.push(`上下文：documentId=${input.context.documentId}`)
    if (input.context?.taskId) blocks.push(`上下文：taskId=${input.context.taskId}`)
    if (input.context?.approvalId) blocks.push(`上下文：approvalId=${input.context.approvalId}`)
    return blocks.join("\n")
}

export async function getAiStatus() {
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:view")
        const rate = await enforceRateLimit({ ctx, action: "ai.status", limit: 600 })
        if (!rate.allowed) return { success: false as const, error: rate.error, data: null }

        return { success: true as const, data: getAiRuntimeStatus() }
    } catch (error) {
        logger.error("getAiStatus failed", error)
        return { success: false as const, error: "获取 AI 状态失败", data: null }
    }
}

export async function listAiConversations(input?: { take?: number }) {
    try {
        const parsed = ListConversationsInputSchema.safeParse(input || {})
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败", data: [] }
        }

        const ctx = await getActiveTenantContextWithPermissionOrThrow("ai:use")
        const rate = await enforceRateLimit({ ctx, action: "ai.conversations.list", limit: 1200 })
        if (!rate.allowed) return { success: false as const, error: rate.error, data: [] }

        const { user, tenantId } = ctx
        const take = parsed.data.take ?? 20

        const conversations = await prisma.aIConversation.findMany({
            where: { tenantId, userId: user.id },
            orderBy: [{ updatedAt: "desc" }],
            take,
            select: {
                id: true,
                title: true,
                caseId: true,
                updatedAt: true,
                createdAt: true,
                messages: true,
            },
        })

        const data = conversations.map((c) => {
            const messages = safeParseMessages(c.messages)
            const last = messages.length ? messages[messages.length - 1] : null
            return {
                id: c.id,
                title: c.title || "未命名会话",
                caseId: c.caseId,
                updatedAt: c.updatedAt.toISOString(),
                createdAt: c.createdAt.toISOString(),
                lastMessage: last ? { role: last.role, content: last.content.slice(0, 200) } : null,
            }
        })

        return { success: true as const, data }
    } catch (error) {
        logger.error("listAiConversations failed", error)
        return { success: false as const, error: getPublicActionErrorMessage(error, "获取会话列表失败"), data: [] }
    }
}

export async function getAiConversation(conversationId: string) {
    try {
        const parsedId = UuidSchema.safeParse(conversationId)
        if (!parsedId.success) {
            return { success: false as const, error: "输入校验失败", data: null }
        }

        const ctx = await getActiveTenantContextWithPermissionOrThrow("ai:use")
        const rate = await enforceRateLimit({ ctx, action: "ai.conversation.get", limit: 1200, extraKey: parsedId.data })
        if (!rate.allowed) return { success: false as const, error: rate.error, data: null }

        const { user, tenantId } = ctx
        const conversation = await prisma.aIConversation.findFirst({
            where: { id: parsedId.data, tenantId, userId: user.id },
            select: { id: true, title: true, caseId: true, context: true, messages: true, createdAt: true, updatedAt: true },
        })

        if (!conversation) return { success: false as const, error: "会话不存在", data: null }

        return {
            success: true as const,
            data: {
                id: conversation.id,
                title: conversation.title || "未命名会话",
                caseId: conversation.caseId,
                context: conversation.context,
                messages: safeParseMessages(conversation.messages),
                createdAt: conversation.createdAt.toISOString(),
                updatedAt: conversation.updatedAt.toISOString(),
            },
        }
    } catch (error) {
        logger.error("getAiConversation failed", error)
        return { success: false as const, error: getPublicActionErrorMessage(error, "获取会话失败"), data: null }
    }
}

export async function createAiConversation(input: { title?: string; caseId?: string; context?: unknown }) {
    try {
        const parsed = CreateConversationInputSchema.safeParse({
            title: input.title,
            caseId: input.caseId,
            context: input.context,
        })
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败", data: null }
        }

        const ctx = await getActiveTenantContextWithPermissionOrThrow("ai:use")
        const rate = await enforceRateLimit({ ctx, action: "ai.conversation.create", limit: 120, extraKey: parsed.data.caseId || "" })
        if (!rate.allowed) return { success: false as const, error: rate.error, data: null }

        const { tenantId, user } = ctx
        if (parsed.data.caseId) {
            await requireCaseAccess(parsed.data.caseId, user, "case:view")
        }

        const conversation = await prisma.aIConversation.create({
            data: {
                tenantId,
                userId: user.id,
                title: parsed.data.title,
                caseId: parsed.data.caseId,
                context: parsed.data.context ? toPrismaJson(parsed.data.context) : undefined,
                messages: toPrismaJson([]),
            },
            select: { id: true },
        })

        return { success: true as const, data: { id: conversation.id } }
    } catch (error) {
        logger.error("createAiConversation failed", error)
        return { success: false as const, error: getPublicActionErrorMessage(error, "创建会话失败"), data: null }
    }
}

export async function sendAiChatMessage(input: { conversationId?: string; message: string; context?: unknown }) {
    try {
        const parsed = SendMessageInputSchema.safeParse({
            conversationId: input.conversationId,
            message: input.message,
            context: input.context,
        })
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }

        const ctx = await getActiveTenantContextWithPermissionOrThrow("ai:use")
        const rate = await enforceRateLimit({
            ctx,
            action: "ai.chat.send",
            limit: 60,
            extraKey: parsed.data.conversationId || "",
        })
        if (!rate.allowed) return { success: false as const, error: rate.error }

        const { tenantId, user } = ctx
        const context = parsed.data.context || undefined
        const contextParsed = context ? AiConversationContextSchema.safeParse(context) : null
        if (contextParsed && !contextParsed.success) {
            return { success: false as const, error: contextParsed.error.issues[0]?.message || "上下文校验失败" }
        }

        const normalizedContext = contextParsed?.success ? contextParsed.data : undefined
        if (normalizedContext?.caseId) {
            await requireCaseAccess(normalizedContext.caseId, user, "case:view")
        }

        let conversationId = parsed.data.conversationId || ""
        if (!conversationId) {
            const created = await prisma.aIConversation.create({
                data: {
                    tenantId,
                    userId: user.id,
                    title: null,
                    caseId: normalizedContext?.caseId,
                    context: normalizedContext ? toPrismaJson(normalizedContext) : undefined,
                    messages: toPrismaJson([]),
                },
                select: { id: true },
            })
            conversationId = created.id
        }

        const conversation = await prisma.aIConversation.findFirst({
            where: { id: conversationId, tenantId, userId: user.id },
            select: { id: true, title: true, messages: true, context: true },
        })
        if (!conversation) return { success: false as const, error: "会话不存在或无权限访问" }

        const existingMessages = safeParseMessages(conversation.messages)
        const now = new Date().toISOString()

        const nextMessages = [
            ...existingMessages,
            { role: "user" as const, content: parsed.data.message, timestamp: now },
        ]

        const trimmed = nextMessages.slice(Math.max(0, nextMessages.length - 40))
        const developerMessage: AiChatMessage = { role: "developer", content: buildDeveloperPrompt({ context: normalizedContext }) }

        const modelInput: AiChatMessage[] = [developerMessage, ...trimmed.map((m) => ({ role: m.role, content: m.content }))]

        const status = getAiRuntimeStatus()
        const result = await aiChat({ model: status.defaultModel, messages: modelInput, temperature: 0.2, maxTokens: 1400 })

        const invocationId = randomUUID()

        if (!result.ok) {
            await prisma.aIInvocation.create({
                data: {
                    id: invocationId,
                    tenantId,
                    userId: user.id,
                    conversationId,
                    type: "CHAT",
                    context: normalizedContext ? toPrismaJson(normalizedContext) : undefined,
                    prompt: JSON.stringify(modelInput),
                    response: null,
                    provider: status.provider,
                    model: status.defaultModel,
                    status: "ERROR",
                    error: result.error,
                    tokenUsage: undefined,
                },
            })
            return { success: false as const, error: result.error }
        }

        const assistantContent = (result.value.content || "").trim() || "（无输出）"
        const assistantMessage = { role: "assistant" as const, content: assistantContent, timestamp: new Date().toISOString() }
        const finalMessages = [...trimmed, assistantMessage]

        const conversationUpdateData: Prisma.AIConversationUpdateManyMutationInput = {
            messages: toPrismaJson(finalMessages),
        }
        if (normalizedContext) {
            conversationUpdateData.context = toPrismaJson(normalizedContext)
        }

        await prisma.$transaction([
            prisma.aIConversation.updateMany({
                where: { id: conversationId, tenantId, userId: user.id },
                data: conversationUpdateData,
            }),
            prisma.aIInvocation.create({
                data: {
                    id: invocationId,
                    tenantId,
                    userId: user.id,
                    conversationId,
                    type: "CHAT",
                    context: normalizedContext ? toPrismaJson(normalizedContext) : undefined,
                    prompt: JSON.stringify(modelInput),
                    response: assistantContent,
                    provider: status.provider,
                    model: status.defaultModel,
                    status: "SUCCESS",
                    error: null,
                    tokenUsage: result.value.usage ? toPrismaJson(result.value.usage) : undefined,
                },
            }),
        ])

        return {
            success: true as const,
            data: {
                conversationId,
                message: assistantMessage,
                usage: result.value.usage,
                invocationId,
            },
        }
    } catch (error) {
        logger.error("sendAiChatMessage failed", error)
        return { success: false as const, error: getPublicActionErrorMessage(error, "AI 对话失败，请稍后重试") }
    }
}

export async function aiGenerateDocumentDraft(input: {
    caseId: string
    title?: string
    instructions: string
    context?: unknown
}) {
    try {
        const parsed = z
            .object({
                caseId: UuidSchema,
                title: OptionalNonEmptyString(200),
                instructions: z.string().trim().min(1, "请输入写作要求").max(20_000),
                context: AiConversationContextSchema.optional(),
            })
            .strict()
            .safeParse(input)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }

        const ctx = await getActiveTenantContextWithPermissionOrThrow("ai:use")
        const rate = await enforceRateLimit({
            ctx,
            action: "ai.documents.generate",
            limit: 20,
            extraKey: parsed.data.caseId,
        })
        if (!rate.allowed) return { success: false as const, error: rate.error }

        const { tenantId, user } = ctx
        await requireCaseAccess(parsed.data.caseId, user, "case:view")

        const caseRow = await prisma.case.findFirst({
            where: { id: parsed.data.caseId, tenantId },
            select: { id: true, title: true, caseCode: true, description: true, serviceType: true },
        })
        if (!caseRow) return { success: false as const, error: "案件不存在" }

        const developer: AiChatMessage = {
            role: "developer",
            content: [
                "你是 LegalMind LawClick 的法律文书起草助手。",
                "要求：",
                "- 用中文（zh-CN）输出。",
                "- 不要编造法律条文或案例引用；如需引用，应提示“需人工补充引用”。",
                "- 输出必须是可直接粘贴到文档的正文（可含标题、分段、条列）。",
                "- 你生成的是草稿，需律师复核与修改。",
                "",
                `案件：${caseRow.caseCode ? `${caseRow.caseCode} · ` : ""}${caseRow.title}`,
                `服务类型：${caseRow.serviceType}`,
                `案件描述：${(caseRow.description || "").trim() || "（无）"}`,
            ].join("\n"),
        }

        const userMsg: AiChatMessage = {
            role: "user",
            content: parsed.data.instructions,
        }

        const status = getAiRuntimeStatus()
        const result = await aiChat({ model: status.defaultModel, messages: [developer, userMsg], temperature: 0.2, maxTokens: 2400 })

        const invocationId = randomUUID()
        const prompt = JSON.stringify([developer, userMsg])

        if (!result.ok) {
            await prisma.aIInvocation.create({
                data: {
                    id: invocationId,
                    tenantId,
                    userId: user.id,
                    conversationId: null,
                    type: "DOCUMENT_ANALYSIS",
                    context: toPrismaJson(parsed.data.context ?? { caseId: caseRow.id }),
                    prompt,
                    response: null,
                    provider: status.provider,
                    model: status.defaultModel,
                    status: "ERROR",
                    error: result.error,
                    tokenUsage: undefined,
                },
            })
            return { success: false as const, error: result.error }
        }

        const content = (result.value.content || "").trim()
        if (!content) return { success: false as const, error: "AI 返回为空，请稍后重试" }

        const title = parsed.data.title || `AI草稿：${caseRow.title}`
        const document = await prisma.document.create({
            data: {
                caseId: caseRow.id,
                title,
                category: "draft",
                tags: ["草稿", "ai"],
                notes: content,
                fileUrl: null,
                fileType: null,
                fileSize: 0,
                uploaderId: user.id,
            },
            select: { id: true },
        })

        await prisma.aIInvocation.create({
            data: {
                id: invocationId,
                tenantId,
                userId: user.id,
                conversationId: null,
                type: "DOCUMENT_ANALYSIS",
                context: toPrismaJson(parsed.data.context ?? { caseId: caseRow.id, documentId: document.id }),
                prompt,
                response: content,
                provider: status.provider,
                model: status.defaultModel,
                status: "SUCCESS",
                error: null,
                tokenUsage: result.value.usage ? toPrismaJson(result.value.usage) : undefined,
            },
        })

        return { success: true as const, data: { documentId: document.id, invocationId } }
    } catch (error) {
        logger.error("aiGenerateDocumentDraft failed", error)
        return { success: false as const, error: getPublicActionErrorMessage(error, "生成 AI 草稿失败") }
    }
}

const DocumentAnalysisTypeSchema = z.enum(["summary", "keypoints", "risks", "timeline"])
const DocumentAnalysisContentSourceSchema = z.enum(["notes", "pasted"])

const AnalyzeDocumentByIdInputSchema = z
    .object({
        documentId: UuidSchema,
        analysisType: DocumentAnalysisTypeSchema.optional(),
        contentSource: DocumentAnalysisContentSourceSchema.optional(),
        pastedText: z.string().trim().max(20_000).optional(),
    })
    .strict()

export async function analyzeDocumentById(input: {
    documentId: string
    analysisType?: z.infer<typeof DocumentAnalysisTypeSchema>
    contentSource?: z.infer<typeof DocumentAnalysisContentSourceSchema>
    pastedText?: string
}) {
    try {
        const parsed = AnalyzeDocumentByIdInputSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }

        const ctx = await getActiveTenantContextWithPermissionOrThrow("ai:use")
        const rate = await enforceRateLimit({
            ctx,
            action: "ai.documents.analyze",
            limit: 20,
            extraKey: parsed.data.documentId,
        })
        if (!rate.allowed) return { success: false as const, error: rate.error }

        const { tenantId, user } = ctx
        const analysisType = parsed.data.analysisType ?? "risks"
        const contentSource = parsed.data.contentSource ?? "notes"

        const document = await prisma.document.findFirst({
            where: { id: parsed.data.documentId, case: { tenantId } },
            select: {
                id: true,
                title: true,
                notes: true,
                caseId: true,
                case: { select: { id: true, title: true, caseCode: true } },
            },
        })
        if (!document) return { success: false as const, error: "文档不存在或无权限访问" }

        await requireCaseAccess(document.caseId, user, "case:view")

        const pastedText = (parsed.data.pastedText || "").trim()
        const notesText = (document.notes || "").trim()
        const content =
            contentSource === "pasted"
                ? pastedText
                : notesText

        if (!content) {
            return {
                success: false as const,
                error:
                    contentSource === "pasted"
                        ? "请输入粘贴文本"
                        : "文档备注为空，请选择“粘贴文本”作为内容来源",
            }
        }

        const developer: AiChatMessage = {
            role: "developer",
            content: [
                buildDeveloperPrompt({ context: { caseId: document.caseId, documentId: document.id } }),
                "",
                "你现在要对一个文档进行审查/分析，输出必须可直接用于律师复核。",
                "输出要求：",
                "- 用中文（zh-CN）。",
                "- 严格基于输入内容，不要编造事实或引用。",
                "- 结构化输出（标题/要点/清单）。",
                "",
                `分析类型=${analysisType}`,
                `内容来源=${contentSource}`,
                `文档标题=${document.title}`,
                `案件=${document.case.caseCode ? `${document.case.caseCode} · ` : ""}${document.case.title}`,
            ].join("\n"),
        }

        const userMsg: AiChatMessage = {
            role: "user",
            content,
        }

        const status = getAiRuntimeStatus()
        const result = await aiChat({ model: status.defaultModel, messages: [developer, userMsg], temperature: 0.2, maxTokens: 2000 })

        const invocationId = randomUUID()
        const prompt = JSON.stringify([developer, userMsg])
        const invocationContext = toPrismaJson({
            caseId: document.caseId,
            documentId: document.id,
            analysisType,
            contentSource,
        })

        if (!result.ok) {
            await prisma.aIInvocation.create({
                data: {
                    id: invocationId,
                    tenantId,
                    userId: user.id,
                    conversationId: null,
                    type: "DOCUMENT_ANALYSIS",
                    context: invocationContext,
                    prompt,
                    response: null,
                    provider: status.provider,
                    model: status.defaultModel,
                    status: "ERROR",
                    error: result.error,
                    tokenUsage: undefined,
                },
            })
            return { success: false as const, error: result.error }
        }

        const output = (result.value.content || "").trim()
        if (!output) {
            const error = "AI 返回为空，请稍后重试"
            await prisma.aIInvocation.create({
                data: {
                    id: invocationId,
                    tenantId,
                    userId: user.id,
                    conversationId: null,
                    type: "DOCUMENT_ANALYSIS",
                    context: invocationContext,
                    prompt,
                    response: null,
                    provider: status.provider,
                    model: status.defaultModel,
                    status: "ERROR",
                    error,
                    tokenUsage: result.value.usage ? toPrismaJson(result.value.usage) : undefined,
                },
            })
            return { success: false as const, error }
        }

        await prisma.aIInvocation.create({
            data: {
                id: invocationId,
                tenantId,
                userId: user.id,
                conversationId: null,
                type: "DOCUMENT_ANALYSIS",
                context: invocationContext,
                prompt,
                response: output,
                provider: status.provider,
                model: status.defaultModel,
                status: "SUCCESS",
                error: null,
                tokenUsage: result.value.usage ? toPrismaJson(result.value.usage) : undefined,
            },
        })

        return { success: true as const, data: { invocationId, content: output } }
    } catch (error) {
        logger.error("analyzeDocumentById failed", error)
        return { success: false as const, error: getPublicActionErrorMessage(error, "AI 审查失败") }
    }
}
