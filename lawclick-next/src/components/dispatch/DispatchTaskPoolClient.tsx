"use client"

import Link from "next/link"
import * as React from "react"
import { Calendar, ListTodo, UserPlus } from "lucide-react"

import type { DispatchTaskItem } from "@/actions/dispatch-tasks"
import { TASK_STATUS_LABELS } from "@/lib/tasks/task-status-labels"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { ScrollArea } from "@/components/ui/ScrollArea"
import { cn } from "@/lib/utils"
import { useDispatchStore } from "@/store/dispatch-store"

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
    P0_URGENT: { label: "紧急", color: "bg-destructive text-destructive-foreground" },
    P1_HIGH: { label: "高", color: "bg-primary text-primary-foreground" },
    P2_MEDIUM: { label: "中", color: "bg-warning text-warning-foreground" },
    P3_LOW: { label: "低", color: "bg-secondary text-secondary-foreground" },
}

export function DispatchTaskPoolClient(props: { tasks: DispatchTaskItem[] }) {
    const { tasks } = props
    const { selection, selectTask } = useDispatchStore()

    return (
        <Card className="bg-card/70 shadow-sm">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <ListTodo className="h-4 w-4 text-primary" />
                        <span>待分配任务池</span>
                        <Badge variant="secondary" className="text-xs">
                            {tasks.length}
                        </Badge>
                    </div>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/tasks">任务中心</Link>
                    </Button>
                </CardTitle>
                <div className="text-xs text-muted-foreground">
                    点击任务后，再点上方成员卡片即可完成分配（真实落库）。
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <ScrollArea className="h-[260px]">
                    <div className="p-3 space-y-2">
                        {tasks.length === 0 ? (
                            <div className="text-sm text-muted-foreground py-8 text-center">暂无待分配任务</div>
                        ) : (
                            tasks.map((t) => {
                                const selected = selection?.type === "TASK" && selection.id === t.id
                                const p = PRIORITY_LABELS[t.priority] || { label: t.priority, color: "bg-muted/50 text-muted-foreground" }
                                const contextLabel = t.case
                                    ? `${t.case.caseCode ? `#${t.case.caseCode} ` : ""}${t.case.title}`
                                    : t.project
                                      ? `${t.project.projectCode ? `#${t.project.projectCode} ` : ""}${t.project.title}`
                                      : "未关联"

                                return (
                                    <div
                                        key={t.id}
                                        className={cn(
                                            "rounded-lg border px-3 py-2 bg-card hover:bg-muted hover:border-border transition-colors cursor-pointer",
                                            selected && "border-primary/30 bg-primary/10"
                                        )}
                                        onClick={() => selectTask(t.id, t.title)}
                                        title="选择后点击成员即可分配"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <Badge className={cn("text-[10px]", p.color)} variant="secondary">
                                                        {p.label}
                                                    </Badge>
                                                    <Badge variant="outline" className="text-[10px]">
                                                        {TASK_STATUS_LABELS[t.status] || t.status}
                                                    </Badge>
                                                    <Link
                                                        href={`/tasks/${t.id}`}
                                                        className="text-xs text-muted-foreground hover:underline"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        打开详情
                                                    </Link>
                                                </div>
                                                <div className="mt-1 text-sm font-medium truncate">{t.title}</div>
                                                <div className="mt-1 text-xs text-muted-foreground truncate">{contextLabel}</div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground shrink-0">
                                                {t.dueDate ? (
                                                    <div className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        {new Date(t.dueDate).toLocaleDateString("zh-CN")}
                                                    </div>
                                                ) : null}
                                                <div className="flex items-center gap-1">
                                                    <UserPlus className="h-3 w-3" />
                                                    未分配
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    )
}
