"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { TaskDetailDialog, type TaskDetailDialogTask } from "@/components/tasks/TaskDetailDialog"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import type { TaskDetailPageData } from "@/lib/tasks/task-detail"

function toDialogTask(task: TaskDetailPageData["task"]): TaskDetailDialogTask {
    return {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        stage: task.stage,
        swimlane: task.swimlane,
        taskType: task.taskType,
        estimatedHours: task.estimatedHours,
        assignee: task.assignee,
        document: task.document,
        case: task.case ?? undefined,
        project: task.project ?? undefined,
    }
}

function formatDate(value: Date | string | null): string {
    if (!value) return "未设置"
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return "日期无效"
    return date.toLocaleDateString("zh-CN")
}

const STATUS_LABELS: Record<string, string> = {
    TODO: "待办",
    IN_PROGRESS: "进行中",
    REVIEW: "待审核",
    DONE: "已完成",
}

const PRIORITY_LABELS: Record<string, string> = {
    P0_URGENT: "紧急",
    P1_HIGH: "高",
    P2_MEDIUM: "中",
    P3_LOW: "低",
}

export function TaskDetailPageClient(props: { initial: TaskDetailPageData }) {  
    const { initial } = props
    const router = useRouter()

    const [dialogOpen, setDialogOpen] = React.useState(false)
    const [task, setTask] = React.useState<TaskDetailDialogTask>(() => toDialogTask(initial.task))

    const catalog: SectionCatalogItem[] = [
        {
            id: "task_overview",
            title: "任务概览",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 7, minW: 6, minH: 6 },
            content: (
                <Card className="h-full">
                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0">
                            <CardTitle className="truncate">{task.title}</CardTitle>
                            <CardDescription className="truncate">任务 ID：{task.id}</CardDescription>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <Button variant="secondary" onClick={() => router.push("/tasks")}>
                                返回任务中心
                            </Button>
                            <Button onClick={() => setDialogOpen(true)}>查看/编辑</Button>
                        </div>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        可通过拖拽调整下方模块布局；布局会自动保存，并支持一键恢复默认。
                    </CardContent>
                </Card>
            ),
        },
        {
            id: "task_metadata",
            title: "关键信息",
            chrome: "none",
            defaultSize: { w: 6, h: 12, minW: 6, minH: 10 },
            content: (
                <Card className="h-full">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">关键信息</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-2">
                        <div className="flex items-center justify-between rounded-md border bg-muted/10 px-3 py-2">
                            <div className="text-xs text-muted-foreground">状态</div>
                            <Badge variant="outline">{STATUS_LABELS[task.status] ?? task.status}</Badge>
                        </div>
                        <div className="flex items-center justify-between rounded-md border bg-muted/10 px-3 py-2">
                            <div className="text-xs text-muted-foreground">优先级</div>
                            <Badge variant="outline">{PRIORITY_LABELS[task.priority] ?? task.priority}</Badge>
                        </div>
                        <div className="flex items-center justify-between rounded-md border bg-muted/10 px-3 py-2">
                            <div className="text-xs text-muted-foreground">截止日期</div>
                            <div className="text-sm">{formatDate(task.dueDate)}</div>
                        </div>
                        <div className="flex items-center justify-between rounded-md border bg-muted/10 px-3 py-2">
                            <div className="text-xs text-muted-foreground">负责人</div>
                            <div className="text-sm">{task.assignee?.name || task.assignee?.email || "未分配"}</div>
                        </div>
                        <div className="flex items-center justify-between rounded-md border bg-muted/10 px-3 py-2">
                            <div className="text-xs text-muted-foreground">类型</div>
                            <div className="text-sm">{task.taskType || "未设置"}</div>
                        </div>
                        <div className="flex items-center justify-between rounded-md border bg-muted/10 px-3 py-2">
                            <div className="text-xs text-muted-foreground">预估工时</div>
                            <div className="text-sm">
                                {task.estimatedHours === null || task.estimatedHours === undefined
                                    ? "未设置"
                                    : `${task.estimatedHours}h`}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ),
        },
        {
            id: "task_description",
            title: "描述",
            chrome: "none",
            defaultSize: { w: 6, h: 12, minW: 6, minH: 10 },
            content: (
                <Card className="h-full">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">描述</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {task.description ? (
                            <div className="text-sm whitespace-pre-wrap">{task.description}</div>
                        ) : (
                            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                                暂无描述
                            </div>
                        )}
                    </CardContent>
                </Card>
            ),
        },
        {
            id: "task_links",
            title: "关联对象",
            chrome: "none",
            defaultSize: { w: 12, h: 7, minW: 6, minH: 6 },
            content: (
                <Card className="h-full">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">关联对象</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                        {task.case ? (
                            <Button asChild variant="outline" size="sm">
                                <Link href={`/cases/${task.case.id}`}>查看案件：{task.case.title}</Link>
                            </Button>
                        ) : null}
                        {task.project ? (
                            <Button asChild variant="outline" size="sm">
                                <Link href={`/projects/${task.project.id}`}>查看项目：{task.project.title}</Link>
                            </Button>
                        ) : null}
                        {task.document ? (
                            <Button asChild variant="outline" size="sm">
                                <Link href={`/documents/${task.document.id}`}>查看文档：{task.document.title}</Link>
                            </Button>
                        ) : null}
                        {!task.case && !task.project && !task.document ? (
                            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground w-full">
                                暂无关联对象
                            </div>
                        ) : null}
                    </CardContent>
                </Card>
            ),
        },
    ]

    return (
        <>
            <SectionWorkspace
                title="任务详情"
                sectionId="task_detail"
                entityId={task.id}
                catalog={catalog}
                className="h-full"
            />
            <TaskDetailDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                task={task}
                assignees={initial.assignees}
                canEdit={initial.capabilities.canEdit}
                canDelete={initial.capabilities.canDelete}
                onTaskPatched={(taskId, patch) => {
                    setTask((prev) => (prev && prev.id === taskId ? { ...prev, ...patch } : prev))
                }}
                onTaskDeleted={() => router.push("/tasks")}
            />
        </>
    )
}
