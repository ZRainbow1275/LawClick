"use client"

import * as React from "react"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, Users } from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"

import type { CalendarEventDTO, CalendarEventOccurrenceDTO } from "@/actions/event-actions"
import { getEventOccurrencesInRange } from "@/actions/event-actions"
import { updateMyDispatchUiPreferences } from "@/actions/ui-settings"
import { EventDetailDialog } from "@/components/calendar/EventDetailDialog"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { cn } from "@/lib/utils"
import { getEventTypeMeta } from "@/lib/event-type-meta"
import { getToneSoftClassName } from "@/lib/ui/tone"

type Member = {
    id: string
    name: string
    role: string
    avatarUrl?: string | null
    status?: string
}

const START_HOUR = 8
const END_HOUR = 20
const PX_PER_MIN = 2

function startOfDay(date: Date) {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    return d
}

function addDays(date: Date, days: number) {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    return d
}

function diffMinutes(a: Date, b: Date) {
    return Math.round((a.getTime() - b.getTime()) / 60_000)
}

function getColor(event: CalendarEventDTO) {
    if (event.canViewDetails === false) return getToneSoftClassName("secondary")
    const meta = getEventTypeMeta(event.type)
    return getToneSoftClassName(meta.tone)
}

export function DispatchScheduleBoardClient(props: {
    members: Member[]
    currentUserId: string
    initialSelectedIds?: string[]
}) {
    const { members, currentUserId, initialSelectedIds } = props
    const [date, setDate] = React.useState(() => new Date())
    const [loading, setLoading] = React.useState(false)
    const [occurrences, setOccurrences] = React.useState<CalendarEventOccurrenceDTO[]>([])

    const [pickerOpen, setPickerOpen] = React.useState(false)
    const [query, setQuery] = React.useState("")
    const [selectedUserIds, setSelectedUserIds] = React.useState<string[]>(() => {
        const fallback = [currentUserId, ...members.map((m) => m.id).filter((id) => id !== currentUserId)].slice(0, 6)
        const preset = (initialSelectedIds && initialSelectedIds.length ? initialSelectedIds : fallback).filter(Boolean)
        return Array.from(new Set(preset))
    })
    const [draftUserIds, setDraftUserIds] = React.useState<string[]>(selectedUserIds)
    const [savingSelection, setSavingSelection] = React.useState(false)

    const [detailOpen, setDetailOpen] = React.useState(false)
    const [selectedEvent, setSelectedEvent] = React.useState<CalendarEventDTO | null>(null)

    const defaultSelectedUserIds = React.useMemo(() => {
        const fallback = [currentUserId, ...members.map((m) => m.id).filter((id) => id !== currentUserId)].slice(0, 6)
        return Array.from(new Set(fallback))
    }, [currentUserId, members])

    const dayFrom = React.useMemo(() => startOfDay(date), [date])
    const dayTo = React.useMemo(() => addDays(dayFrom, 1), [dayFrom])

    const totalMinutes = (END_HOUR - START_HOUR) * 60
    const timelineWidth = totalMinutes * PX_PER_MIN

    const selectedMembers = React.useMemo(() => {
        const map = new Map(members.map((m) => [m.id, m]))
        return selectedUserIds.map((id) => map.get(id)).filter(Boolean) as Member[]
    }, [members, selectedUserIds])

    const occurrencesByUser = React.useMemo(() => {
        const map = new Map<string, CalendarEventDTO[]>()
        for (const occ of occurrences) {
            if (!map.has(occ.userId)) map.set(occ.userId, [])
            map.get(occ.userId)!.push(occ.event)
        }
        for (const [uid, list] of map.entries()) {
            list.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
            map.set(uid, list)
        }
        return map
    }, [occurrences])

    const load = React.useCallback(async () => {
        setLoading(true)
        try {
            const res = await getEventOccurrencesInRange({
                from: dayFrom.toISOString(),
                to: dayTo.toISOString(),
                userIds: selectedUserIds,
            })
            if (!res.success) {
                toast.error("加载失败", { description: res.error })
                return
            }
            setOccurrences(res.data)
        } finally {
            setLoading(false)
        }
    }, [dayFrom, dayTo, selectedUserIds])

    React.useEffect(() => {
        void load()
    }, [load])

    React.useEffect(() => {
        if (!pickerOpen) return
        setDraftUserIds(selectedUserIds)
        setQuery("")
    }, [pickerOpen, selectedUserIds])

    const filtered = React.useMemo(() => {
        const q = query.trim().toLowerCase()
        return members
            .filter((m) => (m.name || "").toLowerCase().includes(q) || (m.role || "").toLowerCase().includes(q))
            .slice(0, 300)
    }, [members, query])

    const toggleDraftUser = (id: string, checked: boolean) => {
        setDraftUserIds((prev) => {
            const next = checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)
            if (next.length > 300) {
                toast.info("已达上限", { description: "最多选择 300 人（与后端日程查询上限一致）" })
                return prev
            }
            return next.length === 0 ? [currentUserId] : next
        })
    }

    const persistSelection = React.useCallback(async (ids: string[]) => {
        setSavingSelection(true)
        try {
            const res = await updateMyDispatchUiPreferences({
                schedule: { selectedUserIds: ids },
            })
            if (!res.success) {
                toast.error("保存失败", { description: res.error })
            }
        } catch {
            toast.error("保存失败")
        } finally {
            setSavingSelection(false)
        }
    }, [])

    const scrollRef = React.useRef<HTMLDivElement | null>(null)
    const rowVirtualizer = useVirtualizer({
        count: selectedMembers.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => 56,
        overscan: 10,
    })

    return (
        <div className="rounded-lg border bg-card/50 overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-4 border-b bg-muted/30">
                <div className="flex items-center gap-3">
                    <h3 className="text-base font-semibold">团队日程泳道（Day View）</h3>
                    <Badge variant="outline" className="gap-1">
                        <Users className="h-3 w-3" />
                        {selectedUserIds.length} 人
                    </Badge>
                    {loading ? (
                        <Badge variant="secondary" className="text-xs">
                            加载中...
                        </Badge>
                    ) : null}
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                        选择成员
                    </Button>
                    <div className="flex items-center rounded-md border bg-card">
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="前一天"
                            title="前一天"
                            onClick={() => setDate((d) => addDays(d, -1))}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDate(new Date())}>
                            今天
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="后一天"
                            title="后一天"
                            onClick={() => setDate((d) => addDays(d, 1))}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            <div
                ref={scrollRef}
                className="overflow-auto max-h-[70vh]"
                tabIndex={0}
                aria-label="调度日程（可滚动）"
            >
                <div style={{ minWidth: 240 + timelineWidth }} className="min-h-[240px]">
                    <div className="flex border-b sticky top-0 bg-card z-10">
                        <div className="w-60 shrink-0 p-3 text-xs text-muted-foreground">
                            {dayFrom.toLocaleDateString("zh-CN", { month: "short", day: "numeric", weekday: "short" })}
                        </div>
                        <div className="relative" style={{ width: timelineWidth }}>
                            {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i).map((h) => (
                                <div
                                    key={h}
                                    className="absolute top-0 bottom-0 border-l border-border/40 text-[10px] text-muted-foreground"
                                    style={{ left: (h - START_HOUR) * 60 * PX_PER_MIN }}
                                >
                                    <div className="absolute -top-0.5 -translate-x-1/2 bg-card px-1">{h}:00</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
                        {rowVirtualizer.getVirtualItems().map((row) => {
                            const member = selectedMembers[row.index]
                            if (!member) return null
                            const list = occurrencesByUser.get(member.id) || []

                            return (
                                <div
                                    key={member.id}
                                    className="absolute left-0 top-0 w-full"
                                    style={{ transform: `translateY(${row.start}px)` }}
                                >
                                    <div className="flex border-b">
                                <div className="w-60 shrink-0 p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium truncate">{member.name}</div>
                                            <div className="text-xs text-muted-foreground truncate">{member.role}</div>
                                        </div>
                                        {member.id === currentUserId ? (
                                            <Badge variant="secondary" className="text-[10px]">
                                                我
                                            </Badge>
                                        ) : null}
                                    </div>
                                </div>

                                <div className="relative border-l" style={{ width: timelineWidth, height: 56 }}>
                                    <div className="absolute inset-0 flex pointer-events-none">
                                        {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i).map((i) => (
                                            <div
                                                key={i}
                                                className="h-full border-r border-border/40"
                                                style={{ width: 60 * PX_PER_MIN }}
                                            />
                                        ))}
                                    </div>

                                    {list
                                        .filter((e) => {
                                            const s = new Date(e.startTime)
                                            const ed = new Date(e.endTime)
                                            return s < dayTo && ed > dayFrom
                                        })
                                        .map((event) => {
                                            const start = new Date(event.startTime)
                                            const end = new Date(event.endTime)

                                            const windowStart = new Date(dayFrom)
                                            windowStart.setHours(START_HOUR, 0, 0, 0)
                                            const windowEnd = new Date(dayFrom)
                                            windowEnd.setHours(END_HOUR, 0, 0, 0)

                                            const s = start < windowStart ? windowStart : start
                                            const e = end > windowEnd ? windowEnd : end

                                            const leftMin = diffMinutes(s, windowStart)
                                            const widthMin = Math.max(15, diffMinutes(e, s))

                                            const left = leftMin * PX_PER_MIN
                                            const width = widthMin * PX_PER_MIN

                                            return (
                                                <div
                                                    key={`${member.id}_${event.id}`}
                                                    className={cn(
                                                        "absolute top-2 h-11 rounded border px-2 py-1 text-[11px] shadow-sm cursor-pointer hover:brightness-95",
                                                        getColor(event)
                                                    )}
                                                    style={{ left, width, minWidth: 40 }}
                                                    title={`${event.title} (${start.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}-${end.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })})`}
                                                    onClick={() => {
                                                        setSelectedEvent(event)
                                                        setDetailOpen(true)
                                                    }}
                                                >
                                                    <div className="truncate font-medium">{event.title}</div>
                                                    <div className="truncate opacity-70">
                                                        {start.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}-
                                                        {end.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                </div>
                            </div>
                                </div>
                        )
                        })}
                    </div>
                </div>
            </div>

            <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
                <DialogContent className="sm:max-w-[520px]">
                    <DialogHeader>
                        <DialogTitle>选择要展示的成员（最多 300）</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索姓名/角色..." />
                        <div className="max-h-80 overflow-auto rounded-md border bg-card/50 p-2 space-y-1">
                            {filtered.map((m) => {
                                const checked = draftUserIds.includes(m.id)
                                return (
                                    <label
                                        key={m.id}
                                        className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-accent cursor-pointer"
                                    >
                                        <input type="checkbox" checked={checked} onChange={(e) => toggleDraftUser(m.id, e.target.checked)} />
                                        <span className="truncate flex-1">{m.name}</span>
                                        <Badge variant="outline" className="text-[10px]">
                                            {m.role}
                                        </Badge>
                                    </label>
                                )
                            })}
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="text-xs text-muted-foreground">
                                已选择 {draftUserIds.length} 人 · 范围：{START_HOUR}:00-{END_HOUR}:00（虚拟渲染支持 30-300 人）
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setDraftUserIds(defaultSelectedUserIds)
                                        setSelectedUserIds(defaultSelectedUserIds)
                                        setPickerOpen(false)
                                        void persistSelection(defaultSelectedUserIds)
                                    }}
                                    disabled={savingSelection}
                                >
                                    恢复默认
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={() => {
                                        const next = draftUserIds.length ? draftUserIds : [currentUserId]
                                        setSelectedUserIds(next)
                                        setPickerOpen(false)
                                        void persistSelection(next)
                                    }}
                                    disabled={savingSelection}
                                >
                                    {savingSelection ? "保存中..." : "完成"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <EventDetailDialog
                open={detailOpen}
                onOpenChange={setDetailOpen}
                event={selectedEvent}
                currentUserId={currentUserId}
                onEventChanged={() => void load()}
            />
        </div>
    )
}
