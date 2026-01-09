import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DockSide } from "@/lib/ui/dock-snap"

export type WindowType = 'TIMER' | 'CHAT' | 'LEGO_BLOCK'

export interface FloatingWindowConfig {
    id: string
    type: WindowType
    title: string
    isOpen: boolean
    isMinimized: boolean
    isDocked: boolean // If true, it is snapped to an edge (magnetic docking)
    dockSide?: DockSide | null
    dockOffsetRatio?: number | null
    position: { x: number; y: number }
    size: { width: number; height: number }
    zIndex: number
    data?: unknown // Flexible payload (e.g. Chat ID)
}

interface FloatState {
    windows: Record<string, FloatingWindowConfig>
    activeWindowId: string | null
    nextZIndex: number

    // Actions
    openWindow: (id: string, type: WindowType, title: string, initialData?: unknown) => void
    closeWindow: (id: string) => void
    toggleMinimize: (id: string) => void
    updatePosition: (id: string, x: number, y: number) => void
    updateSize: (id: string, width: number, height: number) => void
    updateTitle: (id: string, title: string) => void
    updateDocking: (id: string, dock: { side: DockSide; offsetRatio: number } | null) => void
    bringToFront: (id: string) => void
}

export const useFloatStore = create<FloatState>()(
    persist(
        (set) => ({
            windows: {},
            activeWindowId: null,
            nextZIndex: 100,

            openWindow: (id, type, title, initialData) => set((state) => {
                const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
                const screenWidth = typeof window !== "undefined" ? window.innerWidth : 1920
                const screenHeight = typeof window !== "undefined" ? window.innerHeight : 1080
                const margin = 24

                const existing = state.windows[id]
                if (existing) {
                    const effectiveWidth = existing.isMinimized ? 200 : existing.size.width
                    const effectiveHeight = existing.isMinimized ? 40 : existing.size.height
                    const maxX = Math.max(margin, screenWidth - effectiveWidth - margin)
                    const maxY = Math.max(margin, screenHeight - effectiveHeight - margin)

                    const nextPosition = {
                        x: clamp(existing.position.x, margin, maxX),
                        y: clamp(existing.position.y, margin, maxY),
                    }

                    return {
                        windows: {
                            ...state.windows,
                            [id]: {
                                ...existing,
                                title: title || existing.title,
                                data: typeof initialData === "undefined" ? existing.data : initialData,
                                isOpen: true,
                                isMinimized: false,
                                position: nextPosition,
                                zIndex: state.nextZIndex,
                            },
                        },
                        activeWindowId: id,
                        nextZIndex: state.nextZIndex + 1
                    }
                }

                // New Window Defaults - Different positions for each type
                const getDefaultSize = (windowType: WindowType) => {
                    switch (windowType) {
                        case 'TIMER':
                            return { width: 320, height: 280 }
                        case 'CHAT':
                            return { width: 360, height: 450 }
                        case 'LEGO_BLOCK':
                            return { width: 520, height: 620 }
                        default:
                            return { width: 320, height: 400 }
                    }
                }

                const getDefaultPosition = (windowType: WindowType, size: { width: number; height: number }) => {
                    const maxX = Math.max(margin, screenWidth - size.width - margin)
                    const maxY = Math.max(margin, screenHeight - size.height - margin)

                    const make = (x: number, y: number) => ({
                        x: clamp(x, margin, maxX),
                        y: clamp(y, margin, maxY),
                    })

                    switch (windowType) {
                        case "TIMER":
                            return make(screenWidth - size.width - margin, screenHeight - size.height - margin)
                        case "CHAT":
                            return make(screenWidth - size.width - margin, screenHeight / 2 - size.height / 2)
                        case "LEGO_BLOCK":
                            return make(screenWidth / 2 - size.width / 2, screenHeight / 2 - size.height / 2)
                        default:
                            return make(screenWidth - size.width - margin, margin * 2)
                    }
                }

                const size = getDefaultSize(type)

                return {
                    windows: {
                        ...state.windows,
                        [id]: {
                            id,
                            type,
                            title,
                            isOpen: true,
                            isMinimized: false,
                            isDocked: false,
                            dockSide: null,
                            dockOffsetRatio: null,
                            position: getDefaultPosition(type, size),
                            size,
                            zIndex: state.nextZIndex,
                            data: initialData
                        }
                    },
                    activeWindowId: id,
                    nextZIndex: state.nextZIndex + 1
                }
            }),

            closeWindow: (id) => set((state) => ({
                windows: {
                    ...state.windows,
                    [id]: { ...state.windows[id], isOpen: false }
                }
            })),

            toggleMinimize: (id) => set((state) => ({
                windows: {
                    ...state.windows,
                    [id]: { ...state.windows[id], isMinimized: !state.windows[id].isMinimized }
                }
            })),

            updatePosition: (id, x, y) => set((state) => ({
                windows: {
                    ...state.windows,
                    [id]: { ...state.windows[id], position: { x, y } }
                }
            })),

            updateSize: (id, width, height) => set((state) => ({
                windows: {
                    ...state.windows,
                    [id]: { ...state.windows[id], size: { width, height } }
                }
            })),

            updateTitle: (id, title) => set((state) => ({
                windows: {
                    ...state.windows,
                    [id]: { ...state.windows[id], title }
                }
            })),

            updateDocking: (id, dock) => set((state) => ({
                windows: {
                    ...state.windows,
                    [id]: {
                        ...state.windows[id],
                        isDocked: Boolean(dock),
                        dockSide: dock?.side ?? null,
                        dockOffsetRatio: typeof dock?.offsetRatio === "number" ? dock.offsetRatio : null,
                    },
                },
            })),

            bringToFront: (id) => set((state) => ({
                windows: {
                    ...state.windows,
                    [id]: { ...state.windows[id], zIndex: state.nextZIndex }
                },
                activeWindowId: id,
                nextZIndex: state.nextZIndex + 1
            }))
        }),
        {
            name: 'lawclick-float-storage-v9',
            partialize: (state) => ({ windows: state.windows }), // Only persist configurations
        }
    )
)
