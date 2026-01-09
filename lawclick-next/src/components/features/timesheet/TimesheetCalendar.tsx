"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Clock, Loader2 } from "lucide-react"

import { getMyTimeLogs, getMyTimeLogsMeta } from "@/actions/timelogs-crud"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { cn } from "@/lib/utils"
import { getToneSoftClassName } from "@/lib/ui/tone"

type TimesheetEntry = {
    id: string
    day: number // 1..5 (Mon..Fri)
    startHour: number
    startMinute: number
    durationHours: number
    title: string
    color: string
}

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8) // 8:00 to 18:00
const DAYS = ["周一", "周二", "周三", "周四", "周五"]

function startOfWeekMonday(date: Date) {
    const d = new Date(date)
    const day = d.getDay()
    const diffToMonday = (day + 6) % 7
    d.setDate(d.getDate() - diffToMonday)
    d.setHours(0, 0, 0, 0)
    return d
}

function addDays(date: Date, days: number) {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    return d
}

function formatWeekLabel(weekStart: Date) {
    const weekEnd = addDays(weekStart, 6)
    const startLabel = weekStart.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })
    const endLabel = weekEnd.toLocaleDateString("zh-CN", { month: "short", day: "numeric" })
    return `${startLabel} - ${endLabel}`
}

export function TimesheetCalendar() {
    const [currentWeek, setCurrentWeek] = React.useState(() => new Date())
    const [loading, setLoading] = React.useState(true)
    const [entries, setEntries] = React.useState<TimesheetEntry[]>([])
    const [total, setTotal] = React.useState(0)
    const [limit, setLimit] = React.useState(0)
    const [hasMore, setHasMore] = React.useState(false)

    const load = React.useCallback(async () => {
        setLoading(true)
        setTotal(0)
        setLimit(0)
        setHasMore(false)
        const weekStart = startOfWeekMonday(currentWeek)
        const weekEnd = addDays(weekStart, 7)

        const [res, meta] = await Promise.all([
            getMyTimeLogs({
                from: weekStart.toISOString(),
                to: weekEnd.toISOString(),
                status: ["COMPLETED", "APPROVED", "BILLED"],
                take: 500,
            }),
            getMyTimeLogsMeta({
                from: weekStart.toISOString(),
                to: weekEnd.toISOString(),
                status: ["COMPLETED", "APPROVED", "BILLED"],
                take: 500,
            }),
        ])

        if (meta.success) {
            setTotal(meta.total)
            setLimit(meta.limit)
            setHasMore(meta.hasMore)
        }

        if (!res.success) {
            setEntries([])
            setLoading(false)
            return
        }

        const mapped = res.data
            .map((log): TimesheetEntry | null => {
                const start = new Date(log.startTime)
                const dayIndex = ((start.getDay() + 6) % 7) + 1 // Mon=1 ... Sun=7
                if (dayIndex < 1 || dayIndex > 5) return null

                return {
                    id: log.id,
                    day: dayIndex,
                    startHour: start.getHours(),
                    startMinute: start.getMinutes(),
                    durationHours: (log.duration || 0) / 3600,
                    title: log.case ? `${log.case.caseCode} · ${log.description}` : log.description,
                    color: log.isBillable ? getToneSoftClassName("info") : getToneSoftClassName("secondary"),
                } satisfies TimesheetEntry
            })
            .filter((entry): entry is TimesheetEntry => Boolean(entry))

        setEntries(mapped)
        setLoading(false)
    }, [currentWeek])

    React.useEffect(() => {
        load()
    }, [load])

    const weekStart = startOfWeekMonday(currentWeek)

    return (
        <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b">
                <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-base font-semibold">周工时表</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setCurrentWeek((d) => addDays(d, -7))}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-medium w-40 text-center">{formatWeekLabel(weekStart)}</span>
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setCurrentWeek((d) => addDays(d, 7))}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="p-0 overflow-auto">
                {hasMore ? (
                    <div className="border-b border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning-foreground flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                            本周工时记录较多，为性能考虑仅显示前 {limit || 500} / {total} 条。建议前往工时追踪查看完整记录。
                        </div>
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/time">打开工时追踪</Link>
                        </Button>
                    </div>
                ) : null}
                <div className="min-w-[600px]">
                    <div className="flex border-b">
                        <div className="w-16 flex-shrink-0 border-r bg-muted/30"></div>
                        {DAYS.map((day, i) => (
                            <div
                                key={day}
                                className="flex-1 text-center py-2 text-sm font-medium border-r last:border-r-0 bg-muted/10"
                            >
                                {day}{" "}
                                <span className="text-muted-foreground font-normal ml-1">
                                    {addDays(weekStart, i).getDate()}
                                </span>
                            </div>
                        ))}
                    </div>

                    <div className="relative">
                        {HOURS.map((hour) => (
                            <div key={hour} className="flex h-16 border-b last:border-b-0">
                                <div className="w-16 flex-shrink-0 border-r bg-muted/5 text-xs text-muted-foreground p-1 text-right">
                                    {hour}:00
                                </div>
                                {DAYS.map((day) => (
                                    <div key={day} className="flex-1 border-r last:border-r-0 relative"></div>
                                ))}
                            </div>
                        ))}

                        {loading ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            entries.map((entry) => {
                                const topOffset =
                                    (entry.startHour - 8) * 64 + (entry.startMinute / 60) * 64
                                const height = entry.durationHours * 64
                                const leftPercent = ((entry.day - 1) / 5) * 100
                                const widthPercent = (1 / 5) * 100

                                return (
                                    <div
                                        key={entry.id}
                                        className={cn(
                                            "absolute rounded mt-px mx-px p-2 text-xs font-medium cursor-pointer hover:brightness-95 transition-all shadow-sm flex flex-col items-start justify-center border",
                                            entry.color
                                        )}
                                        style={{
                                            top: `${topOffset}px`,
                                            height: `${Math.max(20, height - 2)}px`,
                                            left: `calc(4rem + ${leftPercent}%)`,
                                            width: `calc(${widthPercent}% - 2px)`,
                                        }}
                                        title={entry.title}
                                    >
                                        <span className="font-bold line-clamp-2">{entry.title}</span>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
