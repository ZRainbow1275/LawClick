"use client"

import * as React from "react"
import { toast } from "sonner"
import { Calendar, Clock, FileText, GripVertical, User } from "lucide-react"

import { startTimer } from "@/actions/timelogs-crud"
import { createEvent } from "@/actions/event-actions"
import { Card, CardContent } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { useFloatStore } from "@/store/float-store"
import { TASK_TYPES } from "@/lib/task-types"
import { PRIORITY_CONFIG, type TaskItem } from "@/components/tasks/kanban/task-kanban-helpers"

export function TaskKanbanCard({
    task,
    dragHandleProps,
    showCaseInfo,
    canStartTimer,
    onOpen,
}: {
    task: TaskItem
    dragHandleProps?: React.HTMLAttributes<HTMLDivElement>
    showCaseInfo: boolean
    canStartTimer: boolean
    onOpen?: () => void
}) {
    const priorityConfig = PRIORITY_CONFIG[task.priority]
    const taskTypeConfig = TASK_TYPES.find((t) => t.value === task.taskType)
    const { openWindow } = useFloatStore()

    const handleStartTimer = async () => {
        const res = await startTimer({
            taskId: task.id,
            description: task.title,
        })
        if (res.success) {
            toast.success("已开始计时")
            openWindow("timer", "TIMER", "计时器", { taskId: task.id })
        } else toast.error("开始计时失败", { description: res.error })
    }

    const handleCreateEvent = async () => {
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
        <Card className="bg-card hover:border-primary/50 transition-colors group cursor-pointer" onClick={onOpen}>
            <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-muted">
                            <GripVertical className="h-3 w-3" />
                        </div>
                    </div>
                    <div className="flex gap-1">
                        <Badge className={priorityConfig.color} variant="secondary">
                            {priorityConfig.label}
                        </Badge>
                        {taskTypeConfig ? (
                            <Badge variant="outline" className="text-xs">
                                {taskTypeConfig.label}
                            </Badge>
                        ) : null}
                    </div>
                </div>

                <div className="font-medium text-sm leading-tight line-clamp-2">{task.title}</div>

                {showCaseInfo && (task.case || task.project) ? (
                    <div className="text-xs text-muted-foreground">
                        {task.case ? (
                            <>
                                {task.case.caseCode ? `#${task.case.caseCode} ` : ""}
                                {task.case.title}
                            </>
                        ) : task.project ? (
                            <>
                                {task.project.projectCode ? `#${task.project.projectCode} ` : ""}
                                {task.project.title}
                            </>
                        ) : null}
                    </div>
                ) : null}

                {task.document ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3" />
                        {task.document.title}
                    </div>
                ) : null}

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    {task.assignee ? (
                        <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {task.assignee.name || task.assignee.email.split("@")[0]}
                        </div>
                    ) : (
                        <span className="text-muted-foreground">未分配</span>
                    )}
                    {task.dueDate ? (
                        <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(task.dueDate).toLocaleDateString()}
                        </div>
                    ) : null}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-dashed">
                    {canStartTimer ? (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={(e) => {
                                e.stopPropagation()
                                void handleStartTimer()
                            }}
                        >
                            <Clock className="h-3 w-3 mr-1" />
                            计时
                        </Button>
                    ) : null}
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={(e) => {
                            e.stopPropagation()
                            void handleCreateEvent()
                        }}
                    >
                        <Calendar className="h-3 w-3 mr-1" />
                        日程
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

