"use client"

import * as React from "react"
import { EyeOff, ListTodo, MessageCircle, Plus, Timer, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/Button"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/Popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip"
import { QuickCreateTaskDialog } from "@/components/tasks/QuickCreateTaskDialog"
import { cn } from "@/lib/utils"
import { computeFloatingLauncherPosition, snapFloatingLauncherToNearestEdge } from "@/lib/ui/floating-launcher"
import { useFloatStore } from "@/store/float-store"
import { useUiPreferences } from "@/components/layout/UiPreferencesProvider"

const LAUNCHER_SIZE = 56
const LAUNCHER_MARGIN = 24

function getPopoverSide(dockSide: string) {
    if (dockSide === "left") return "right"
    if (dockSide === "right") return "left"
    if (dockSide === "top") return "bottom"
    return "top"
}

function getCoachmarkPlacement(dockSide: string) {
    if (dockSide === "left") return { translate: "translate-x-[72px] translate-y-[-8px]" }
    if (dockSide === "right") return { translate: "translate-x-[calc(-100%-12px)] translate-y-[-8px]" }
    if (dockSide === "top") return { translate: "translate-y-[72px] translate-x-[-8px]" }
    return { translate: "translate-x-[28px] translate-y-[calc(-100%-12px)]" }
}

export function FloatingLauncher() {
    const router = useRouter()
    const { floatingLauncher, persistFloatingLauncherPatch, floatingLauncherSaving, onboarding, persistOnboardingPatch } = useUiPreferences()
    const { openWindow } = useFloatStore()

    const [ready, setReady] = React.useState(false)
    const [open, setOpen] = React.useState(false)
    const [createTaskOpen, setCreateTaskOpen] = React.useState(false)

    const [viewport, setViewport] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 })
    const [position, setPosition] = React.useState<{ x: number; y: number }>({ x: LAUNCHER_MARGIN, y: LAUNCHER_MARGIN })

    const dragRef = React.useRef<{
        pointerId: number
        startX: number
        startY: number
        originX: number
        originY: number
        moved: boolean
    } | null>(null)

    React.useEffect(() => {
        const apply = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
        apply()
        const onResize = () => apply()
        window.addEventListener("resize", onResize)
        return () => window.removeEventListener("resize", onResize)
    }, [])

    React.useEffect(() => {
        if (!viewport.width || !viewport.height) return
        const next = computeFloatingLauncherPosition({
            config: floatingLauncher,
            viewport,
            size: LAUNCHER_SIZE,
            margin: LAUNCHER_MARGIN,
        })
        setPosition(next)
        setReady(true)
    }, [floatingLauncher, viewport])

    const clampPosition = React.useCallback(
        (x: number, y: number) => {
            const maxX = Math.max(LAUNCHER_MARGIN, viewport.width - LAUNCHER_SIZE - LAUNCHER_MARGIN)
            const maxY = Math.max(LAUNCHER_MARGIN, viewport.height - LAUNCHER_SIZE - LAUNCHER_MARGIN)
            return {
                x: Math.max(LAUNCHER_MARGIN, Math.min(maxX, x)),
                y: Math.max(LAUNCHER_MARGIN, Math.min(maxY, y)),
            }
        },
        [viewport]
    )

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!ready) return
        dragRef.current = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            originX: position.x,
            originY: position.y,
            moved: false,
        }
        setOpen(false)
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }

    const handlePointerMove = (e: React.PointerEvent) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== e.pointerId) return

        const dx = e.clientX - drag.startX
        const dy = e.clientY - drag.startY
        const moved = Math.abs(dx) + Math.abs(dy) > 3

        drag.moved = drag.moved || moved

        const next = clampPosition(drag.originX + dx, drag.originY + dy)
        setPosition(next)
    }

    const handlePointerUp = (e: React.PointerEvent) => {
        const drag = dragRef.current
        dragRef.current = null

        if (!drag || drag.pointerId !== e.pointerId) {
            setOpen((v) => !v)
            return
        }

        if (!drag.moved) {
            setOpen((v) => !v)
            return
        }

        const snap = snapFloatingLauncherToNearestEdge({
            position,
            viewport,
            size: LAUNCHER_SIZE,
            margin: LAUNCHER_MARGIN,
        })

        setPosition(snap.snapped)
        persistFloatingLauncherPatch({ dockSide: snap.dockSide, offsetRatio: snap.offsetRatio })
    }

    if (!ready || !floatingLauncher.enabled) return null

    const popoverSide = getPopoverSide(floatingLauncher.dockSide)
    const showCoachmark = !open && !onboarding.floatingLauncherCoachmarkDismissed && floatingLauncher.enabled
    const coachmark = getCoachmarkPlacement(floatingLauncher.dockSide)

    return (
        <>
            {showCoachmark ? (
                <div className="fixed z-30 pointer-events-none" style={{ left: position.x, top: position.y }}>
                    <div
                        className={cn(
                            "pointer-events-auto max-w-[260px] rounded-xl border border-border bg-popover text-popover-foreground shadow-lg p-3 text-sm",
                            "ring-1 ring-primary/20",
                            coachmark.translate
                        )}
                    >
                        <div className="font-medium text-foreground">右下角“组件球”是快捷入口</div>
                        <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
                            可拖拽到屏幕边缘自动吸附；点击展开后可快速打开任务、计时、团队消息等。
                        </div>
                        <div className="mt-2 flex items-center justify-end gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2"
                                onClick={() => persistOnboardingPatch({ floatingLauncherCoachmarkDismissed: true })}
                            >
                                我知道了
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}

            <Popover open={open} onOpenChange={setOpen}>
                <PopoverAnchor asChild>
                    <div
                        className="fixed z-[120]"
                        style={{ left: position.x, top: position.y }}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                    >
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                         className={cn(
                                             "h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200",
                                         "bg-gradient-to-br from-primary to-primary-600 text-primary-foreground",
                                         "active:scale-95 select-none touch-none"
                                     )}
                                    aria-label="快捷入口（组件球）"
                                >
                                    <Plus className="h-6 w-6 mx-auto" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side={popoverSide as "left" | "right" | "top" | "bottom"} align="center">
                                <div className="text-xs">
                                    <div className="font-medium">快捷入口（组件球）</div>
                                    <div className="text-muted-foreground">任务 / 计时 / 消息</div>
                                </div>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </PopoverAnchor>

                <PopoverContent
                    side={popoverSide as "left" | "right" | "top" | "bottom"}
                    align="center"
                    sideOffset={12}
                    className="w-72 space-y-3"
                >
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <div className="text-sm font-semibold">快捷入口</div>
                            <div className="text-xs text-muted-foreground">常用功能入口（可磁吸停靠）</div>
                        </div>
                        {floatingLauncherSaving ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <Button
                            variant="outline"
                            className="justify-start"
                            onClick={() => {
                                setCreateTaskOpen(true)
                                setOpen(false)
                            }}
                        >
                            <ListTodo className="h-4 w-4 mr-2" />
                            新建任务
                        </Button>
                        <Button
                            variant="outline"
                            className="justify-start"
                            onClick={() => {
                                router.push("/tasks")
                                setOpen(false)
                            }}
                        >
                            <ListTodo className="h-4 w-4 mr-2" />
                            任务中心
                        </Button>
                        <Button
                            variant="outline"
                            className="justify-start"
                            onClick={() => {
                                openWindow("team-chat", "CHAT", "团队消息", { scope: "TEAM" })
                                setOpen(false)
                            }}
                        >
                            <MessageCircle className="h-4 w-4 mr-2" />
                            团队消息
                        </Button>
                        <Button
                            variant="outline"
                            className="justify-start"
                            onClick={() => {
                                openWindow("timer", "TIMER", "计时器")
                                setOpen(false)
                            }}
                        >
                            <Timer className="h-4 w-4 mr-2" />
                            计时器
                        </Button>
                        <Button
                            variant="ghost"
                            className="justify-start text-muted-foreground hover:text-destructive"
                            onClick={() => {
                                persistFloatingLauncherPatch({ enabled: false })
                                setOpen(false)
                            }}
                        >
                            <EyeOff className="h-4 w-4 mr-2" />
                            隐藏组件球
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>

            <QuickCreateTaskDialog open={createTaskOpen} onOpenChange={setCreateTaskOpen} />
        </>
    )
}
