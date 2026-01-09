"use server"

import { revalidatePath } from "next/cache"
import type { Prisma } from "@prisma/client"
import { z } from "zod"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { getActiveTenantContextOrThrow } from "@/lib/server-auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { GridLayoutItemSchema } from "@/lib/zod-grid-layout"
import type { ActionResponse } from "@/lib/action-response"
import {
    DEFAULT_SECTION_WORKSPACE_CONFIG_VERSION,
    type SectionWorkspaceConfig,
    type SectionBlockInstance,
} from "@/lib/section-workspace"

const WorkspaceKeySchema = z.string().trim().min(1).max(200)

const SectionBlockSchema: z.ZodType<SectionBlockInstance> = z
    .object({
        id: z.string().trim().min(1).max(64),
    })
    .strict()

const SectionWorkspaceConfigSchema: z.ZodType<SectionWorkspaceConfig> = z
    .object({
        configVersion: z.number().int().min(1),
        blocks: z.array(SectionBlockSchema).max(200),
        layout: z.array(GridLayoutItemSchema).max(800),
    })
    .strict()

type SectionWorkspaceConfigInput = z.infer<typeof SectionWorkspaceConfigSchema>

const LegacyDashboardConfigSchema = z
    .object({
        configVersion: z.number().int().min(1),
        widgets: z
            .array(
                z
                    .object({
                        id: z.string().trim().min(1).max(64),
                        type: z.string().trim().min(1).max(64),
                    })
                    .strict()
            )
            .max(100),
        layout: z.array(GridLayoutItemSchema).max(500),
    })
    .strict()

function buildEmptyConfig(): SectionWorkspaceConfig {
    return {
        configVersion: DEFAULT_SECTION_WORKSPACE_CONFIG_VERSION,
        blocks: [],
        layout: [],
    }
}

function toSectionWorkspaceConfigJson(config: SectionWorkspaceConfig): Prisma.InputJsonValue {
    return config as unknown as Prisma.InputJsonValue
}

function sanitizeConfig(input: SectionWorkspaceConfigInput): SectionWorkspaceConfig {
    const configVersion =
        typeof input.configVersion === "number" ? input.configVersion : DEFAULT_SECTION_WORKSPACE_CONFIG_VERSION

    const blocks: SectionBlockInstance[] = []
    const seen = new Set<string>()
    for (const block of input.blocks) {
        const id = (block?.id || "").trim()
        if (!id) continue
        if (id.length > 64) continue
        if (seen.has(id)) continue
        blocks.push({ id })
        seen.add(id)
        if (blocks.length >= 200) break
    }

    const allowedIds = new Set(blocks.map((b) => b.id))
    const layout = input.layout.filter((item) => allowedIds.has(item.i)).slice(0, 800)

    return { configVersion, blocks, layout }
}

function extractRevalidatePath(workspaceKey: string) {
    const key = workspaceKey.trim()
    if (!key.startsWith("section:")) return null
    const rest = key.slice("section:".length)
    const path = rest.split("::")[0] || ""
    if (!path.startsWith("/")) return null
    if (path.includes(":")) return null
    return path
}

function isDashboardMainSectionKey(workspaceKey: string) {
    return workspaceKey.trim() === "section:/dashboard::main"
}

function mapLegacyDashboardConfigToSection(legacy: z.infer<typeof LegacyDashboardConfigSchema>): SectionWorkspaceConfig {
    const mapWidgetIdToBlockId: Record<string, string> = {
        w_cases: "b_cases_kanban",
        w_tasks: "b_my_tasks",
        w_events: "b_upcoming_events",
        w_time: "b_time_summary",
        w_recent_documents: "b_recent_documents",
        w_firm_overview: "b_firm_overview",
    }

    const blocks: SectionBlockInstance[] = []
    const seen = new Set<string>()
    for (const widget of legacy.widgets || []) {
        const blockId = mapWidgetIdToBlockId[widget.id]
        if (!blockId) continue
        if (seen.has(blockId)) continue
        seen.add(blockId)
        blocks.push({ id: blockId })
    }

    const layout = (legacy.layout || [])
        .map((item) => ({ ...item, i: mapWidgetIdToBlockId[item.i] || item.i }))
        .filter((item) => blocks.some((b) => b.id === item.i))

    return {
        configVersion: DEFAULT_SECTION_WORKSPACE_CONFIG_VERSION,
        blocks,
        layout,
    }
}

export async function getMySectionWorkspaceConfig(
    workspaceKey: string
): Promise<ActionResponse<{ data: SectionWorkspaceConfig }, { data: SectionWorkspaceConfig }>> {
    try {
        const parsedKey = WorkspaceKeySchema.safeParse(workspaceKey)
        if (!parsedKey.success) {
            return { success: false, error: "输入校验失败", data: buildEmptyConfig() }
        }
        workspaceKey = parsedKey.data

        const ctx = await getActiveTenantContextOrThrow()
        const { user, tenantId } = ctx

        const rate = await checkRateLimit({
            key: `section-layout:get:${tenantId}:${user.id}`,
            limit: 600,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            logger.warn("section-layout.get rate limited", { tenantId, userId: user.id })
            return { success: false, error: "请求过于频繁，请稍后重试", data: buildEmptyConfig() }
        }

        const existing = await prisma.dashboardLayout.findUnique({
            where: { userId_dashboardKey: { userId: user.id, dashboardKey: workspaceKey } },
            select: { id: true, config: true },
        })

        const existingConfig = existing?.config
        const parsedExisting = existingConfig ? SectionWorkspaceConfigSchema.safeParse(existingConfig) : null
        const sanitizedExisting =
            parsedExisting && parsedExisting.success ? sanitizeConfig(parsedExisting.data) : null

        if (isDashboardMainSectionKey(workspaceKey) && (!sanitizedExisting || sanitizedExisting.blocks.length === 0)) {
            const legacy = await prisma.dashboardLayout.findUnique({
                where: { userId_dashboardKey: { userId: user.id, dashboardKey: "default" } },
                select: { config: true },
            })
            const parsedLegacy = legacy?.config ? LegacyDashboardConfigSchema.safeParse(legacy.config) : null
            if (parsedLegacy?.success) {
                const migrated = mapLegacyDashboardConfigToSection(parsedLegacy.data)
                await prisma.dashboardLayout.upsert({
                    where: { userId_dashboardKey: { userId: user.id, dashboardKey: workspaceKey } },
                    create: { userId: user.id, dashboardKey: workspaceKey, config: toSectionWorkspaceConfigJson(migrated) },
                    update: { config: toSectionWorkspaceConfigJson(migrated) },
                })
                return { success: true, data: migrated }
            }
        }

        if (existing?.config) {
            const sanitized = sanitizedExisting || buildEmptyConfig()
            const changed = JSON.stringify(sanitized) !== JSON.stringify(existing.config)
            if (changed) {
                await prisma.dashboardLayout.update({
                    where: { id: existing.id },
                    data: { config: toSectionWorkspaceConfigJson(sanitized) },
                })
            }
            return { success: true, data: sanitized }
        }

        const emptyConfig = buildEmptyConfig()
        await prisma.dashboardLayout.upsert({
            where: { userId_dashboardKey: { userId: user.id, dashboardKey: workspaceKey } },
            create: { userId: user.id, dashboardKey: workspaceKey, config: toSectionWorkspaceConfigJson(emptyConfig) },
            update: { config: toSectionWorkspaceConfigJson(emptyConfig) },
        })
        return { success: true, data: emptyConfig }
    } catch (error) {
        logger.error("获取区块布局失败", error, { workspaceKey })
        return { success: false, error: "获取区块布局失败", data: buildEmptyConfig() }
    }
}

export async function saveMySectionWorkspaceConfig(input: unknown): Promise<ActionResponse> {
    try {
        const parsed = z
            .object({ workspaceKey: WorkspaceKeySchema, config: SectionWorkspaceConfigSchema })
            .strict()
            .safeParse(input)
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        const request = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        const { user, tenantId } = ctx

        const rate = await checkRateLimit({
            key: `section-layout:save:${tenantId}:${user.id}`,
            limit: 180,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            logger.warn("section-layout.save rate limited", { tenantId, userId: user.id })
            return { success: false, error: "请求过于频繁，请稍后重试" }
        }

        const config = sanitizeConfig(request.config)

        await prisma.dashboardLayout.upsert({
            where: { userId_dashboardKey: { userId: user.id, dashboardKey: request.workspaceKey } },
            create: { userId: user.id, dashboardKey: request.workspaceKey, config: toSectionWorkspaceConfigJson(config) },
            update: { config: toSectionWorkspaceConfigJson(config) },
        })

        const path = extractRevalidatePath(request.workspaceKey)
        if (path) revalidatePath(path)

        return { success: true }
    } catch (error) {
        logger.error("保存区块布局失败", error)
        return { success: false, error: "保存区块布局失败" }
    }
}

export async function resetMySectionWorkspaceConfig(workspaceKey: string): Promise<ActionResponse> {
    try {
        const parsedKey = WorkspaceKeySchema.safeParse(workspaceKey)
        if (!parsedKey.success) {
            return { success: false, error: "输入校验失败" }
        }
        workspaceKey = parsedKey.data

        const ctx = await getActiveTenantContextOrThrow()
        const { user, tenantId } = ctx

        const rate = await checkRateLimit({
            key: `section-layout:reset:${tenantId}:${user.id}`,
            limit: 60,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            logger.warn("section-layout.reset rate limited", { tenantId, userId: user.id })
            return { success: false, error: "请求过于频繁，请稍后重试" }
        }

        await prisma.dashboardLayout.deleteMany({
            where: { userId: user.id, dashboardKey: workspaceKey },
        })

        const path = extractRevalidatePath(workspaceKey)
        if (path) revalidatePath(path)

        return { success: true }
    } catch (error) {
        logger.error("重置区块布局失败", error)
        return { success: false, error: "重置区块布局失败" }
    }
}
