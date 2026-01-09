"use client"

import { useMemo, useState } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Briefcase, Clock, Play, Plus, Trash2 } from "lucide-react"

import { createTimeLog } from "@/actions/timelogs"
import { deleteTimeLog, type TimeLogListItem } from "@/actions/timelogs-crud"
import { LegoDeck } from "@/components/layout/LegoDeck"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/AlertDialog"
import { Button } from "@/components/ui/Button"
import { Card, CardContent } from "@/components/ui/Card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"

interface TimeLogClientProps {
    initialLogs: TimeLogListItem[]
    userId: string
    cases: Array<{ id: string; title: string; caseCode: string }>
}

function toDateTimeLocalValue(date: Date) {
    const pad = (n: number) => n.toString().padStart(2, "0")
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatHMS(seconds: number) {
    const s = Math.max(0, Math.floor(seconds))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
}

export function TimeLogClient({ initialLogs, userId, cases }: TimeLogClientProps) {
    const router = useRouter()

    const [open, setOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<TimeLogListItem | null>(null)

    const logs = initialLogs
    const totalSeconds = logs.reduce((acc, log) => acc + log.duration, 0)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)

    const groupedLogs = useMemo(() => {
        return logs.reduce(
            (groups, log) => {
                const dateKey = format(new Date(log.startTime), "yyyy年M月d日")
                if (!groups[dateKey]) groups[dateKey] = []
                groups[dateKey].push(log)
                return groups
            },
            {} as Record<string, TimeLogListItem[]>
        )
    }, [logs])

    async function handleSubmit(formData: FormData) {
        formData.append("userId", userId)
        const res = await createTimeLog(formData)
        if (res.error) {
            toast.error("创建失败", { description: res.error })
            return
        }
        toast.success("工时已记录")
        setOpen(false)
        router.refresh()
    }

    const openDeleteDialog = (log: TimeLogListItem) => {
        setDeleteTarget(log)
        setDeleteOpen(true)
    }

    const handleDelete = async () => {
        if (!deleteTarget) return
        setDeleting(true)
        try {
            const res = await deleteTimeLog(deleteTarget.id)
            if (!res.success) {
                toast.error("删除失败", { description: res.error })
                return
            }
            toast.success("工时记录已删除")
            setDeleteOpen(false)
            setDeleteTarget(null)
            router.refresh()
        } catch {
            toast.error("删除失败")
        } finally {
            setDeleting(false)
        }
    }

    const summaryPanel = (
        <div className="space-y-6">
            <LegoDeck
                title="概览卡片栏（可拖拽/可记忆/可恢复）"
                sectionId="timelog_summary_cards"
                entityId={userId}
                rowHeight={26}
                margin={[12, 12]}
                catalog={[
                    {
                        id: "c_total_time",
                        title: "累计工时",
                        pinned: true,
                        chrome: "none",
                        defaultSize: { w: 8, h: 10, minW: 6, minH: 8 },
                        content: (
                            <Card className="h-full bg-gradient-to-br from-primary-700 to-primary-800 text-primary-foreground border-none">
                                <CardContent className="p-6 flex items-center justify-between">
                                    <div>
                                        <p className="text-primary-foreground/80 text-sm font-medium mb-1">累计工时</p>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-5xl font-bold tracking-tight">{hours.toString().padStart(2, "0")}</span>
                                            <span className="text-xl text-primary-foreground/80">小时</span>
                                            <span className="text-5xl font-bold tracking-tight">{minutes.toString().padStart(2, "0")}</span>
                                            <span className="text-xl text-primary-foreground/80">分钟</span>
                                        </div>
                                    </div>
                                    <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
                                        <Clock className="h-8 w-8 text-primary" />
                                    </div>
                                </CardContent>
                            </Card>
                        ),
                    },
                    {
                        id: "c_start",
                        title: "开始记录",
                        pinned: true,
                        chrome: "none",
                        defaultSize: { w: 4, h: 10, minW: 4, minH: 8 },
                        content: (
                            <Card
                                className="h-full flex items-center justify-center border-dashed cursor-pointer hover:bg-accent transition-colors"
                                onClick={() => setOpen(true)}
                            >
                                <div className="text-center">
                                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                                        <Play className="h-6 w-6 text-primary ml-1" />
                                    </div>
                                    <p className="font-medium text-foreground">开始记录</p>
                                    <p className="text-sm text-muted-foreground">点击开始一条新的工时记录</p>
                                </div>
                            </Card>
                        ),
                    },
                ]}
            />

            <div className="flex items-center justify-end">
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            记录工时
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>记录工时</DialogTitle>
                        </DialogHeader>
                        <form action={handleSubmit} className="space-y-4">
                            <div className="grid gap-2">
                                <Label htmlFor="description">工作内容</Label>
                                <Input id="description" name="description" placeholder="例如：起草合同条款" required />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="caseId">关联案件 *</Label>
                                <Select name="caseId">
                                    <SelectTrigger>
                                        <SelectValue placeholder="选择案件（必选）" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {cases.map((c) => (
                                            <SelectItem key={c.id} value={c.id}>
                                                {c.title}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="startTime">开始时间</Label>
                                    <Input
                                        id="startTime"
                                        name="startTime"
                                        type="datetime-local"
                                        required
                                        defaultValue={toDateTimeLocalValue(new Date())}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="duration">时长（分钟）</Label>
                                    <Input id="duration" name="duration" type="number" required min="1" defaultValue="60" />
                                </div>
                            </div>
                            <Button type="submit" className="w-full">
                                保存记录
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    )

    const listPanel = (
        <div className="space-y-6">
            {Object.entries(groupedLogs).map(([date, dayLogs]) => (
                <div key={date}>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3 ml-1">{date}</h3>
                    <div className="space-y-2">
                        {dayLogs.map((log) => (
                            <Card key={log.id} className="hover:shadow-sm transition-shadow">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="h-10 w-1 rounded-full bg-primary flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-foreground truncate">{log.description}</p>
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                            {log.case ? (
                                                <span className="flex items-center gap-1 bg-muted/50 px-2 py-0.5 rounded">
                                                    <Briefcase className="h-3 w-3" />
                                                    {log.case.title}
                                                </span>
                                            ) : null}
                                            <span>{format(new Date(log.startTime), "HH:mm")} 开始</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-lg font-bold text-foreground font-mono">{formatHMS(log.duration)}</p>
                                    </div>
                                    {log.userId === userId ? (
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() => openDeleteDialog(log)}
                                            disabled={log.status === "APPROVED" || log.status === "BILLED"}
                                            title={
                                                log.status === "APPROVED" || log.status === "BILLED"
                                                    ? "已审批/已计费的工时不可删除"
                                                    : "删除工时"
                                            }
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    ) : null}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    )

    return (
        <div className="space-y-6">
            <AlertDialog
                open={deleteOpen}
                onOpenChange={(next) => {
                    setDeleteOpen(next)
                    if (!next) setDeleteTarget(null)
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认删除该工时记录？</AlertDialogTitle>
                        <AlertDialogDescription>删除后不可恢复；已审批/已计费的工时不可删除。</AlertDialogDescription>
                    </AlertDialogHeader>
                    {deleteTarget ? (
                        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                            <div className="font-medium truncate" title={deleteTarget.description}>
                                {deleteTarget.description}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                                {new Date(deleteTarget.startTime).toLocaleString("zh-CN")} · {formatHMS(deleteTarget.duration)}
                            </div>
                        </div>
                    ) : null}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={deleting || !deleteTarget}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleting ? "删除中…" : "确认删除"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <LegoDeck
                title="工时模块（可拖拽/可记忆/可恢复）"
                sectionId="timelog_client"
                catalog={[
                    {
                        id: "b_timelog_summary",
                        title: "概览与操作",
                        pinned: true,
                        chrome: "none",
                        defaultSize: { w: 12, h: 16, minW: 6, minH: 10 },
                        content: summaryPanel,
                    },
                    {
                        id: "b_timelog_list",
                        title: "工时列表",
                        pinned: true,
                        chrome: "none",
                        defaultSize: { w: 12, h: 22, minW: 6, minH: 12 },
                        content: listPanel,
                    },
                ]}
            />
        </div>
    )
}
