"use client"

import * as React from "react"
import { toast } from "sonner"
import { CalendarDays, CheckCircle2, Clock, FileText, MapPin, Pencil, Trash2, Users, XCircle } from "lucide-react"
import { useRouter } from "next/navigation"

import { LegoDeck } from "@/components/layout/LegoDeck"
import type { SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import type { CalendarEventDTO } from "@/actions/event-actions"
import { cancelEvent, deleteEvent, updateEvent } from "@/actions/event-actions"
import { respondToMeetingInviteByEventId } from "@/actions/collaboration-actions"
import { createTask } from "@/actions/tasks"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/AlertDialog"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { Separator } from "@/components/ui/Separator"
import { Textarea } from "@/components/ui/Textarea"

function toDateTimeLocalValue(date: Date) {
    const pad = (n: number) => n.toString().padStart(2, "0")
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function parseLocalInput(value: string) {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date
}

export function EventDetailDialog(props: {
    open: boolean
    onOpenChange: (open: boolean) => void
    event: CalendarEventDTO | null
    currentUserId: string
    onEventChanged?: () => void
}) {
    const { open, onOpenChange, event, currentUserId, onEventChanged } = props  
    const router = useRouter()
    const [busy, setBusy] = React.useState(false)
    const [respondingInvite, setRespondingInvite] = React.useState(false)       
    const [editing, setEditing] = React.useState(false)

    const [editTitle, setEditTitle] = React.useState("")
    const [editStart, setEditStart] = React.useState("")
    const [editEnd, setEditEnd] = React.useState("")
    const [editLocation, setEditLocation] = React.useState("")
    const [editDescription, setEditDescription] = React.useState("")
    const [editType, setEditType] = React.useState<CalendarEventDTO["type"]>("MEETING")
    const [editVisibility, setEditVisibility] = React.useState<CalendarEventDTO["visibility"]>("TEAM_BUSY")

    React.useEffect(() => {
        if (!open) {
            setEditing(false)
            return
        }
        if (!event) return
        setEditTitle(event.title || "")
        setEditLocation(event.location || "")
        setEditDescription(event.description || "")
        setEditType(event.type || "MEETING")
        setEditVisibility(event.visibility || "TEAM_BUSY")
        setEditStart(toDateTimeLocalValue(new Date(event.startTime)))
        setEditEnd(toDateTimeLocalValue(new Date(event.endTime)))
        setEditing(false)
    }, [event, open])

    const handleCancel = async () => {
        if (!event) return
        setBusy(true)
        try {
            const res = await cancelEvent(event.id)
            if (!res.success) {
                toast.error("取消失败", { description: res.error })
                return
            }
            toast.success("已取消日程")
            onOpenChange(false)
            onEventChanged?.()
            router.refresh()
        } finally {
            setBusy(false)
        }
    }

    const handleDelete = async () => {
        if (!event) return
        setBusy(true)
        try {
            const res = await deleteEvent(event.id)
            if (!res.success) {
                toast.error("删除失败", { description: res.error })
                return
            }
            toast.success("日程已删除")
            onOpenChange(false)
            onEventChanged?.()
            router.refresh()
        } finally {
            setBusy(false)
        }
    }

    const handleSaveEdit = async () => {
        if (!event) return
        if (!event.canEdit) {
            toast.error("无编辑权限")
            return
        }
        const title = editTitle.trim()
        if (!title) {
            toast.error("保存失败", { description: "标题不能为空" })
            return
        }
        const start = parseLocalInput(editStart)
        const end = parseLocalInput(editEnd)
        if (!start || !end) {
            toast.error("保存失败", { description: "时间格式不正确" })
            return
        }
        if (start >= end) {
            toast.error("保存失败", { description: "结束时间必须晚于开始时间" })
            return
        }

        setBusy(true)
        try {
            const res = await updateEvent(event.id, {
                title,
                type: editType,
                visibility: editVisibility,
                startTime: start,
                endTime: end,
                location: editLocation.trim() || undefined,
                description: editDescription.trim() || undefined,
            })
            if (!res.success) {
                toast.error("保存失败", { description: res.error })
                return
            }
            toast.success("日程已更新")
            setEditing(false)
            onEventChanged?.()
            router.refresh()
        } finally {
            setBusy(false)
        }
    }

    const handleCreateTask = async () => {
        if (!event?.case?.id) {
            toast.error("无法创建任务", { description: "该日程未关联案件" })
            return
        }

        setBusy(true)
        try {
            const fd = new FormData()
            fd.set("title", event.title)
            fd.set("description", event.description || "")
            fd.set("priority", "P2_MEDIUM")
            fd.set("userId", currentUserId)
            fd.set("caseId", event.case.id)

            const res = await createTask(fd)
            if ("error" in res) {
                toast.error("创建任务失败", { description: res.error })
                return
            }
            toast.success("已从日程创建任务")
            router.refresh()
        } finally {
            setBusy(false)
        }
    }

    const start = event ? new Date(event.startTime) : null
    const end = event ? new Date(event.endTime) : null

    const myParticipant = event?.participants?.find((p) => p.userId === currentUserId) || null
    const canRespondInvite = Boolean(event?.canViewDetails && myParticipant?.status === "INVITED")

    const handleRespondInvite = async (accept: boolean) => {
        if (!event) return
        setRespondingInvite(true)
        try {
            const res = await respondToMeetingInviteByEventId(event.id, accept)
            if (!res.success) {
                toast.error("操作失败", { description: res.error })
                return
            }
            toast.success(accept ? "已接受会议邀请" : "已拒绝会议邀请")
            onOpenChange(false)
            onEventChanged?.()
            router.refresh()
        } finally {
            setRespondingInvite(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between gap-2">
                        <span className="truncate">{event?.title || "日程详情"}</span>
                        {event ? <Badge variant="outline">{event.type}</Badge> : null}
                    </DialogTitle>
                </DialogHeader>

                {!event ? (
                    <div className="text-sm text-muted-foreground py-6">未选择日程</div>
                ) : (
                    <LegoDeck
                        sectionId="calendar_event_detail_dialog"
                        rowHeight={26}
                        className="min-h-0"
                        catalog={[
                            {
                                id: "edit",
                                title: "编辑",
                                chrome: "none",
                                defaultSize: { w: 12, h: 14, minW: 8, minH: 10 },
                                content: (
                                    <>
                        {editing ? (
                            <div className="space-y-4">
                                <div className="grid gap-2">
                                    <Label>标题</Label>
                                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="grid gap-2">
                                        <Label>开始时间</Label>
                                        <Input type="datetime-local" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>结束时间</Label>
                                        <Input type="datetime-local" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="grid gap-2">
                                        <Label>类型</Label>
                                        <Select value={editType} onValueChange={(v) => setEditType(v as CalendarEventDTO["type"])}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="MEETING">会议</SelectItem>
                                                <SelectItem value="HEARING">开庭</SelectItem>
                                                <SelectItem value="DEADLINE">截止</SelectItem>
                                                <SelectItem value="OTHER">其他</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>可见性</Label>
                                        <Select value={editVisibility} onValueChange={(v) => setEditVisibility(v as CalendarEventDTO["visibility"])}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="PRIVATE">仅参与人可见</SelectItem>
                                                <SelectItem value="TEAM_BUSY">团队仅忙闲</SelectItem>
                                                <SelectItem value="TEAM_PUBLIC">团队可见详情</SelectItem>
                                                <SelectItem value="CASE_TEAM">案件成员可见</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="grid gap-2">
                                    <Label>地点</Label>
                                    <Input
                                        value={editLocation}
                                        onChange={(e) => setEditLocation(e.target.value)}
                                        placeholder="会议地点或线上会议链接"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label>描述</Label>
                                    <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={4} placeholder="日程详情..." />
                                </div>
                                <div className="flex items-center justify-end gap-2">
                                    <Button variant="outline" onClick={() => setEditing(false)} disabled={busy || respondingInvite}>
                                        取消
                                    </Button>
                                    <Button onClick={handleSaveEdit} disabled={busy || respondingInvite}>
                                        {busy ? "保存中..." : "保存"}
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                                    </>
                                ),
                            },
                            {
                                id: "view",
                                title: "详情",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 12, h: 12, minW: 8, minH: 8 },
                                content: (

                        <div className={editing ? "hidden" : undefined}>
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <CalendarDays className="h-4 w-4" />
                                <span>
                                    {start?.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Clock className="h-4 w-4" />
                                <span>
                                    {start?.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} -{" "}
                                    {end?.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                                </span>
                            </div>
                            {event.location ? (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <MapPin className="h-4 w-4" />
                                    <span className="truncate">{event.location}</span>
                                </div>
                            ) : null}
                        </div>

                        {event.case ? (
                            <div className="rounded-lg border bg-muted/10 p-3 text-sm">
                                <div className="text-xs text-muted-foreground mb-1">关联案件</div>
                                <div className="font-medium truncate">
                                    {event.case.caseCode ? `#${event.case.caseCode} ` : ""}
                                    {event.case.title}
                                </div>
                            </div>
                        ) : null}

                        {event.task ? (
                            <div className="rounded-lg border bg-muted/10 p-3 text-sm">
                                <div className="text-xs text-muted-foreground mb-1">关联任务</div>
                                <div className="font-medium truncate">{event.task.title}</div>
                            </div>
                        ) : null}

                        {event.description ? (
                            <div className="rounded-lg border bg-card/50 p-3 text-sm">
                                <div className="text-xs text-muted-foreground mb-1">描述</div>
                                <div className="whitespace-pre-wrap">{event.description}</div>
                            </div>
                        ) : null}

                        {event.canViewDetails && event.participants?.length ? (
                            <>
                                <Separator />
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Users className="h-4 w-4" />
                                        <span>参与人</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {event.participants.map((p) => (
                                            <Badge key={p.userId} variant="secondary" className="text-xs">
                                                {p.user?.name || p.userId.slice(0, 6)} · {p.status}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            </>
                        ) : null}

                        {event.canEdit ? (
                            <div className="flex items-center justify-end gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-2"
                                    onClick={() => setEditing(true)}
                                    disabled={busy || respondingInvite}
                                >
                                    <Pencil className="h-4 w-4" />
                                    编辑
                                </Button>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-2 text-destructive hover:text-destructive"
                                            disabled={busy || respondingInvite}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                            删除
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>确认删除该日程？</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                删除后将无法恢复。若仅需取消，请使用“取消日程”。
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={handleDelete}
                                                disabled={busy}
                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                            >
                                                {busy ? "删除中..." : "确认删除"}
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        ) : null}

                        <Separator />

                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                {canRespondInvite ? (
                                    <>
                                        <Button
                                            variant="default"
                                            size="sm"
                                            className="gap-2"
                                            onClick={() => handleRespondInvite(true)}
                                            disabled={busy || respondingInvite}
                                        >
                                            <CheckCircle2 className="h-4 w-4" />
                                            接受邀请
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-2"
                                            onClick={() => handleRespondInvite(false)}
                                            disabled={busy || respondingInvite}
                                        >
                                            <XCircle className="h-4 w-4" />
                                            拒绝邀请
                                        </Button>
                                    </>
                                ) : null}
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="gap-2"
                                    onClick={handleCreateTask}
                                    disabled={busy || respondingInvite}
                                >
                                    <FileText className="h-4 w-4" />
                                    从日程创建任务
                                </Button>
                            </div>

                            {event.canEdit ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-2 text-destructive hover:text-destructive"
                                    onClick={handleCancel}
                                    disabled={busy || respondingInvite}
                                >
                                    <XCircle className="h-4 w-4" />
                                    取消日程
                                </Button>
                        ) : null}
                        </div>
                        </div>
                                ),
                            },
                        ] satisfies SectionCatalogItem[]}
                    />
                )}
            </DialogContent>
        </Dialog>
    )
}
