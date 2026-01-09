"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Textarea } from "@/components/ui/Textarea"
import type { CalendarEventDTO } from "@/actions/event-actions"
import { createEvent, getAvailableSlots, getEventById, getEventOccurrencesInRange } from "@/actions/event-actions"
import { EventDetailDialog } from "@/components/calendar/EventDetailDialog"
import { LegoDeck } from "@/components/layout/LegoDeck"
import type { SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { getEventTypeMeta } from "@/lib/event-type-meta"
import { getToneSoftClassName } from "@/lib/ui/tone"
import {
    // Calendar as CalendarIcon,
    Clock,
    Plus,
    ChevronLeft,
    ChevronRight,
    // Grid3X3,
    // List,
    // Users,
    MapPin
    // Video,
    // Scale,
    // MessageSquare,
    // FileText
} from "lucide-react"

type ViewMode = "week" | "day" | "month" | "list"

function toDateTimeLocalValue(date: Date) {
    const pad = (n: number) => n.toString().padStart(2, "0")
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function parseLocalInput(value: string) {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return d
}

export function CanvasCalendar(props: {
    initialEvents: CalendarEventDTO[]
    currentUserId: string
    teamMembers: { id: string; name: string; avatarUrl: string | null }[]
}) {
    const { initialEvents, currentUserId, teamMembers } = props
    const [viewMode, setViewMode] = useState<ViewMode>('week')
    const [currentDate, setCurrentDate] = useState(new Date())
    const [events, setEvents] = useState<CalendarEventDTO[]>(initialEvents)
    const [showCreateDialog, setShowCreateDialog] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const router = useRouter()
    const didInit = useRef(false)

    const prevLabel = viewMode === "day" ? "前一天" : viewMode === "month" ? "上个月" : "上一周"
    const nextLabel = viewMode === "day" ? "后一天" : viewMode === "month" ? "下个月" : "下一周"

    const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
    const selectedEvent = useMemo(() => events.find((e) => e.id === selectedEventId) || null, [events, selectedEventId])
    const [showDetailDialog, setShowDetailDialog] = useState(false)
    const [selectedEventDetail, setSelectedEventDetail] = useState<CalendarEventDTO | null>(null)

    useEffect(() => {
        if (!showDetailDialog || !selectedEventId) {
            setSelectedEventDetail(null)
            return
        }

        let cancelled = false
        setSelectedEventDetail(null)

        getEventById(selectedEventId)
            .then((res) => {
                if (cancelled) return
                if (!res.success) {
                    toast.error("加载日程详情失败", { description: res.error })
                    return
                }
                setSelectedEventDetail(res.data)
                setEvents((prev) =>
                    prev.some((e) => e.id === res.data.id)
                        ? prev.map((e) => (e.id === res.data.id ? res.data : e))
                        : [res.data, ...prev]
                )
            })
            .catch(() => {
                if (cancelled) return
                toast.error("加载日程详情失败")
            })

        return () => {
            cancelled = true
        }
    }, [selectedEventId, showDetailDialog])

    const eventForDialog = useMemo(
        () => selectedEventDetail ?? selectedEvent,
        [selectedEvent, selectedEventDetail]
    )

    // 新建事件表单状态
    const [newEvent, setNewEvent] = useState({
        title: '',
        type: 'MEETING',
        startTime: '',
        endTime: '',
        location: '',
        description: '',
        visibility: 'TEAM_BUSY',
        participantIds: [] as string[],
    })
    const [isCreating, setIsCreating] = useState(false)
    const [memberQuery, setMemberQuery] = useState("")

    const filteredMembers = useMemo(() => {
        const q = memberQuery.trim().toLowerCase()
        return teamMembers
            .filter((m) => m.id !== currentUserId)
            .filter((m) => {
                if (!q) return true
                return (m.name || "").toLowerCase().includes(q)
            })
            .slice(0, 300)
    }, [memberQuery, teamMembers, currentUserId])

    // Scroll to 8 AM on mount
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 400 // Approx 8 AM
        }
    }, [viewMode])

    const getWeekDays = (date: Date) => {
        const start = new Date(date)
        // Monday as the first day of week
        const offset = (date.getDay() + 6) % 7
        start.setDate(date.getDate() - offset)
        start.setHours(0, 0, 0, 0)
        const days = []
        for (let i = 0; i < 7; i++) {
            const d = new Date(start)
            d.setDate(start.getDate() + i)
            days.push(d)
        }
        return days
    }

    const weekDays = getWeekDays(currentDate)

    const [loadingEvents, setLoadingEvents] = useState(false)

    const computeRange = (date: Date, mode: ViewMode) => {
        if (mode === "day") {
            const from = new Date(date)
            from.setHours(0, 0, 0, 0)
            const to = new Date(from)
            to.setDate(to.getDate() + 1)
            return { from, to }
        }

        if (mode === "month") {
            const first = new Date(date.getFullYear(), date.getMonth(), 1)
            const firstOffset = (first.getDay() + 6) % 7
            const from = new Date(first)
            from.setDate(first.getDate() - firstOffset)
            from.setHours(0, 0, 0, 0)

            const last = new Date(date.getFullYear(), date.getMonth() + 1, 0)
            const lastOffset = (7 - ((last.getDay() + 6) % 7) - 1 + 7) % 7
            const to = new Date(last)
            to.setDate(last.getDate() + lastOffset + 1)
            to.setHours(0, 0, 0, 0)
            return { from, to }
        }

        // week/list default
        const start = new Date(date)
        const offset = (start.getDay() + 6) % 7
        start.setDate(start.getDate() - offset)
        start.setHours(0, 0, 0, 0)
        const end = new Date(start)
        end.setDate(start.getDate() + 7)
        return { from: start, to: end }
    }

    const reloadEvents = useCallback(async (date: Date = currentDate, mode: ViewMode = viewMode) => {
        const { from, to } = computeRange(date, mode)
        setLoadingEvents(true)
        try {
            const res = await getEventOccurrencesInRange({
                from: from.toISOString(),
                to: to.toISOString(),
                userIds: [currentUserId],
            })
            if (!res.success) {
                toast.error("获取日程失败", { description: res.error })
                return
            }

            const seen = new Set<string>()
            const next = res.data
                .map((o) => o.event)
                .filter((e) => {
                    if (seen.has(e.id)) return false
                    seen.add(e.id)
                    return true
                })
            setEvents(next)
        } finally {
            setLoadingEvents(false)
        }
    }, [currentDate, currentUserId, viewMode])

    useEffect(() => {
        if (!didInit.current) {
            didInit.current = true
            return
        }
        void reloadEvents()
    }, [reloadEvents])

    const getEventTypeColor = (type: string, canViewDetails?: boolean) => {
        if (canViewDetails === false) {
            return getToneSoftClassName("secondary")
        }
        const meta = getEventTypeMeta(type)
        return getToneSoftClassName(meta.tone)
    }

    const renderWeekView = () => {
        const hours = Array.from({ length: 24 }, (_, i) => i)

        return (
            <div className="flex flex-col h-full min-h-[560px] overflow-hidden bg-card rounded-lg border shadow-sm">
                {/* Header Row */}
                <div className="flex border-b">
                    <div className="w-16 flex-shrink-0 border-r bg-muted/30"></div>
                    <div className="flex-1 grid grid-cols-7">
                        {weekDays.map((day, i) => {
                            const isToday = day.toDateString() === new Date().toDateString()
                            return (
                                <div
                                    key={i}
                                    className={cn("text-center py-2 border-r last:border-r-0", isToday && "bg-info/10")}
                                >
                                    <div className={cn("text-xs font-medium", isToday ? "text-foreground" : "text-muted-foreground")}>
                                        {day.toLocaleDateString('zh-CN', { weekday: 'short' })}
                                    </div>
                                    <div className="text-lg font-bold text-foreground">
                                        {day.getDate()}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Scrollable Grid */}
                <div
                    className="flex-1 overflow-y-auto relative"
                    ref={scrollRef}
                    tabIndex={0}
                    aria-label="日程时间网格（可滚动）"
                >
                    <div className="flex relative min-h-[1440px]"> {/* 24h * 60px/h */}
                        {/* Time Labels */}
                        <div className="w-16 flex-shrink-0 border-r bg-muted/30 text-xs text-muted-foreground text-right pr-2 pt-2 select-none">
                            {hours.map(h => (
                                <div key={h} className="h-[60px] relative -top-3">
                                    {h.toString().padStart(2, '0')}:00
                                </div>
                            ))}
                        </div>

                        {/* Grid Lines */}
                        <div className="flex-1 grid grid-cols-7 relative">
                            {/* Horizontal Lines */}
                            <div className="absolute inset-0 flex flex-col pointer-events-none">
                                {hours.map(h => (
                                    <div key={h} className="h-[60px] border-b border-border/40 w-full"></div>
                                ))}
                            </div>

                            {/* Vertical Lines & Day Columns */}
                            {weekDays.map((day, dayIndex) => (
                                <div key={dayIndex} className="border-r last:border-r-0 relative h-full">
                                    {/* Events for this day */}
                                    {events
                                        .filter(e => new Date(e.startTime).toDateString() === day.toDateString())
                                        .map(event => {
                                            const start = new Date(event.startTime)
                                            const end = new Date(event.endTime)
                                            const top = (start.getHours() * 60) + start.getMinutes()
                                            const height = Math.max(30, ((end.getTime() - start.getTime()) / (1000 * 60))) // Min 30px height

                                            return (
                                                <div
                                                    key={event.id}
                                                    className={`absolute left-1 right-1 rounded px-2 py-1 text-xs border-l-4 cursor-pointer hover:brightness-95 transition-all shadow-sm z-10 ${getEventTypeColor(event.type, event.canViewDetails)}`}
                                                    style={{ top: `${top}px`, height: `${height}px` }}
                                                    onClick={() => {
                                                        setSelectedEventId(event.id)
                                                        setShowDetailDialog(true)
                                                    }}
                                                >
                                                    <div className="font-bold truncate">{event.title}</div>
                                                    <div className="truncate opacity-80">{event.location}</div>
                                                </div>
                                            )
                                        })}

                                    {/* Current Time Indicator (if today) */}
                                    {day.toDateString() === new Date().toDateString() && (
                                        <div
                                            className="absolute w-full border-t-2 border-destructive z-20 pointer-events-none"
                                            style={{ top: `${(new Date().getHours() * 60) + new Date().getMinutes()}px` }}
                                        >
                                            <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-destructive"></div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    const renderMonthView = () => {
        const { from, to } = computeRange(currentDate, "month")
        const days: Date[] = []
        const cursor = new Date(from)
        while (cursor < to) {
            days.push(new Date(cursor))
            cursor.setDate(cursor.getDate() + 1)
        }

        const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"]
        const isSameMonth = (d: Date) => d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear()

        return (
            <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
                <div className="grid grid-cols-7 border-b bg-muted/30">
                    {weekdayLabels.map((label) => (
                        <div key={label} className="py-2 text-center text-xs font-medium text-muted-foreground">
                            {label}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7">
                    {days.map((day) => {
                        const inMonth = isSameMonth(day)
                        const isToday = day.toDateString() === new Date().toDateString()
                        const dayEvents = events
                            .filter((e) => new Date(e.startTime).toDateString() === day.toDateString())
                            .slice(0, 3)

                        return (
                            <div
                                key={day.toISOString()}
                                className={cn(
                                    "min-h-28 border-b border-r last:border-r-0 p-2 hover:bg-accent cursor-pointer transition-colors",
                                    !inMonth && "bg-muted/30 text-muted-foreground",
                                    isToday && "bg-info/10"
                                )}
                                onClick={() => {
                                    setCurrentDate(day)
                                    setViewMode("day")
                                }}
                            >
                                <div className="flex items-center justify-between">
                                    <div className={cn("text-sm font-semibold", isToday && "text-foreground")}>{day.getDate()}</div>
                                </div>

                                <div className="mt-2 space-y-1">
                                    {dayEvents.map((event) => (
                                        <div
                                            key={event.id}
                                            className={cn(
                                                "text-[11px] px-2 py-1 rounded border cursor-pointer hover:brightness-95",
                                                getEventTypeColor(event.type, event.canViewDetails)
                                            )}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setSelectedEventId(event.id)
                                                setShowDetailDialog(true)
                                            }}
                                        >
                                            <div className="truncate">{event.title}</div>
                                        </div>
                                    ))}
                                    {events.filter((e) => new Date(e.startTime).toDateString() === day.toDateString()).length > 3 ? (
                                        <div className="text-[11px] text-muted-foreground px-2">更多...</div>
                                    ) : null}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    }

    return (
        <div className="h-full min-h-0 flex flex-col">
            <LegoDeck
                sectionId="calendar_canvas_deck"
                rowHeight={26}
                className="flex-1 min-h-0"
                catalog={[
                    {
                        id: "toolbar",
                        title: "工具栏",
                        pinned: true,
                        chrome: "none",
                        defaultSize: { w: 12, h: 5, minW: 8, minH: 4 },
                        content: (
            <div className="flex items-center justify-between bg-card p-4 rounded-lg border shadow-sm">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-bold text-foreground">
                        {currentDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}
                    </h2>
                    <div className="flex items-center rounded-md border bg-muted/30">
                        <Button variant="ghost" size="icon" aria-label={prevLabel} title={prevLabel} onClick={() => {
                            const d = new Date(currentDate)
                            if (viewMode === "day") d.setDate(d.getDate() - 1)
                            else if (viewMode === "month") d.setMonth(d.getMonth() - 1)
                            else d.setDate(d.getDate() - 7)
                            setCurrentDate(d)
                        }} disabled={loadingEvents}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setCurrentDate(new Date())} disabled={loadingEvents}>
                            今天
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={nextLabel} title={nextLabel} onClick={() => {
                            const d = new Date(currentDate)
                            if (viewMode === "day") d.setDate(d.getDate() + 1)
                            else if (viewMode === "month") d.setMonth(d.getMonth() + 1)
                            else d.setDate(d.getDate() + 7)
                            setCurrentDate(d)
                        }} disabled={loadingEvents}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                        <SelectTrigger className="w-[120px]" aria-label="选择日程视图">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="week">周视图</SelectItem>
                            <SelectItem value="day">日视图</SelectItem>
                            <SelectItem value="month">月视图</SelectItem>
                            <SelectItem value="list">列表</SelectItem>
                        </SelectContent>
                    </Select>
                    {loadingEvents ? (
                        <span className="text-xs text-muted-foreground">加载中...</span>
                    ) : null}
                    <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="mr-2 h-4 w-4" /> 新建日程
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[500px]">
                            <DialogHeader>
                                <DialogTitle>新建日程</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label>标题</Label>
                                    <Input
                                        value={newEvent.title}
                                        onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                                        placeholder="输入日程标题"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>开始时间</Label>
                                        <Input
                                            type="datetime-local"
                                            value={newEvent.startTime}
                                            onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>结束时间</Label>
                                        <Input
                                            type="datetime-local"
                                            value={newEvent.endTime}
                                            onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>类型</Label>
                                    <Select value={newEvent.type} onValueChange={(v) => setNewEvent({ ...newEvent, type: v })}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="MEETING">会议</SelectItem>
                                            <SelectItem value="HEARING">开庭</SelectItem>
                                            <SelectItem value="DEADLINE">截止日期</SelectItem>
                                            <SelectItem value="OTHER">其他</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>可见性</Label>
                                    <Select
                                        value={newEvent.visibility}
                                        onValueChange={(v) => setNewEvent({ ...newEvent, visibility: v })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="TEAM_BUSY">团队忙闲（默认）</SelectItem>
                                            <SelectItem value="TEAM_PUBLIC">团队公开</SelectItem>
                                            <SelectItem value="CASE_TEAM">案件组可见</SelectItem>
                                            <SelectItem value="PRIVATE">仅我/参与人</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <Label>参与人</Label>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={isCreating || newEvent.participantIds.length === 0}
                                            onClick={async () => {
                                                const start = parseLocalInput(newEvent.startTime) || new Date()
                                                const end = parseLocalInput(newEvent.endTime)
                                                const durationMinutes = end
                                                    ? Math.max(15, Math.round((end.getTime() - start.getTime()) / 60_000))
                                                    : 60

                                                const from = new Date()
                                                const to = new Date()
                                                to.setDate(to.getDate() + 7)

                                                const userIds = Array.from(new Set([currentUserId, ...newEvent.participantIds]))
                                                if (userIds.length > 300) {
                                                    toast.error("推荐失败", { description: "最多支持 300 人参与排期" })
                                                    return
                                                }

                                                const res = await getAvailableSlots({
                                                    userIds,
                                                    from: from.toISOString(),
                                                    to: to.toISOString(),
                                                    durationMinutes,
                                                })

                                                if (!res.success) {
                                                    toast.error("推荐失败", { description: res.error })
                                                    return
                                                }
                                                const first = res.data?.[0]?.slots?.[0]
                                                if (!first) {
                                                    toast.info("暂无可用时间", { description: "请调整参与人或时间范围" })
                                                    return
                                                }
                                                const s = new Date(first.startTime)
                                                const e = new Date(first.endTime)
                                                setNewEvent((prev) => ({
                                                    ...prev,
                                                    startTime: toDateTimeLocalValue(s),
                                                    endTime: toDateTimeLocalValue(e),
                                                }))
                                                toast.success("已填入推荐时间")
                                            }}
                                        >
                                            推荐可用时间
                                        </Button>
                                    </div>
                                    <Input
                                        value={memberQuery}
                                        onChange={(e) => setMemberQuery(e.target.value)}
                                        placeholder="搜索成员（支持 30-300 人规模）"
                                    />
                                    <div className="max-h-40 overflow-auto rounded-md border bg-card/50 p-2 space-y-1">
                                        {filteredMembers.length === 0 ? (
                                            <div className="text-sm text-muted-foreground py-2">未找到成员</div>
                                        ) : (
                                            filteredMembers.map((m) => {
                                                const checked = newEvent.participantIds.includes(m.id)
                                                return (
                                                    <label
                                                        key={m.id}
                                                        className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-accent cursor-pointer"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    const next = Array.from(new Set([...newEvent.participantIds, m.id]))
                                                                    const total = new Set([currentUserId, ...next]).size
                                                                    if (total > 300) {
                                                                        toast.error("最多支持 300 人参与排期")
                                                                        return
                                                                    }
                                                                    setNewEvent({ ...newEvent, participantIds: next })
                                                                    return
                                                                }

                                                                const next = newEvent.participantIds.filter((id) => id !== m.id)
                                                                setNewEvent({ ...newEvent, participantIds: next })
                                                            }}
                                                        />
                                                        <span className="truncate">{m.name}</span>
                                                    </label>
                                                )
                                            })
                                        )}
                                    </div>
                                    {newEvent.participantIds.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {newEvent.participantIds.slice(0, 8).map((id) => {
                                                const member = teamMembers.find((m) => m.id === id)
                                                return (
                                                    <Badge key={id} variant="secondary" className="text-xs">
                                                        {member?.name || id.slice(0, 6)}
                                                    </Badge>
                                                )
                                            })}
                                            {newEvent.participantIds.length > 8 ? (
                                                <Badge variant="outline" className="text-xs">
                                                    +{newEvent.participantIds.length - 8}
                                                </Badge>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </div>
                                <div className="space-y-2">
                                    <Label>地点</Label>
                                    <Input
                                        value={newEvent.location}
                                        onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                                        placeholder="会议地点或线上会议链接"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>描述</Label>
                                    <Textarea
                                        value={newEvent.description}
                                        onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                                        placeholder="日程详情..."
                                        rows={3}
                                    />
                                </div>
                                <Button
                                    className="w-full"
                                    disabled={isCreating || !newEvent.title || !newEvent.startTime || !newEvent.endTime}
                                    onClick={async () => {
                                        setIsCreating(true)
                                        try {
                                            const start = parseLocalInput(newEvent.startTime)
                                            const end = parseLocalInput(newEvent.endTime)
                                            if (!start || !end) {
                                                toast.error("时间格式不正确")
                                                return
                                            }

                                            const result = await createEvent({
                                                title: newEvent.title.trim(),
                                                type: newEvent.type,
                                                startTime: start,
                                                endTime: end,
                                                location: newEvent.location || undefined,
                                                description: newEvent.description || undefined,
                                                visibility: newEvent.visibility,
                                                participantIds: newEvent.participantIds,
                                            })
                                            if (!result.success) {
                                                toast.error("创建失败", { description: result.error })
                                                return
                                            }

                                            setShowCreateDialog(false)
                                            setNewEvent({
                                                title: "",
                                                type: "MEETING",
                                                startTime: "",
                                                endTime: "",
                                                location: "",
                                                description: "",
                                                visibility: "TEAM_BUSY",
                                                participantIds: [],
                                            })
                                            setMemberQuery("")
                                            await reloadEvents()
                                            router.refresh()
                                        } finally {
                                            setIsCreating(false)
                                        }
                                    }}
                                >
                                    {isCreating ? '创建中...' : '创建日程'}
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>
                        ),
                    },
                    {
                        id: "main_view",
                        title: "日历视图",
                        pinned: true,
                        chrome: "none",
                        defaultSize: { w: 12, h: 18, minW: 8, minH: 12 },
                        content: (
            <div className="h-full min-h-0">
                {viewMode === 'week' && renderWeekView()}
                {viewMode === "month" && renderMonthView()}
                {viewMode === 'day' && (
                    <div className="flex flex-col h-full min-h-[560px] overflow-hidden bg-card rounded-lg border shadow-sm">
                        <div className="p-4 border-b bg-muted/30">
                            <h3 className="text-lg font-bold">
                                {currentDate.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
                            </h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4" tabIndex={0} aria-label="日程列表（可滚动）">
                            {events
                                .filter(e => new Date(e.startTime).toDateString() === currentDate.toDateString())
                                .map(event => (
                                    <div
                                        key={event.id}
                                        className={cn(
                                            "mb-3 p-4 rounded-lg border-l-4 cursor-pointer hover:bg-accent",
                                            getEventTypeColor(event.type, event.canViewDetails)
                                        )}
                                        onClick={() => {
                                            setSelectedEventId(event.id)
                                            setShowDetailDialog(true)
                                        }}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="font-bold text-lg">{event.title}</div>
                                                <div className="text-sm text-muted-foreground mt-1">
                                                    <Clock className="inline h-4 w-4 mr-1" />
                                                    {new Date(event.startTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                                    {' - '}
                                                    {new Date(event.endTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                                {event.location && (
                                                    <div className="text-sm text-muted-foreground mt-1">
                                                        <MapPin className="inline h-4 w-4 mr-1" />
                                                        {event.location}
                                                    </div>
                                                )}
                                            </div>
                                            <Badge variant="outline">{getEventTypeMeta(event.type).label}</Badge>
                                        </div>
                                    </div>
                                ))}
                            {events.filter(e => new Date(e.startTime).toDateString() === currentDate.toDateString()).length === 0 && (
                                <div className="text-center py-12 text-muted-foreground">今天没有日程</div>
                            )}
                        </div>
                    </div>
                )}
                {viewMode === 'list' && (
                    <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
                        <div className="divide-y">
                            {events.map(event => (
                                <div
                                    key={event.id}
                                    className="p-4 hover:bg-accent transition-colors cursor-pointer"
                                    onClick={() => {
                                        setSelectedEventId(event.id)
                                        setShowDetailDialog(true)
                                    }}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-1 h-12 rounded ${getEventTypeColor(event.type, event.canViewDetails).split(' ')[0]}`}></div>
                                        <div className="flex-1">
                                            <div className="font-medium">{event.title}</div>
                                            <div className="text-sm text-muted-foreground">
                                                {new Date(event.startTime).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                                                {' '}
                                                {new Date(event.startTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                        <Badge variant="outline">{getEventTypeMeta(event.type).label}</Badge>
                                    </div>
                                </div>
                            ))}
                            {events.length === 0 && (
                                <div className="text-center py-12 text-muted-foreground">暂无日程</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
                        ),
                    },
                ] satisfies SectionCatalogItem[]}
            />

            <EventDetailDialog
                open={showDetailDialog}
                onOpenChange={setShowDetailDialog}
                event={eventForDialog}
                currentUserId={currentUserId}
                onEventChanged={() => void reloadEvents()}
            />
        </div>
    )
}
