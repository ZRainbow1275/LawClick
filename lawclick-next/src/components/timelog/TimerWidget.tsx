"use client"

import * as React from "react"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Input } from "@/components/ui/Input"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/Dialog"
import { Label } from "@/components/ui/Label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/Select"
import {
    Play,
    Pause,
    Square,
    Clock,
    Briefcase,
    Loader2
} from "lucide-react"
import {
    startTimer,
    stopTimer,
    pauseTimer,
    resumeTimer,
    getActiveTimer
} from "@/actions/timelogs-crud"
import { toast } from "sonner"

// ==============================================================================
// Types
// ==============================================================================

interface TimerWidgetProps {
    cases?: Array<{ id: string; title: string; caseCode: string }>
    onTimerChanged?: () => void
}

interface ActiveTimer {
    id: string
    description: string
    startTime: Date
    duration: number
    status: 'RUNNING' | 'PAUSED'
    case?: { id: string; title: string; caseCode: string } | null
    task?: { id: string; title: string } | null
}

// ==============================================================================
// Component
// ==============================================================================

export function TimerWidget({ cases = [], onTimerChanged }: TimerWidgetProps) {
    const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null)
    const [elapsedSeconds, setElapsedSeconds] = useState(0)
    const [loading, setLoading] = useState(true)
    const [showStartDialog, setShowStartDialog] = useState(false)
    const [starting, setStarting] = useState(false)
    const [stopping, setStopping] = useState(false)

    const [newTimer, setNewTimer] = useState({
        description: '',
        caseId: ''
    })

    // 加载活动计时
    const loadActiveTimer = useCallback(async () => {
        const timer = await getActiveTimer()
        setActiveTimer(timer as ActiveTimer | null)
        if (timer) {
            // 计算已过时间
            const now = new Date()
            const start = new Date(timer.startTime)
            const elapsed = Math.floor((now.getTime() - start.getTime()) / 1000) + timer.duration
            setElapsedSeconds(elapsed)
        } else {
            setElapsedSeconds(0)
        }
        setLoading(false)
    }, [])

    useEffect(() => {
        let alive = true
        const load = async () => {
            const timer = await getActiveTimer()
            if (!alive) return

            setActiveTimer(timer as ActiveTimer | null)
            if (timer) {
                // 计算已过时间
                const now = new Date()
                const start = new Date(timer.startTime)
                const elapsed = Math.floor((now.getTime() - start.getTime()) / 1000) + timer.duration
                setElapsedSeconds(elapsed)
            } else {
                setElapsedSeconds(0)
            }
            setLoading(false)
        }
        void load()

        return () => {
            alive = false
        }
    }, [])

    // 计时器更新
    useEffect(() => {
        if (activeTimer?.status === 'RUNNING') {
            const interval = setInterval(() => {
                setElapsedSeconds(prev => prev + 1)
            }, 1000)
            return () => clearInterval(interval)
        }
    }, [activeTimer?.status])

    // 开始计时
    const handleStart = async () => {
        if (!newTimer.description.trim()) return
        if (cases.length > 0 && !newTimer.caseId) {
            toast.error("请选择案件")
            return
        }

        setStarting(true)
        const result = await startTimer({
            description: newTimer.description,
            caseId: newTimer.caseId || undefined
        })

        if (!result.success) {
            toast.error("开始计时失败", { description: result.error })
            setStarting(false)
            return
        }

        await loadActiveTimer()
        setShowStartDialog(false)
        setNewTimer({ description: '', caseId: '' })
        onTimerChanged?.()
        setStarting(false)
    }

    // 停止计时
    const handleStop = async () => {
        if (!activeTimer) return

        setStopping(true)
        const result = await stopTimer(activeTimer.id)

        if (result.success) {
            setActiveTimer(null)
            setElapsedSeconds(0)
            onTimerChanged?.()
        }
        setStopping(false)
    }

    // 暂停/恢复
    const handlePauseResume = async () => {
        if (!activeTimer) return

        if (activeTimer.status === 'RUNNING') {
            await pauseTimer(activeTimer.id)
        } else {
            await resumeTimer(activeTimer.id)
        }
        await loadActiveTimer()
    }

    // 格式化显示时间
    const formatTime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600)
        const mins = Math.floor((seconds % 3600) / 60)
        const secs = seconds % 60
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    return (
        <>
            <Card
                className={
                    loading
                        ? "bg-gradient-to-r from-primary-50 to-primary-100 border-primary-200"
                        : `border-2 transition-colors ${activeTimer?.status === 'RUNNING'
                              ? 'bg-gradient-to-r from-primary-50 to-primary-100 border-primary-300'
                              : activeTimer?.status === 'PAUSED'
                                  ? 'bg-warning/10 border-warning/30'
                                  : 'border-border'
                          }`
                }
            >
                <CardContent className={loading ? "p-4 flex items-center justify-center" : "p-4"}>
                    {loading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : activeTimer ? (
                        <div className="space-y-3">
                            {/* 计时显示 */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Clock
                                            className={`h-5 w-5 ${activeTimer.status === 'RUNNING' ? 'text-primary animate-pulse' : 'text-warning'}`}
                                        />
                                        <span className="font-mono text-2xl font-bold">
                                            {formatTime(elapsedSeconds)}
                                        </span>
                                        {activeTimer.status === 'PAUSED' && (
                                            <Badge variant="secondary" className="bg-warning/15 text-warning-foreground">
                                                已暂停
                                            </Badge>
                                        )}
                                    </div>
                                <div className="flex gap-2">
                                    <Button
                                        size="icon"
                                        variant="outline"
                                        onClick={handlePauseResume}
                                        title={activeTimer.status === 'RUNNING' ? '暂停' : '继续'}
                                        aria-label={activeTimer.status === 'RUNNING' ? '暂停计时' : '继续计时'}
                                        data-testid="timer-widget-toggle"
                                    >
                                        {activeTimer.status === 'RUNNING' ? (
                                            <Pause className="h-4 w-4" />
                                        ) : (
                                            <Play className="h-4 w-4" />
                                        )}
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="destructive"
                                        onClick={handleStop}
                                        disabled={stopping}
                                        title="停止"
                                        aria-label="停止计时"
                                        data-testid="timer-widget-stop"
                                    >
                                        {stopping ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Square className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            </div>

                            {/* 描述 */}
                            <div className="text-sm text-muted-foreground">
                                {activeTimer.description}
                            </div>

                            {/* 关联案件 */}
                            {activeTimer.case && (
                                <div className="flex items-center gap-2 text-xs">
                                    <Briefcase className="h-3 w-3 text-primary" />
                                    <span className="text-primary">
                                        {activeTimer.case.caseCode} - {activeTimer.case.title}
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Clock className="h-5 w-5" />
                                <span data-testid="timer-widget-idle">未在计时</span>
                            </div>
                            <Button
                                onClick={() => setShowStartDialog(true)}   
                            >
                                <Play className="h-4 w-4 mr-1" />
                                开始计时
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* 开始计时对话框 */}
            <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>开始计时</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <Label htmlFor="description">工作描述 *</Label>
                            <Input
                                id="description"
                                placeholder="您正在做什么？"
                                value={newTimer.description}
                                onChange={e => setNewTimer(prev => ({ ...prev, description: e.target.value }))}
                            />
                        </div>
                        {cases.length > 0 && (
                            <div>
                                <Label>关联案件</Label>
                                <Select
                                    value={newTimer.caseId}
                                    onValueChange={v => setNewTimer(prev => ({ ...prev, caseId: v }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="选择案件（可选）" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {cases.map(c => (
                                            <SelectItem key={c.id} value={c.id}>
                                                {c.caseCode} - {c.title}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowStartDialog(false)}>
                            取消
                        </Button>
                        <Button
                            onClick={handleStart}
                            disabled={starting || !newTimer.description.trim()}
                        >
                            {starting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    开始中...
                                </>
                            ) : (
                                <>
                                    <Play className="h-4 w-4 mr-1" />
                                    开始
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
