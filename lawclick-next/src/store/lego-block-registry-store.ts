import { create } from "zustand"
import type React from "react"

export type LegoBlockRegistryOrigin =
    | {
          kind: "SECTION_BLOCK"
          pathname: string
          sectionId: string
          entityId: string | null
          blockId: string
      }
    | {
          kind: "PAGE_WIDGET"
          pathname: string
          workspaceKey: string
          widgetId: string
      }

export type LegoBlockRegistryEntry = {
    key: string
    title: string
    content: React.ReactNode
    origin: LegoBlockRegistryOrigin
    updatedAt: number
}

type LegoBlockRegistryState = {
    entries: Record<string, LegoBlockRegistryEntry>
    register: (entry: Omit<LegoBlockRegistryEntry, "updatedAt">) => void
    unregister: (key: string) => void
}

export const useLegoBlockRegistryStore = create<LegoBlockRegistryState>((set) => ({
    entries: {},
    register: (entry) =>
        set((state) => ({
            entries: {
                ...state.entries,
                [entry.key]: { ...entry, updatedAt: Date.now() },
            },
        })),
    unregister: (key) =>
        set((state) => {
            if (!(key in state.entries)) return state
            const next = { ...state.entries }
            delete next[key]
            return { entries: next }
        }),
}))
