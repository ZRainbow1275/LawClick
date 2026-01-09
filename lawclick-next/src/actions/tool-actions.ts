"use server"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { revalidatePath } from "next/cache"
import { getActiveTenantContextWithPermissionOrThrow, hasTenantPermission } from "@/lib/server-auth"
import type { InvocationStatus, Prisma } from "@prisma/client"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import { JsonValueSchema, NullableNonEmptyString, OptionalNonEmptyString, UuidSchema } from "@/lib/zod"
import { ensureWebhookUrlSafe } from "@/lib/webhook-safety"
import { TaskType } from "@/lib/queue"
import { QUEUE_TASK_PRIORITY } from "@/lib/queue-policy"

// ==============================================================================
// 工具模块管理 Actions
// ==============================================================================

type ToolModuleCategory = string

const ToolCategorySchema = OptionalNonEmptyString(64)

const GetToolModulesInputSchema = z
    .object({
        category: ToolCategorySchema,
        options: z.object({ includeInactive: z.boolean().optional() }).strict().optional(),
    })
    .strict()

const ToolModuleUrlSchema = z.string().url("URL 格式不正确").refine((v) => v.startsWith("https://"), { message: "仅允许 https URL" })

const CreateToolModuleInputSchema = z
    .object({
        name: z.string().trim().min(1, "名称不能为空").max(200),
        description: OptionalNonEmptyString(2000),
        icon: OptionalNonEmptyString(200),
        url: ToolModuleUrlSchema.optional(),
        webhookUrl: ToolModuleUrlSchema.optional(),
        category: z.string().trim().min(1, "分类不能为空").max(64),
        isActive: z.boolean().optional(),
        sortOrder: z.number().int().min(0).max(10_000).optional(),
    })
    .strict()

const UpdateToolModuleInputSchema = z
    .object({
        name: OptionalNonEmptyString(200),
        description: NullableNonEmptyString(2000),
        icon: NullableNonEmptyString(200),
        url: ToolModuleUrlSchema.nullable().optional(),
        webhookUrl: ToolModuleUrlSchema.nullable().optional(),
        category: OptionalNonEmptyString(64),
        isActive: z.boolean().optional(),
        sortOrder: z.number().int().min(0).max(10_000).optional(),
    })
    .strict()
    .refine((v) => Object.values(v).some((value) => value !== undefined), { message: "没有需要更新的字段" })

// 获取所有工具模块
export async function getToolModules(
    category?: ToolModuleCategory,
    options?: { includeInactive?: boolean }
) {
    try {
        const parsed = GetToolModulesInputSchema.safeParse({ category, options })
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败", data: [] }
        }
        category = parsed.data.category
        options = parsed.data.options

        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:view")
        const rate = await enforceRateLimit({ ctx, action: "tools.modules.list", limit: 600 })
        if (!rate.allowed) return { success: false as const, error: rate.error, data: [] }

        const { tenantId } = ctx
        const canManage = hasTenantPermission(ctx, "tools:manage")

        const where: Prisma.ToolModuleWhereInput = { tenantId }
        if (!options?.includeInactive || !canManage) {
            where.isActive = true
        }
        if (category) where.category = category

        const modules = await prisma.toolModule.findMany({
            where,
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            take: 200,
        })

        return { success: true as const, data: modules }
    } catch (error) {
        logger.error("获取工具模块失败", error)
        return { success: false as const, error: '获取工具模块失败', data: [] }
    }
}

// 创建工具模块（管理员功能）
export async function createToolModule(data: {
    name: string
    description?: string
    icon?: string
    url?: string
    webhookUrl?: string
    category: string
    isActive?: boolean
    sortOrder?: number
}) {
    try {
        const parsed = CreateToolModuleInputSchema.safeParse(data)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        data = parsed.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("tools:manage")
        const rate = await enforceRateLimit({
            ctx,
            action: "tools.modules.create",
            limit: 60,
            extraKey: data.category,
        })
        if (!rate.allowed) return { success: false as const, error: rate.error }

        const { tenantId } = ctx

        if (data.webhookUrl) {
            const safe = await ensureWebhookUrlSafe(data.webhookUrl)
            if (safe.ok === false) {
                logger.warn("工具模块 Webhook URL 被拒绝（创建阶段）", { tenantId, error: safe.error })
                return { success: false as const, error: safe.error }
            }
        }

        const toolModule = await prisma.toolModule.create({
            data: {
                tenantId,
                name: data.name,
                description: data.description,
                icon: data.icon,
                url: data.url,
                webhookUrl: data.webhookUrl,
                category: data.category,
                isActive: typeof data.isActive === "boolean" ? data.isActive : true,
                sortOrder: data.sortOrder || 0,
            },
        })

        revalidatePath('/tools')
        return { success: true as const, data: toolModule }
    } catch (error) {
        logger.error("创建工具模块失败", error)
        return { success: false as const, error: '创建工具模块失败' }
    }
}

// 更新工具模块
export async function updateToolModule(id: string, data: {
    name?: string
    description?: string | null
    icon?: string | null
    url?: string | null
    webhookUrl?: string | null
    category?: string
    isActive?: boolean
    sortOrder?: number
}) {
    try {
        const parsed = z
            .object({ id: UuidSchema, data: UpdateToolModuleInputSchema })
            .strict()
            .safeParse({ id, data })
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        id = parsed.data.id
        data = parsed.data.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("tools:manage")
        const rate = await enforceRateLimit({
            ctx,
            action: "tools.modules.update",
            limit: 120,
            extraKey: id,
        })
        if (!rate.allowed) return { success: false as const, error: rate.error }

        const { tenantId } = ctx

        if (typeof data.webhookUrl === "string" && data.webhookUrl) {
            const safe = await ensureWebhookUrlSafe(data.webhookUrl)
            if (safe.ok === false) {
                logger.warn("工具模块 Webhook URL 被拒绝（更新阶段）", { tenantId, moduleId: id, error: safe.error })
                return { success: false as const, error: safe.error }
            }
        }

        const updated = await prisma.toolModule.updateMany({ where: { id, tenantId }, data })
        if (updated.count === 0) {
            return { success: false as const, error: "模块不存在" }
        }

        const toolModule = await prisma.toolModule.findFirst({ where: { id, tenantId } })
        if (!toolModule) {
            return { success: false as const, error: "模块不存在" }
        }

        revalidatePath('/tools')
        return { success: true as const, data: toolModule }
    } catch (error) {
        logger.error("更新工具模块失败", error)
        return { success: false as const, error: '更新工具模块失败' }
    }
}

// 删除工具模块
export async function deleteToolModule(id: string) {
    try {
        const parsedId = UuidSchema.safeParse(id)
        if (!parsedId.success) {
            return { success: false as const, error: "输入校验失败" }
        }
        id = parsedId.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("tools:manage")
        const rate = await enforceRateLimit({
            ctx,
            action: "tools.modules.delete",
            limit: 60,
            extraKey: id,
        })
        if (!rate.allowed) return { success: false as const, error: rate.error }

        const { tenantId } = ctx

        const deleted = await prisma.toolModule.deleteMany({ where: { id, tenantId } })
        if (deleted.count === 0) {
            return { success: false as const, error: "模块不存在" }
        }

        revalidatePath('/tools')
        return { success: true as const }
    } catch (error) {
        logger.error("删除工具模块失败", error)
        return { success: false as const, error: '删除工具模块失败' }
    }
}

// 调用外部模块Webhook（N8N接入）
export async function triggerModuleWebhook(moduleId: string, payload?: Prisma.InputJsonValue) {
    const parsed = z
        .object({ moduleId: UuidSchema, payload: JsonValueSchema.optional() })
        .strict()
        .safeParse({ moduleId, payload })
    if (!parsed.success) {
        return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
    }
    moduleId = parsed.data.moduleId
    payload = parsed.data.payload as Prisma.InputJsonValue | undefined

    const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:view")
    const rate = await enforceRateLimit({
        ctx,
        action: "tools.webhook.trigger",
        limit: 60,
        extraKey: moduleId,
    })
    if (!rate.allowed) return { success: false as const, error: rate.error }

    const { user, tenantId } = ctx
    const toolModule = await prisma.toolModule.findFirst({ where: { id: moduleId, tenantId } })

    if (!toolModule || !toolModule.isActive) {
        return { success: false as const, error: "模块不存在或已停用" }
    }
    if (!toolModule.webhookUrl) {
        return { success: false as const, error: "该模块未配置 Webhook" }
    }

    const invocationId = randomUUID()
    const basePayload: Prisma.InputJsonObject = {
        invocationId,
        tenantId,
        moduleId: toolModule.id,
        moduleName: toolModule.name,
        userId: user.id,
        userEmail: user.email,
        timestamp: new Date().toISOString(),
        payload: payload ?? {},
    }

    const safe = await ensureWebhookUrlSafe(toolModule.webhookUrl)
    if (safe.ok === false) {
        await prisma.toolInvocation.create({
            data: {
                id: invocationId,
                tenantId,
                toolModuleId: toolModule.id,
                userId: user.id,
                payload: basePayload,
                response: undefined,
                status: "ERROR",
                error: safe.error,
            },
        })
        return { success: false as const, error: safe.error }
    }

    try {
        await prisma.$transaction(async (tx) => {
            await tx.toolInvocation.create({
                data: {
                    id: invocationId,
                    tenantId,
                    toolModuleId: toolModule.id,
                    userId: user.id,
                    payload: basePayload,
                    response: undefined,
                    status: "PENDING",
                    error: null,
                },
            })

            await tx.taskQueue.create({
                data: {
                    tenantId,
                    type: TaskType.TRIGGER_TOOL_WEBHOOK,
                    idempotencyKey: `tool-webhook/${invocationId}`,
                    priority: QUEUE_TASK_PRIORITY[TaskType.TRIGGER_TOOL_WEBHOOK],
                    maxAttempts: 6,
                    payload: { invocationId } satisfies Prisma.InputJsonValue,
                },
            })
        })

        return { success: true as const, data: { invocationId } }
    } catch (error) {
        logger.error("触发 Webhook 入队失败", error)
        return { success: false as const, error: "Webhook 入队失败，请稍后重试" }
    }
}

export type ToolInvocationListItem = {
    id: string
    status: InvocationStatus
    error: string | null
    createdAt: string
    toolModule: { id: string; name: string }
    user: { id: string; name: string | null; email: string }
}

export async function getToolInvocations(moduleId?: string, options?: { take?: number }) {
    const parsed = z
        .object({
            moduleId: UuidSchema.optional(),
            options: z
                .object({
                    take: z.number().int().min(1).max(50).optional(),
                })
                .strict()
                .optional(),
        })
        .strict()
        .safeParse({ moduleId, options })
    if (!parsed.success) {
        return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败", data: [] as ToolInvocationListItem[] }
    }

    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:view")
        const rate = await enforceRateLimit({
            ctx,
            action: "tools.invocations.list",
            limit: 600,
            ...(parsed.data.moduleId ? { extraKey: parsed.data.moduleId } : {}),
        })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [] as ToolInvocationListItem[] }
        }

        const { user, tenantId } = ctx
        const canManage = hasTenantPermission(ctx, "tools:manage")

        const take = parsed.data.options?.take ?? 20
        const rows = await prisma.toolInvocation.findMany({
            where: {
                tenantId,
                ...(canManage ? {} : { userId: user.id }),
                ...(parsed.data.moduleId ? { toolModuleId: parsed.data.moduleId } : {}),
            },
            orderBy: [{ createdAt: "desc" }],
            take,
            select: {
                id: true,
                status: true,
                error: true,
                createdAt: true,
                toolModule: { select: { id: true, name: true } },
                user: { select: { id: true, name: true, email: true } },
            },
        })

        const data: ToolInvocationListItem[] = rows.map((row) => ({
            id: row.id,
            status: row.status,
            error: row.error,
            createdAt: row.createdAt.toISOString(),
            toolModule: row.toolModule,
            user: row.user,
        }))

        return { success: true as const, data }
    } catch (error) {
        logger.error("获取调用记录失败", error)
        return { success: false as const, error: "获取调用记录失败", data: [] as ToolInvocationListItem[] }
    }
}

export type ToolInvocationDetail = {
    id: string
    status: InvocationStatus
    error: string | null
    createdAt: string
    toolModule: { id: string; name: string }
    user: { id: string; name: string | null; email: string }
    payload: Prisma.JsonValue | null
    response: Prisma.JsonValue | null
}

export async function getToolInvocationDetail(invocationId: string) {
    const parsed = z.object({ invocationId: UuidSchema }).strict().safeParse({ invocationId })
    if (!parsed.success) {
        return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
    }

    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:view")
        const rate = await enforceRateLimit({
            ctx,
            action: "tools.invocations.detail",
            limit: 600,
            extraKey: parsed.data.invocationId,
        })
        if (!rate.allowed) return { success: false as const, error: rate.error }

        const { user, tenantId } = ctx
        const canManage = hasTenantPermission(ctx, "tools:manage")

        const row = await prisma.toolInvocation.findFirst({
            where: { id: parsed.data.invocationId, tenantId, ...(canManage ? {} : { userId: user.id }) },
            select: {
                id: true,
                status: true,
                error: true,
                createdAt: true,
                payload: true,
                response: true,
                toolModule: { select: { id: true, name: true } },
                user: { select: { id: true, name: true, email: true } },
            },
        })

        if (!row) {
            return { success: false as const, error: "调用记录不存在" }
        }

        const detail: ToolInvocationDetail = {
            id: row.id,
            status: row.status,
            error: row.error,
            createdAt: row.createdAt.toISOString(),
            toolModule: row.toolModule,
            user: row.user,
            payload: row.payload,
            response: row.response,
        }

        return { success: true as const, data: detail }
    } catch (error) {
        logger.error("获取调用详情失败", error)
        return { success: false as const, error: "获取调用详情失败" }
    }
}
