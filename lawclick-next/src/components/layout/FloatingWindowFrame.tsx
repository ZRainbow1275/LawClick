"use client"

import { GlassPanel } from "@/components/ui/GlassPanel"
import { Button } from "@/components/ui/Button"
import { X, Minus, GripHorizontal, Pin, PinOff } from "lucide-react"
import { useFloatStore, FloatingWindowConfig } from "@/store/float-store"
import { cn } from "@/lib/utils"
import { snapRectToNearestEdge } from "@/lib/ui/dock-snap"

interface FloatingWindowFrameProps {
    config: FloatingWindowConfig
    children: React.ReactNode
}

export function FloatingWindowFrame({ config, children }: FloatingWindowFrameProps) {
    const { closeWindow, toggleMinimize, bringToFront, updatePosition, updateDocking } = useFloatStore()

    const handleToggleDock = () => {
        bringToFront(config.id)

        if (config.isDocked) {
            updateDocking(config.id, null)
            return
        }

        const screenWidth = typeof window !== "undefined" ? window.innerWidth : 1920
        const screenHeight = typeof window !== "undefined" ? window.innerHeight : 1080
        const effectiveWidth = config.isMinimized ? 200 : config.size.width
        const effectiveHeight = config.isMinimized ? 40 : config.size.height
        const margin = 16

        const snap = snapRectToNearestEdge({
            position: { x: config.position.x, y: config.position.y },
            size: { width: effectiveWidth, height: effectiveHeight },
            viewport: { width: screenWidth, height: screenHeight },
            margin,
            snapThreshold: Number.POSITIVE_INFINITY,
        })

        if (!snap) return
        updatePosition(config.id, snap.snapped.x, snap.snapped.y)
        updateDocking(config.id, { side: snap.dockSide, offsetRatio: snap.offsetRatio })
    }

    // We use a custom simple drag handler instead of full dnd-kit context for each window 
    // to avoid complex context nesting, as windows are independent.
    // Actually, for a pure "OS-like" experience, simple mouse listeners are often smoother than dnd-kit's list-based logic.
    // Let's implement a rigid drag handler here.

    const handleMouseDown = (e: React.MouseEvent) => {
        bringToFront(config.id)

        // Drag Logic
        const startX = e.clientX
        const startY = e.clientY
        const initialX = config.position.x
        const initialY = config.position.y
        const effectiveWidth = config.isMinimized ? 200 : config.size.width
        const effectiveHeight = config.isMinimized ? 40 : config.size.height
        const margin = 16

        let lastX = initialX
        let lastY = initialY

        const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

        const handleMouseMove = (mv: MouseEvent) => {
            const dx = mv.clientX - startX
            const dy = mv.clientY - startY

            const screenWidth = typeof window !== "undefined" ? window.innerWidth : 1920
            const screenHeight = typeof window !== "undefined" ? window.innerHeight : 1080

            const maxX = Math.max(margin, screenWidth - effectiveWidth - margin)
            const maxY = Math.max(margin, screenHeight - effectiveHeight - margin)

            lastX = clamp(initialX + dx, margin, maxX)
            lastY = clamp(initialY + dy, margin, maxY)

            updatePosition(config.id, lastX, lastY)
        }

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)

            const screenWidth = typeof window !== "undefined" ? window.innerWidth : 1920
            const screenHeight = typeof window !== "undefined" ? window.innerHeight : 1080

            const snap = snapRectToNearestEdge({
                position: { x: lastX, y: lastY },
                size: { width: effectiveWidth, height: effectiveHeight },
                viewport: { width: screenWidth, height: screenHeight },
                margin,
                snapThreshold: 48,
            })

            if (!snap) {
                updateDocking(config.id, null)
                return
            }

            updatePosition(config.id, snap.snapped.x, snap.snapped.y)
            updateDocking(config.id, { side: snap.dockSide, offsetRatio: snap.offsetRatio })
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
    }

    if (!config.isOpen) return null

    return (
        <div
            className={cn(
                "fixed transition-shadow duration-200",
                config.isMinimized && "h-auto w-auto"
            )}
            data-floating-window-id={config.id}
            data-floating-window-type={config.type}
            style={{
                left: config.position.x,
                top: config.position.y,
                width: config.isMinimized ? 200 : config.size.width,
                height: config.isMinimized ? 40 : config.size.height,
                zIndex: config.zIndex,
            }}
            onMouseDown={() => bringToFront(config.id)}
        >
            <GlassPanel
                intensity="high"
                className={cn(
                    "flex flex-col overflow-hidden shadow-2xl ring-1 ring-border/60",
                    config.isMinimized ? "h-10" : "h-full"
                )}
            >
                {/* Header / Handle */}
                <div
                    className="h-10 flex items-center justify-between px-2 cursor-grab active:cursor-grabbing bg-card/50 border-b border-border/60"
                    onMouseDown={handleMouseDown}
                >
                    <div className="flex items-center gap-2">
                        <GripHorizontal className="w-4 h-4 text-muted-foreground/50" />
                        <span className="text-xs font-medium text-foreground/80 truncate max-w-[120px]">
                            {config.title}
                        </span>
                    </div>

                    <div className="flex items-center gap-1" onMouseDown={e => e.stopPropagation()}>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-6 w-6 hover:bg-accent/60"
                            title={config.isDocked ? "解除停靠" : "吸附到边缘"}
                            onClick={handleToggleDock}
                        >
                            {config.isDocked ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-6 w-6 hover:bg-accent/60"
                            onClick={() => toggleMinimize(config.id)}
                        >
                            <Minus className="w-3 h-3" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => closeWindow(config.id)}
                        >
                            <X className="w-3 h-3" />
                        </Button>
                    </div>
                </div>

                {/* Content */}
                {!config.isMinimized && (
                    <div className="flex-1 overflow-auto p-4 relative">
                        {children}
                    </div>
                )}
            </GlassPanel>
        </div>
    )
}
