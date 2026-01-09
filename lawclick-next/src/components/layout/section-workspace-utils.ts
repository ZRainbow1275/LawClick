"use client"

import type { Layout } from "react-grid-layout/legacy"
import { z } from "zod"

import type { ActionResponse } from "@/lib/action-response"
import { findNextY } from "@/lib/react-grid-layout"
import { DEFAULT_SECTION_WORKSPACE_CONFIG_VERSION, type SectionWorkspaceConfig } from "@/lib/section-workspace"
import { GridLayoutItemSchema } from "@/lib/zod-grid-layout"

const WorkspaceKeySchema = z.string().trim().min(1).max(200)
const SectionBlockSchema: z.ZodType<{ id: string }> = z
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

const LOCAL_SECTION_LAYOUT_PREFIX = "lawclick-section-layout-v1:"

function buildLocalSectionLayoutStorageKey(workspaceKey: string) {
    return `${LOCAL_SECTION_LAYOUT_PREFIX}${workspaceKey}`
}

function buildLocalEmptyConfig(): SectionWorkspaceConfig {
    return {
        configVersion: DEFAULT_SECTION_WORKSPACE_CONFIG_VERSION,
        blocks: [],
        layout: [],
    }
}

export function buildFallbackSectionWorkspaceConfig(): SectionWorkspaceConfig {
    return {
        configVersion: DEFAULT_SECTION_WORKSPACE_CONFIG_VERSION,
        blocks: [],
        layout: [],
    }
}

export async function getMyLocalSectionWorkspaceConfig(
    workspaceKey: string
): Promise<ActionResponse<{ data: SectionWorkspaceConfig }, { data: SectionWorkspaceConfig }>> {
    const parsedKey = WorkspaceKeySchema.safeParse(workspaceKey)
    if (!parsedKey.success) {
        return { success: false, error: "输入校验失败", data: buildLocalEmptyConfig() }
    }
    workspaceKey = parsedKey.data

    try {
        const raw = localStorage.getItem(buildLocalSectionLayoutStorageKey(workspaceKey))
        if (!raw) return { success: true, data: buildLocalEmptyConfig() }

        const parsedJson = (() => {
            try {
                return JSON.parse(raw) as unknown
            } catch {
                return null
            }
        })()

        const parsedConfig = SectionWorkspaceConfigSchema.safeParse(parsedJson)
        if (!parsedConfig.success) {
            localStorage.removeItem(buildLocalSectionLayoutStorageKey(workspaceKey))
            return {
                success: false,
                error: "布局数据已损坏，已恢复默认",
                data: buildLocalEmptyConfig(),
            }
        }

        return { success: true, data: parsedConfig.data }
    } catch {
        return { success: false, error: "读取布局失败", data: buildLocalEmptyConfig() }
    }
}

export async function saveMyLocalSectionWorkspaceConfig(input: unknown): Promise<ActionResponse> {
    const parsed = z
        .object({ workspaceKey: WorkspaceKeySchema, config: SectionWorkspaceConfigSchema })
        .strict()
        .safeParse(input)
    if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
    }
    const { workspaceKey, config } = parsed.data

    try {
        localStorage.setItem(buildLocalSectionLayoutStorageKey(workspaceKey), JSON.stringify(config))
        return { success: true }
    } catch {
        return { success: false, error: "保存布局失败" }
    }
}

export async function resetMyLocalSectionWorkspaceConfig(workspaceKey: string): Promise<ActionResponse> {
    const parsedKey = WorkspaceKeySchema.safeParse(workspaceKey)
    if (!parsedKey.success) {
        return { success: false, error: "输入校验失败" }
    }
    workspaceKey = parsedKey.data

    try {
        localStorage.removeItem(buildLocalSectionLayoutStorageKey(workspaceKey))
        return { success: true }
    } catch {
        return { success: false, error: "重置失败" }
    }
}

export function hashWorkspaceKeyToClassSuffix(key: string) {
    let hash = 5381
    for (let i = 0; i < key.length; i++) {
        hash = ((hash << 5) + hash) ^ key.charCodeAt(i)
    }
    return (hash >>> 0).toString(36)
}

function rectsOverlap(a: Pick<Layout[number], "x" | "y" | "w" | "h">, b: Pick<Layout[number], "x" | "y" | "w" | "h">) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function findFirstAvailableGridPosition(existing: Layout, size: { w: number; h: number }, cols: number) {
    const maxY = findNextY(existing)
    for (let y = 0; y <= maxY; y++) {
        for (let x = 0; x <= cols - size.w; x++) {
            const candidate = { x, y, w: size.w, h: size.h }
            if (!existing.some((item) => rectsOverlap(candidate, item))) {
                return { x, y }
            }
        }
    }
    return { x: 0, y: maxY }
}

export function blocksEqual(a: Array<{ id: string }>, b: Array<{ id: string }>) {
    if (a === b) return true
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i]?.id !== b[i]?.id) return false
    }
    return true
}

export function layoutItemKey(item: Layout[number]) {
    return [item.i, item.x, item.y, item.w, item.h, item.minW ?? "", item.minH ?? "", item.maxW ?? "", item.maxH ?? "",].join(":")
}

export function layoutEqual(a: Layout, b: Layout) {
    if (a === b) return true
    if (a.length !== b.length) return false
    const aKeys = a.map(layoutItemKey).sort()
    const bKeys = b.map(layoutItemKey).sort()
    for (let i = 0; i < aKeys.length; i++) {
        if (aKeys[i] !== bKeys[i]) return false
    }
    return true
}
