import type { GridLayoutItem } from "@/lib/grid-layout"

export type SectionBlockInstance = {
    id: string
}

export type SectionWorkspaceConfig = {
    configVersion: number
    blocks: SectionBlockInstance[]
    layout: GridLayoutItem[]
}

export const DEFAULT_SECTION_WORKSPACE_CONFIG_VERSION = 1

