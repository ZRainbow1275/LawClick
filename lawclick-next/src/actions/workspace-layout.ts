"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { getActiveTenantContextOrThrow, hasTenantPermission } from "@/lib/server-auth"
import type { Permission } from "@/lib/permissions"
import { checkRateLimit } from "@/lib/rate-limit"
import { z } from "zod"
import { logger } from "@/lib/logger"
import { GridLayoutItemSchema } from "@/lib/zod-grid-layout"
import type { ActionResponse } from "@/lib/action-response"
import {
    DEFAULT_WORKSPACE_CONFIG_VERSION,
    WORKSPACE_WIDGET_DEFINITIONS,
    getWorkspaceWidgetMetaById,
    type WorkspaceConfig,
    type WorkspaceGridItem,
    type WorkspaceWidgetInstance,
} from "@/lib/workspace-widgets"
import type { Prisma } from "@prisma/client"

const WorkspaceKeySchema = z.string().trim().min(1).max(200)

const WorkspaceWidgetInstanceSchema = z
    .object({
        id: z.string().trim().min(1).max(64),
        type: z.string().trim().min(1).max(64),
    })
    .strict()

const WorkspaceConfigSchema = z
    .object({
        configVersion: z.number().int().min(1),
        widgets: z.array(WorkspaceWidgetInstanceSchema).max(100),
        layout: z.array(GridLayoutItemSchema).max(500),
    })
    .strict()

type TenantPermissionCtx = Parameters<typeof hasTenantPermission>[0]
type WorkspaceConfigInput = z.infer<typeof WorkspaceConfigSchema>

function buildDefaultWorkspaceConfigForCtx(ctx: TenantPermissionCtx): WorkspaceConfig {
    return buildDefaultWorkspaceConfig((p) => hasTenantPermission(ctx, p))
}

function buildDefaultWorkspaceConfig(has: (permission: Permission) => boolean): WorkspaceConfig {
    const widgets: WorkspaceWidgetInstance[] = [
        { id: "w_page", type: "page" },
        ...(has("case:view") ? [{ id: "w_timer", type: "timer" } as const] : []),
    ]

    const widgetIds = new Set(widgets.map((w) => w.id))

    const layout: WorkspaceGridItem[] = [
        {
            i: "w_page",
            x: 0,
            y: 0,
            ...(getWorkspaceWidgetMetaById("w_page")?.defaultSize || { w: 12, h: 18, minW: 6, minH: 10 }),
        },
        ...(widgetIds.has("w_timer")
            ? [
                  {
                      i: "w_timer",
                      x: 8,
                      y: 0,
                      ...(getWorkspaceWidgetMetaById("w_timer")?.defaultSize || { w: 4, h: 10, minW: 3, minH: 8 }),
                  } satisfies WorkspaceGridItem,
              ]
            : []),
    ].filter((item) => widgetIds.has(item.i))

    return { configVersion: DEFAULT_WORKSPACE_CONFIG_VERSION, widgets, layout }
}

function toWorkspaceConfigJson(config: WorkspaceConfig): Prisma.InputJsonValue {
    return config as unknown as Prisma.InputJsonValue
}

function sanitizeConfigForCtx(ctx: TenantPermissionCtx, input: WorkspaceConfigInput): WorkspaceConfig {
    return sanitizeConfig((p) => hasTenantPermission(ctx, p), input)
}

function sanitizeConfig(has: (permission: Permission) => boolean, input: WorkspaceConfigInput): WorkspaceConfig {
    const configVersion =
        typeof input.configVersion === "number" ? input.configVersion : DEFAULT_WORKSPACE_CONFIG_VERSION

    const allowedWidgetIds = new Set(
        WORKSPACE_WIDGET_DEFINITIONS.filter((w) => w.requiredPermissions.every((p) => has(p))).map((w) => w.id)
    )

    const requestedWidgets = Array.isArray(input.widgets) ? input.widgets : []
    const requestedLayout = Array.isArray(input.layout) ? input.layout : []

    const widgets: WorkspaceWidgetInstance[] = []
    const seen = new Set<string>()

    for (const w of requestedWidgets) {
        if (!w?.id || typeof w.id !== "string") continue
        if (!allowedWidgetIds.has(w.id)) continue
        if (seen.has(w.id)) continue
        const meta = getWorkspaceWidgetMetaById(w.id)
        if (!meta) continue
        widgets.push({ id: meta.id, type: meta.type })
        seen.add(w.id)
    }

    if (!seen.has("w_page") && allowedWidgetIds.has("w_page")) {
        const meta = getWorkspaceWidgetMetaById("w_page")
        if (meta) {
            widgets.unshift({ id: meta.id, type: meta.type })
            seen.add(meta.id)
        }
    }

    const widgetIds = new Set(widgets.map((w) => w.id))
    const layout: WorkspaceGridItem[] = requestedLayout.filter((item) => item?.i && widgetIds.has(item.i))

    if (!layout.some((l) => l.i === "w_page") && widgetIds.has("w_page")) {
        const meta = getWorkspaceWidgetMetaById("w_page")
        layout.unshift({
            i: "w_page",
            x: 0,
            y: 0,
            ...(meta?.defaultSize || { w: 12, h: 18, minW: 6, minH: 10 }),
        })
    }

    return { configVersion, widgets, layout }
}

function extractPageWorkspacePath(workspaceKey: string) {
    const key = workspaceKey.trim()
    if (!key.startsWith("page:")) return null
    const rest = key.slice("page:".length)
    const pathPart = rest.split("::")[0] || ""
    if (!pathPart.startsWith("/")) return null
    return pathPart || null
}

function extractLegacyPageWorkspaceKey(workspaceKey: string) {
    const path = extractPageWorkspacePath(workspaceKey)
    if (!path) return null
    const legacy = `page:${path}`
    return legacy === workspaceKey ? null : legacy
}

function extractRevalidatePath(workspaceKey: string) {
    return extractPageWorkspacePath(workspaceKey)
}

export async function getMyWorkspaceConfig(
    workspaceKey: string
): Promise<ActionResponse<{ data: WorkspaceConfig }, { data: WorkspaceConfig }>> {
    try {
        const parsedKey = WorkspaceKeySchema.safeParse(workspaceKey)
        if (!parsedKey.success) {
            return {
                success: false,
                error: "输入校验失败",
                data: buildDefaultWorkspaceConfig(() => false),
            }
        }
        workspaceKey = parsedKey.data

        const ctx = await getActiveTenantContextOrThrow()
        const { user, tenantId } = ctx

        const rate = await checkRateLimit({
            key: `workspace-layout:get:${tenantId}:${user.id}`,
            limit: 300,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            logger.warn("workspace-layout.get rate limited", { tenantId, userId: user.id })
            return { success: false, error: "请求过于频繁，请稍后重试", data: buildDefaultWorkspaceConfigForCtx(ctx) }
        }

        const legacyKey = extractLegacyPageWorkspaceKey(workspaceKey)

        const existing = await prisma.dashboardLayout.findUnique({
            where: { userId_dashboardKey: { userId: user.id, dashboardKey: workspaceKey } },
            select: { id: true, config: true },
        })

        if (existing?.config) {
            const parsedExisting = WorkspaceConfigSchema.safeParse(existing.config)
            const sanitized = sanitizeConfigForCtx(ctx, parsedExisting.success ? parsedExisting.data : buildDefaultWorkspaceConfigForCtx(ctx))
            const changed = JSON.stringify(sanitized) !== JSON.stringify(existing.config)
            if (changed) {
                await prisma.dashboardLayout.update({
                    where: { id: existing.id },
                    data: { config: toWorkspaceConfigJson(sanitized) },
                })
            }
            return { success: true, data: sanitized }
        }

        if (legacyKey) {
            const legacy = await prisma.dashboardLayout.findUnique({
                where: { userId_dashboardKey: { userId: user.id, dashboardKey: legacyKey } },
                select: { config: true },
            })

            if (legacy?.config) {
                const parsedLegacy = WorkspaceConfigSchema.safeParse(legacy.config)
                const sanitized = sanitizeConfigForCtx(
                    ctx,
                    parsedLegacy.success ? parsedLegacy.data : buildDefaultWorkspaceConfigForCtx(ctx)
                )

                await prisma.dashboardLayout.upsert({
                    where: { userId_dashboardKey: { userId: user.id, dashboardKey: workspaceKey } },
                    create: { userId: user.id, dashboardKey: workspaceKey, config: toWorkspaceConfigJson(sanitized) },
                    update: { config: toWorkspaceConfigJson(sanitized) },
                })

                return { success: true, data: sanitized }
            }
        }

        const defaultConfig = buildDefaultWorkspaceConfigForCtx(ctx)

        await prisma.dashboardLayout.upsert({
            where: { userId_dashboardKey: { userId: user.id, dashboardKey: workspaceKey } },
            create: { userId: user.id, dashboardKey: workspaceKey, config: toWorkspaceConfigJson(defaultConfig) },
            update: { config: toWorkspaceConfigJson(defaultConfig) },
        })

        return { success: true, data: defaultConfig }
    } catch (error) {
        logger.error("获取页面布局失败", error, { workspaceKey })
        return {
            success: false,
            error: "获取页面布局失败",
            data: buildDefaultWorkspaceConfig(() => false),
        }
    }
}

export async function saveMyWorkspaceConfig(input: unknown): Promise<ActionResponse> {
    try {
        const parsed = z.object({ workspaceKey: WorkspaceKeySchema, config: WorkspaceConfigSchema }).strict().safeParse(input)
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        const request = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        const { user, tenantId } = ctx

        const rate = await checkRateLimit({
            key: `workspace-layout:save:${tenantId}:${user.id}`,
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            logger.warn("workspace-layout.save rate limited", { tenantId, userId: user.id })
            return { success: false, error: "请求过于频繁，请稍后重试" }
        }

        const config = sanitizeConfigForCtx(ctx, request.config)

        await prisma.dashboardLayout.upsert({
            where: { userId_dashboardKey: { userId: user.id, dashboardKey: request.workspaceKey } },
            create: { userId: user.id, dashboardKey: request.workspaceKey, config: toWorkspaceConfigJson(config) },
            update: { config: toWorkspaceConfigJson(config) },
        })

        const revalidate = extractRevalidatePath(request.workspaceKey)
        if (revalidate) revalidatePath(revalidate)

        return { success: true }
    } catch (error) {
        logger.error("保存页面布局失败", error)
        return { success: false, error: "保存页面布局失败" }
    }
}

export async function resetMyWorkspaceConfig(
    workspaceKey: string
): Promise<ActionResponse<{ data: WorkspaceConfig }, { data?: WorkspaceConfig }>> {
    try {
        const parsedKey = WorkspaceKeySchema.safeParse(workspaceKey)
        if (!parsedKey.success) {
            return { success: false, error: "输入校验失败" }
        }
        workspaceKey = parsedKey.data

        const ctx = await getActiveTenantContextOrThrow()
        const { user, tenantId } = ctx

        const rate = await checkRateLimit({
            key: `workspace-layout:reset:${tenantId}:${user.id}`,
            limit: 60,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            logger.warn("workspace-layout.reset rate limited", { tenantId, userId: user.id })
            return { success: false, error: "请求过于频繁，请稍后重试" }
        }

        const config = buildDefaultWorkspaceConfigForCtx(ctx)

        await prisma.dashboardLayout.upsert({
            where: { userId_dashboardKey: { userId: user.id, dashboardKey: workspaceKey } },
            create: { userId: user.id, dashboardKey: workspaceKey, config: toWorkspaceConfigJson(config) },
            update: { config: toWorkspaceConfigJson(config) },
        })

        const revalidate = extractRevalidatePath(workspaceKey)
        if (revalidate) revalidatePath(revalidate)

        return { success: true, data: config }
    } catch (error) {
        logger.error("重置页面布局失败", error, { workspaceKey })
        return { success: false, error: "重置页面布局失败" }
    }
}
