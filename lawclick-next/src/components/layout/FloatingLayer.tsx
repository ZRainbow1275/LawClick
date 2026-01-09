"use client"

import { useFloatStore, type WindowType } from "@/store/float-store"
import { FloatingWindowFrame } from "@/components/layout/FloatingWindowFrame"
import { useEffect, useMemo, useRef, useState } from "react"
import { computeDockedPosition } from "@/lib/ui/dock-snap"

// Content Registry
import { FloatingChat } from "@/components/floating/FloatingChat"
import { FloatingTimerContent } from "@/components/floating/FloatingTimerContent"
import { FloatingLegoBlock } from "@/components/floating/FloatingLegoBlock"

type FloatingChatContext = NonNullable<Parameters<typeof FloatingChat>[0]["context"]>

function isFloatingChatContext(value: unknown): value is FloatingChatContext {
    if (typeof value !== "object" || value === null) return false
    const record = value as Record<string, unknown>
    const keys: Array<keyof FloatingChatContext> = ["scope", "caseId", "threadId"]
    return keys.every((k) => record[k] === undefined || typeof record[k] === "string")
}

export function FloatingLayer(props: { allowedTypes?: WindowType[] } = {}) {
    const { windows, updatePosition } = useFloatStore()
    const [mounted, setMounted] = useState(false)
    const windowsRef = useRef(windows)
    const allowedTypes = useMemo(() => {
        const list = props.allowedTypes
        return Array.isArray(list) && list.length > 0 ? new Set(list) : null
    }, [props.allowedTypes])

    // 仅用于检测客户端挂载，避免SSR水合问题
    useEffect(() => {
        const raf = requestAnimationFrame(() => setMounted(true))
        return () => cancelAnimationFrame(raf)
    }, [])

    useEffect(() => {
        windowsRef.current = windows
    }, [windows])

    const dockedWindowKey = useMemo(() => {
        return Object.values(windows)
            .filter((w) => {
                if (!w.isOpen) return false
                if (allowedTypes && !allowedTypes.has(w.type)) return false
                return w.isDocked && w.dockSide && typeof w.dockOffsetRatio === "number"
            })
            .map((w) => {
                const effectiveWidth = w.isMinimized ? 200 : w.size.width       
                const effectiveHeight = w.isMinimized ? 40 : w.size.height      
                const ratio = typeof w.dockOffsetRatio === "number" && Number.isFinite(w.dockOffsetRatio) ? w.dockOffsetRatio : 0.5
                const ratioKey = ratio.toFixed(4)
                return `${w.id}:${w.dockSide}:${ratioKey}:${effectiveWidth}x${effectiveHeight}`
            })
            .sort()
            .join("|")
    }, [allowedTypes, windows])

    useEffect(() => {
        if (!mounted) return

        const viewport = { width: window.innerWidth, height: window.innerHeight }
        const margin = 16
        for (const win of Object.values(windowsRef.current)) {
            if (!win.isOpen) continue
            if (allowedTypes && !allowedTypes.has(win.type)) continue
            if (!win.isDocked || !win.dockSide || typeof win.dockOffsetRatio !== "number") continue

            const size = {
                width: win.isMinimized ? 200 : win.size.width,
                height: win.isMinimized ? 40 : win.size.height,
            }
            const next = computeDockedPosition({
                dockSide: win.dockSide,
                offsetRatio: win.dockOffsetRatio,
                size,
                viewport,
                margin,
            })

            if (Math.abs(next.x - win.position.x) > 1 || Math.abs(next.y - win.position.y) > 1) {
                updatePosition(win.id, next.x, next.y)
            }
        }
    }, [allowedTypes, mounted, dockedWindowKey, updatePosition])

    useEffect(() => {
        if (!mounted) return

        let raf = 0
        const schedule = () => {
            window.cancelAnimationFrame(raf)
            raf = window.requestAnimationFrame(() => {
                const viewport = { width: window.innerWidth, height: window.innerHeight }
                const margin = 16
                for (const win of Object.values(windowsRef.current)) {
                    if (!win.isOpen) continue
                    if (allowedTypes && !allowedTypes.has(win.type)) continue
                    if (!win.isDocked || !win.dockSide || typeof win.dockOffsetRatio !== "number") continue

                    const size = {
                        width: win.isMinimized ? 200 : win.size.width,
                        height: win.isMinimized ? 40 : win.size.height,
                    }
                    const next = computeDockedPosition({
                        dockSide: win.dockSide,
                        offsetRatio: win.dockOffsetRatio,
                        size,
                        viewport,
                        margin,
                    })

                    if (Math.abs(next.x - win.position.x) > 1 || Math.abs(next.y - win.position.y) > 1) {
                        updatePosition(win.id, next.x, next.y)
                    }
                }
            })
        }

        schedule()
        window.addEventListener("resize", schedule)
        return () => {
            window.removeEventListener("resize", schedule)
            window.cancelAnimationFrame(raf)
        }
    }, [allowedTypes, mounted, updatePosition])

    if (!mounted) return null

    return (
        <div className="fixed inset-0 pointer-events-none z-[100]">
            {
                Object.values(windows).map((window) => {
                    if (!window.isOpen) return null
                    if (allowedTypes && !allowedTypes.has(window.type)) return null

                    let Content = null
                    switch (window.type) {
                        case 'TIMER':
                            Content = <FloatingTimerContent />
                            break
                        case 'CHAT':
                            Content = <FloatingChat context={isFloatingChatContext(window.data) ? window.data : undefined} />
                            break
                        case 'LEGO_BLOCK':
                            Content = <FloatingLegoBlock data={window.data} />
                            break
                        default:
                            return null
                    }

                    return (
                        <div key={window.id} className="pointer-events-auto">
                            <FloatingWindowFrame config={window}>
                                {Content}
                            </FloatingWindowFrame>
                        </div>
                    )
                })
            }
        </div >
    )
}

