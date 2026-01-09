"use server"

import { z } from "zod"

import { userSettingsRepository } from "@/lib/user-settings"
import { checkRateLimit } from "@/lib/rate-limit"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { logger } from "@/lib/logger"
import { getActiveTenantContextOrThrow } from "@/lib/server-auth"

const WorkspaceKeySchema = z.string().trim().min(1).max(200)

const WorkspaceNoteSchema = z
    .object({
        version: z.number().int().min(1),
        content: z.string().max(20_000),
        updatedAt: z.string().datetime(),
    })
    .strict()

export type WorkspaceNote = z.infer<typeof WorkspaceNoteSchema>

function buildWorkspaceNoteSettingKey(tenantId: string, workspaceKey: string) {
    return `workspace_note:${tenantId}:${workspaceKey}`
}

function buildDefaultWorkspaceNote(): WorkspaceNote {
    return { version: 1, content: "", updatedAt: new Date().toISOString() }
}

export async function getMyWorkspaceNote(workspaceKey: string) {
    try {
        const parsedKey = WorkspaceKeySchema.safeParse(workspaceKey)
        if (!parsedKey.success) {
            return { success: false as const, error: "输入校验失败", data: buildDefaultWorkspaceNote() }
        }
        workspaceKey = parsedKey.data

        const ctx = await getActiveTenantContextOrThrow()
        const { user, tenantId } = ctx

        const rate = await enforceRateLimit({
            ctx,
            action: "workspaceNotes.get",
            limit: 600,
            extraKey: workspaceKey,
        })
        if (!rate.allowed) {
            return {
                success: false as const,
                error: rate.error,
                data: buildDefaultWorkspaceNote(),
            }
        }

        const key = buildWorkspaceNoteSettingKey(tenantId, workspaceKey)        
        const raw = await userSettingsRepository.get(user.id, key)
        if (!raw) {
            const fallback = buildDefaultWorkspaceNote()
            return { success: true as const, data: fallback }
        }

        const parsed = WorkspaceNoteSchema.safeParse(raw)
        if (!parsed.success) {
            logger.warn("workspace note corrupted, fallback to empty", { userId: user.id, tenantId, key })
            const fallback = buildDefaultWorkspaceNote()
            await userSettingsRepository.upsert(user.id, key, fallback)
            return { success: true as const, data: fallback }
        }

        return { success: true as const, data: parsed.data }
    } catch (error) {
        logger.error("获取工作台便签失败", error)
        return { success: false as const, error: "获取工作台便签失败", data: buildDefaultWorkspaceNote() }
    }
}

export async function saveMyWorkspaceNote(input: unknown) {
    try {
        const parsed = z
            .object({
                workspaceKey: WorkspaceKeySchema,
                content: z.string().max(20_000),
            })
            .strict()
            .safeParse(input)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        const request = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        const { user, tenantId } = ctx

        const rate = await checkRateLimit({
            key: `workspace_note:save:${tenantId}:${user.id}:${request.workspaceKey}`,
            limit: 30,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return { success: false as const, error: "保存过于频繁，请稍后重试" }
        }

        const note: WorkspaceNote = {
            version: 1,
            content: request.content,
            updatedAt: new Date().toISOString(),
        }

        const key = buildWorkspaceNoteSettingKey(tenantId, request.workspaceKey)
        await userSettingsRepository.upsert(user.id, key, note)

        return { success: true as const, data: note }
    } catch (error) {
        logger.error("保存工作台便签失败", error)
        return { success: false as const, error: "保存工作台便签失败" }
    }
}

export async function resetMyWorkspaceNote(workspaceKey: string) {
    try {
        const parsedKey = WorkspaceKeySchema.safeParse(workspaceKey)
        if (!parsedKey.success) {
            return { success: false as const, error: "输入校验失败" }
        }
        workspaceKey = parsedKey.data

        const ctx = await getActiveTenantContextOrThrow()
        const { user, tenantId } = ctx

        const rate = await enforceRateLimit({
            ctx,
            action: "workspaceNotes.reset",
            limit: 60,
            extraKey: workspaceKey,
        })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }

        const key = buildWorkspaceNoteSettingKey(tenantId, workspaceKey)        
        const note = buildDefaultWorkspaceNote()
        await userSettingsRepository.upsert(user.id, key, note)

        return { success: true as const, data: note }
    } catch (error) {
        logger.error("重置工作台便签失败", error)
        return { success: false as const, error: "重置工作台便签失败" }
    }
}
