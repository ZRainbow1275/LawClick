"use client"

import * as React from "react"
import { Loader2, Pause, Play, Square } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { cn } from "@/lib/utils"
import { useFloatStore } from "@/store/float-store"
import { useUserStatusStore } from "@/store/user-status-store"
import { getActiveTimer, pauseTimer, resumeTimer, stopTimer, updateTimeLog } from "@/actions/timelogs-crud"

type ActiveTimer = {
    id: string
    description: string
    startTime: Date | string
    duration: number
    status: "RUNNING" | "PAUSED"
    case?: { id: string; title: string; caseCode: string } | null
    task?: { id: string; title: string } | null
}

function formatTime(totalSeconds: number) {
    const h = Math.floor(totalSeconds / 3600)
    const m = Math.floor((totalSeconds % 3600) / 60)
    const s = totalSeconds % 60
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

export function FloatingTimerContent() {
    const { setStatus } = useUserStatusStore()
    const { updateTitle } = useFloatStore()

    const [loading, setLoading] = React.useState(true)
    const [busy, setBusy] = React.useState(false)
    const [activeTimer, setActiveTimer] = React.useState<ActiveTimer | null>(null)
    const [elapsedSeconds, setElapsedSeconds] = React.useState(0)
    const [draftDescription, setDraftDescription] = React.useState("")

    const loadActiveTimer = React.useCallback(async () => {
        try {
            const timer = (await getActiveTimer()) as ActiveTimer | null
            setActiveTimer(timer)

            if (!timer) {
                setElapsedSeconds(0)
                return
            }

            setDraftDescription(timer.description || "")

            const base = timer.duration || 0
            if (timer.status === "PAUSED") {
                setElapsedSeconds(base)
                return
            }

            const startMs = new Date(timer.startTime).getTime()
            const extra = Math.max(0, Math.floor((Date.now() - startMs) / 1000))
            setElapsedSeconds(base + extra)
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        loadActiveTimer()
    }, [loadActiveTimer])

    React.useEffect(() => {
        if (activeTimer?.status === "RUNNING") {
            setStatus("FOCUS", "Deep Work: Billing Time")
        } else if (activeTimer?.status === "PAUSED") {
            setStatus("BUSY", "Timer Paused")
        } else {
            setStatus("AVAILABLE")
        }
    }, [activeTimer?.status, setStatus])

    const timerId = activeTimer?.id
    const timerStatus = activeTimer?.status
    const timerStartTime = activeTimer?.startTime
    const timerDuration = activeTimer?.duration ?? 0

    React.useEffect(() => {
        if (!timerId || timerStatus !== "RUNNING" || !timerStartTime) {
            updateTitle("timer", "计时器")
            return
        }

        const tick = () => {
            const startMs = new Date(timerStartTime).getTime()
            const extra = Math.max(0, Math.floor((Date.now() - startMs) / 1000))
            const nextElapsed = timerDuration + extra
            setElapsedSeconds(nextElapsed)
            updateTitle("timer", `计时中 ${formatTime(nextElapsed)}`)
        }

        tick()
        const interval = setInterval(tick, 1000)
        return () => clearInterval(interval)
    }, [timerId, timerStatus, timerStartTime, timerDuration, updateTitle])

    const handleStart = async () => {
        toast.error("请从案件/任务开始计时", { description: "建议在任务卡点击「计时」或在工时页选择案件开始" })
    }

    const handlePauseResume = async () => {
        if (!activeTimer) return

        setBusy(true)
        const res =
            activeTimer.status === "RUNNING"
                ? await pauseTimer(activeTimer.id)
                : await resumeTimer(activeTimer.id)
        setBusy(false)

        if (!res.success) {
            toast.error("操作失败", { description: res.error })
            return
        }

        await loadActiveTimer()
    }

    const handleStop = async () => {
        if (!activeTimer) return

        setBusy(true)
        const res = await stopTimer(activeTimer.id)
        setBusy(false)

        if (!res.success) {
            toast.error("停止计时失败", { description: res.error })
            return
        }

        toast.success("工时已保存", {
            description: `时长: ${formatTime(res.duration ?? elapsedSeconds)}`,
        })

        setDraftDescription("")
        await loadActiveTimer()
    }

    const handleDescriptionBlur = async () => {
        if (!activeTimer) return
        const description = draftDescription.trim()
        if (!description || description === activeTimer.description) return

        const res = await updateTimeLog({ id: activeTimer.id, description })
        if (!res.success) {
            toast.error("保存备注失败", { description: res.error })
            return
        }

        setActiveTimer((prev) => (prev ? { ...prev, description } : prev))
    }

    const statusLabel =
        activeTimer?.status === "RUNNING"
            ? "RUNNING"
            : activeTimer?.status === "PAUSED"
                ? "PAUSED"
                : "IDLE"

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="flex flex-col items-center justify-center py-4 bg-muted/20 rounded-lg border border-border/40">
                <span className="text-4xl font-mono font-bold tracking-tight py-2 text-primary">
                    {formatTime(elapsedSeconds)}
                </span>
                <span
                    className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full uppercase tracking-wider",
                        activeTimer?.status === "RUNNING"
                            ? "bg-success/15 text-success animate-pulse"
                            : "bg-muted text-muted-foreground"
                    )}
                >
                    {statusLabel}
                </span>
            </div>

            {activeTimer?.case && (
                <div className="text-xs text-muted-foreground truncate">
                    {activeTimer.case.caseCode} · {activeTimer.case.title}
                </div>
            )}

            {activeTimer?.task && (
                <div className="text-xs text-muted-foreground truncate">任务：{activeTimer.task.title}</div>
            )}

            <div className="flex items-center justify-center gap-4">
                {activeTimer ? (
                    <Button
                        size="icon"
                        variant={activeTimer.status === "RUNNING" ? "secondary" : "default"}
                        className={cn(
                            "h-12 w-12 rounded-full shadow-brand hover:scale-105 active:scale-95 transition-all",
                            activeTimer.status === "RUNNING"
                                ? "bg-warning/20 text-warning-foreground hover:bg-warning/30"
                                : ""
                        )}
                        aria-label={activeTimer.status === "RUNNING" ? "暂停计时" : "继续计时"}
                        data-testid="floating-timer-toggle"
                        onClick={handlePauseResume}
                        disabled={busy}
                    >
                        {activeTimer.status === "RUNNING" ? (
                            <Pause className="h-5 w-5 fill-current" />
                        ) : (
                            <Play className="h-5 w-5 fill-current" />
                        )}
                    </Button>
                ) : (
                    <Button
                        size="icon"
                        className="h-12 w-12 rounded-full shadow-brand hover:scale-105 active:scale-95 transition-all"
                        onClick={handleStart}
                        disabled={busy || !draftDescription.trim()}
                    >
                        <Play className="h-5 w-5 fill-current" />
                    </Button>
                )}

                <Button
                    size="icon"
                    variant="ghost"
                    className="h-10 w-10 text-destructive hover:bg-destructive/10"
                    aria-label="停止计时"
                    data-testid="floating-timer-stop"
                    onClick={handleStop}
                    disabled={!activeTimer || busy}
                >
                    <Square className="h-4 w-4 fill-current" />
                </Button>
            </div>

            <div className="mt-auto">
                <Label className="text-xs text-muted-foreground mb-1.5 block">备注</Label>
                <Input
                    placeholder="正在做什么..."
                    className="h-8 bg-transparent border-b border-0 border-border/50 rounded-none focus-visible:ring-0 focus-visible:border-primary px-0"
                    value={draftDescription}
                    onChange={(e) => setDraftDescription(e.target.value)}
                    onBlur={handleDescriptionBlur}
                    disabled={busy}
                />
            </div>
        </div>
    )
}
