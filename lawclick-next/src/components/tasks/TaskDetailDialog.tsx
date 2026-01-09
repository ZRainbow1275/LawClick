"use client"

import * as React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { Textarea } from "@/components/ui/Textarea"
import { Badge } from "@/components/ui/Badge"
import { Calendar, Clock, FileText, Save, Trash2, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { TaskPriority, TaskStatus } from "@/lib/prisma-browser"
import {
    deleteTask,
    moveTaskOnKanban,
    updateTask,
    type ReorderTaskUpdate,
} from "@/actions/tasks-crud"
import { TASK_TYPES } from "@/lib/task-types"
import { startTimer } from "@/actions/timelogs-crud"
import { createEvent } from "@/actions/event-actions"
import { useFloatStore } from "@/store/float-store"
import { CreateCollaborationInviteDialog } from "@/components/collaboration/CreateCollaborationInviteDialog"

export interface TaskDetailDialogTask {
    id: string
    title: string
    description: string | null
    status: TaskStatus
    priority: TaskPriority
    dueDate: Date | string | null
    stage: string | null
    swimlane: string | null
    taskType: string | null
    estimatedHours: number | null
    assignee: { id: string; name: string | null; email: string } | null
    document: { id: string; title: string; documentType: string | null } | null
    case?: { id: string; title: string; caseCode: string | null }
    project?: { id: string; title: string; projectCode: string }
}

interface TaskDetailDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    task: TaskDetailDialogTask | null
    assignees?: Array<{ id: string; name: string | null; email: string }>
    allowTimer?: boolean
    canEdit?: boolean
    canDelete?: boolean
    onTaskPatched?: (taskId: string, patch: Partial<TaskDetailDialogTask>) => void
    onTaskAppliedUpdates?: (updates: ReorderTaskUpdate[]) => void
    onTaskDeleted?: (taskId: string) => void
}

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
    { value: "TODO", label: "待办" },
    { value: "IN_PROGRESS", label: "进行中" },
    { value: "REVIEW", label: "待审核" },
    { value: "DONE", label: "已完成" },
]

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
    { value: "P0_URGENT", label: "紧急" },
    { value: "P1_HIGH", label: "高" },
    { value: "P2_MEDIUM", label: "中" },
    { value: "P3_LOW", label: "低" },
]

function toDateInputValue(value: Date | string | null): string {
    if (!value) return ""
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return ""
    return date.toISOString().slice(0, 10)
}

export function TaskDetailDialog({
    open,
    onOpenChange,
    task,
    assignees = [],
    allowTimer,
    canEdit = true,
    canDelete = true,
    onTaskPatched,
    onTaskAppliedUpdates,
    onTaskDeleted,
}: TaskDetailDialogProps) {
    const [saving, setSaving] = React.useState(false)
    const [deleting, setDeleting] = React.useState(false)
    const { openWindow } = useFloatStore()
    const assigneeIdRef = React.useRef<string>("")
    const lastInitializedRef = React.useRef<{ open: boolean; taskId: string | null }>({ open: false, taskId: null })

    const [form, setForm] = React.useState({
        title: "",
        description: "",
        status: "TODO" as TaskStatus,
        priority: "P2_MEDIUM" as TaskPriority,
        dueDate: "" as string,
        assigneeId: "" as string,
        taskType: "OTHER" as string,
        estimatedHours: "" as string,
    })

    React.useLayoutEffect(() => {
        if (!open) {
            lastInitializedRef.current.open = false
            return
        }
        if (!task) return

        const last = lastInitializedRef.current
        if (last.open && last.taskId === task.id) return

        lastInitializedRef.current = { open: true, taskId: task.id }
        const assigneeId = task.assignee?.id || ""
        assigneeIdRef.current = assigneeId
        setForm({
            title: task.title,
            description: task.description || "",
            status: task.status,
            priority: task.priority,
            dueDate: toDateInputValue(task.dueDate),
            assigneeId,
            taskType: task.taskType || "OTHER",
            estimatedHours: task.estimatedHours === null || task.estimatedHours === undefined ? "" : String(task.estimatedHours),
        })
    }, [open, task])

    const readOnly = !canEdit
    const timerSupported = allowTimer ?? Boolean(task?.case?.id)

    const handleSave = async () => {
        if (!task) return
        if (readOnly) {
            toast.error("无编辑权限", { description: "当前任务为只读，无法保存修改。" })
            return
        }
        const title = form.title.trim()
        if (!title) {
            toast.error("标题不能为空")
            return
        }

        setSaving(true)
        try {
            const resolvedAssigneeId = assigneeIdRef.current.trim() || null
            const updatePayload = {
                title,
                description: form.description.trim() ? form.description.trim() : null,
                priority: form.priority,
                dueDate: form.dueDate ? new Date(form.dueDate) : null,
                assigneeId: resolvedAssigneeId,
                taskType: form.taskType || null,
                estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : null,
            } as const

            const upd = await updateTask(task.id, updatePayload)
            if (!upd.success) {
                toast.error("保存失败", { description: upd.error || "请稍后重试" })
                return
            }

            onTaskPatched?.(task.id, {
                title: updatePayload.title,
                description: updatePayload.description,
                priority: updatePayload.priority,
                dueDate: updatePayload.dueDate,
                taskType: updatePayload.taskType,
                estimatedHours: updatePayload.estimatedHours,
                assignee:
                    updatePayload.assigneeId && assignees.length
                        ? assignees.find(a => a.id === updatePayload.assigneeId) || null
                        : null,
            })

            if (task.status !== form.status) {
                const moved = await moveTaskOnKanban({
                    taskId: task.id,
                    toStatus: form.status,
                    toSwimlane: task.swimlane,
                    beforeTaskId: null,
                    afterTaskId: null,
                })
                if (!moved.success) {
                    toast.error("状态更新失败", { description: moved.error || "请稍后重试" })
                    return
                }
                onTaskAppliedUpdates?.(moved.updates)
                onTaskPatched?.(task.id, { status: form.status })
            }

            toast.success("已保存")
            onOpenChange(false)
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!task) return
        if (!canDelete) {
            toast.error("无删除权限", { description: "当前工作区不允许删除任务。" })
            return
        }
        setDeleting(true)
        try {
            const res = await deleteTask(task.id)
            if (!res.success) {
                toast.error("删除失败", { description: res.error || "请稍后重试" })
                return
            }
            onTaskDeleted?.(task.id)
            toast.success("已删除任务")
            onOpenChange(false)
        } finally {
            setDeleting(false)
        }
    }

    const handleStartTimer = async () => {
        if (!task) return
        const res = await startTimer({ taskId: task.id, description: task.title })
        if (res.success) {
            toast.success("已开始计时")
            openWindow("timer", "TIMER", "计时器", { taskId: task.id })
        } else toast.error("开始计时失败", { description: res.error })
    }

    const handleCreateEvent = async () => {
        if (!task) return
        const startTime = task.dueDate ? new Date(task.dueDate) : new Date()
        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000)
        const res = await createEvent({
            title: task.title,
            type: "DEADLINE",
            startTime,
            endTime,
            caseId: task.case?.id,
            taskId: task.id,
        })
        if (res.success) toast.success("已创建日程")
        else toast.error("创建日程失败", { description: res.error })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between gap-2">
                        <span className="truncate">任务详情</span>
                        {task ? (
                            <div className="flex items-center gap-2 shrink-0">
                                <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground">
                                    <Link href={`/tasks/${task.id}`}>在页面打开</Link>
                                </Button>
                                {readOnly ? (
                                    <Badge variant="outline" className="text-xs text-muted-foreground">
                                        只读
                                    </Badge>
                                ) : null}
                                <Badge variant="outline" className="text-xs">
                                    {STATUS_OPTIONS.find(s => s.value === task.status)?.label}
                                </Badge>
                            </div>
                        ) : null}
                    </DialogTitle>
                </DialogHeader>

                {!task ? (
                    <div className="text-sm text-muted-foreground py-6">未选择任务</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>标题</Label>
                                <Input
                                    value={form.title}
                                    onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                                    disabled={readOnly}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>描述</Label>
                                <Textarea
                                    value={form.description}
                                    onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="支持 Markdown（后续增强）"
                                    className="min-h-[140px]"
                                    disabled={readOnly}
                                />
                            </div>

                            {task.document ? (
                                <div className="flex items-center gap-2 text-sm">
                                    <FileText className="h-4 w-4 text-primary" />
                                    <Link
                                        href={`/documents/${task.document.id}`}
                                        className="text-primary hover:underline truncate"
                                    >
                                        {task.document.title}
                                    </Link>
                                </div>
                            ) : null}

                            {task.case || task.project ? (
                                <div className="text-xs text-muted-foreground">
                                    {task.case ? (
                                        <Link href={`/cases/${task.case.id}?tab=tasks`} className="hover:underline">
                                            {task.case.caseCode ? `#${task.case.caseCode} ` : ""}
                                            {task.case.title}
                                        </Link>
                                    ) : task.project ? (
                                        <Link href={`/projects/${task.project.id}`} className="hover:underline">
                                            {task.project.projectCode ? `#${task.project.projectCode} ` : ""}
                                            {task.project.title}
                                        </Link>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>状态</Label>
                                    <Select
                                        value={form.status}
                                        onValueChange={v => setForm(prev => ({ ...prev, status: v as TaskStatus }))}
                                    >
                                        <SelectTrigger aria-label="状态" disabled={readOnly}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent portalled={false}>
                                            {STATUS_OPTIONS.map(s => (
                                                <SelectItem key={s.value} value={s.value}>
                                                    {s.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>优先级</Label>
                                    <Select
                                        value={form.priority}
                                        onValueChange={v => setForm(prev => ({ ...prev, priority: v as TaskPriority }))}
                                    >
                                        <SelectTrigger aria-label="优先级" disabled={readOnly}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent portalled={false}>
                                            {PRIORITY_OPTIONS.map(p => (
                                                <SelectItem key={p.value} value={p.value}>
                                                    {p.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>截止日期</Label>
                                    <Input
                                        type="date"
                                        value={form.dueDate}
                                        onChange={e => setForm(prev => ({ ...prev, dueDate: e.target.value }))}
                                        disabled={readOnly}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>负责人</Label>
                                    {!readOnly && assignees.length ? (
                                        <Select
                                            value={form.assigneeId || "__UNASSIGNED__"}
                                            onValueChange={v =>
                                                setForm(prev => {
                                                    const nextAssigneeId = v === "__UNASSIGNED__" ? "" : v
                                                    assigneeIdRef.current = nextAssigneeId
                                                    return { ...prev, assigneeId: nextAssigneeId }
                                                })
                                            }
                                        >
                                            <SelectTrigger aria-label="负责人" disabled={readOnly}>
                                                <SelectValue placeholder="未分配" />
                                            </SelectTrigger>
                                            <SelectContent portalled={false}>
                                                <SelectItem value="__UNASSIGNED__">未分配</SelectItem>
                                                {assignees.map(a => (
                                                    <SelectItem key={a.id} value={a.id}>
                                                        {a.name || a.email}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <div className="text-sm text-muted-foreground">
                                            {task.assignee
                                                ? task.assignee.name || task.assignee.email
                                                : "未分配"}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>任务类型</Label>
                                    <Select
                                        value={form.taskType}
                                        onValueChange={v => setForm(prev => ({ ...prev, taskType: v }))}
                                    >
                                        <SelectTrigger aria-label="任务类型" disabled={readOnly}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent portalled={false}>
                                            {TASK_TYPES.map(t => (
                                                <SelectItem key={t.value} value={t.value}>
                                                    {t.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>预估工时（小时）</Label>
                                    <Input
                                        type="number"
                                        step="0.25"
                                        placeholder="例如：2.5"
                                        value={form.estimatedHours}
                                        onChange={e => setForm(prev => ({ ...prev, estimatedHours: e.target.value }))}
                                        disabled={readOnly}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {timerSupported ? (
                                    <Button variant="outline" size="sm" onClick={handleStartTimer}>
                                        <Clock className="h-4 w-4 mr-1" />
                                        计时
                                    </Button>
                                ) : null}
                                <CreateCollaborationInviteDialog
                                    type="TASK"
                                    targetId={task.id}
                                    candidates={assignees.map((a) => ({ id: a.id, name: a.name, email: a.email }))}
                                    excludeUserIds={task.assignee?.id ? [task.assignee.id] : []}
                                    trigger={
                                        <Button variant="outline" size="sm" className="gap-1">
                                            <UserPlus className="h-4 w-4" />
                                            邀请接手
                                        </Button>
                                    }
                                />
                                <Button variant="outline" size="sm" onClick={handleCreateEvent}>
                                    <Calendar className="h-4 w-4 mr-1" />
                                    日程
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                <DialogFooter className="flex items-center justify-between gap-2">
                    <div>
                        {task && canDelete ? (
                            <Button
                                variant="destructive"
                                onClick={handleDelete}
                                disabled={deleting}
                                className="gap-1"
                            >
                                <Trash2 className="h-4 w-4" />
                                删除
                            </Button>
                        ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            关闭
                        </Button>
                        {canEdit ? (
                            <Button onClick={handleSave} disabled={saving || !task} className="gap-1">
                                <Save className="h-4 w-4" />
                                保存
                            </Button>
                        ) : null}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
