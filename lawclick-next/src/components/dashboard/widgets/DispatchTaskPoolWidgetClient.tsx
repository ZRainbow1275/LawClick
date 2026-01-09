"use client"

import * as React from "react"
import Link from "next/link"
import { Calendar, ListTodo, RefreshCw, UserPlus } from "lucide-react"

import { getUnassignedTasksForDispatch, type DispatchTaskItem } from "@/actions/dispatch-tasks"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { ScrollArea } from "@/components/ui/ScrollArea"
import { cn } from "@/lib/utils"
import { TASK_STATUS_LABELS } from "@/lib/tasks/task-status-labels"
import { getTaskPriorityMeta } from "@/lib/tasks/task-priority-meta"
import { subscribeDispatchRefresh } from "@/lib/dispatch-refresh"
import { logger } from "@/lib/logger"
import { useDispatchStore } from "@/store/dispatch-store"

function safeDate(value: string | Date | null) {
    if (!value) return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleDateString("zh-CN")
}

function buildSearchText(task: DispatchTaskItem) {
    const bits: string[] = [
        task.title,
        task.case?.title || "",
        task.case?.caseCode || "",
        task.project?.title || "",
        task.project?.projectCode || "",
        task.priority,
        task.status,
    ]
    return bits.join(" ").toLowerCase()
}

export function DispatchTaskPoolWidgetClient(props?: { initialTasks?: DispatchTaskItem[] }) {
    const { selection, selectTask } = useDispatchStore()
    const [tasks, setTasks] = React.useState<DispatchTaskItem[]>(props?.initialTasks ?? [])
    const [loading, setLoading] = React.useState(props?.initialTasks ? false : true)
    const [error, setError] = React.useState<string | null>(null)
    const [query, setQuery] = React.useState("")

    const load = React.useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await getUnassignedTasksForDispatch({ take: 200 })
            if (!res.success) {
                setTasks([])
                setError(res.error || "加载失败")
                return
            }
            setTasks(res.data)
        } catch (e) {
            logger.error("加载待分配任务池失败", e)
            setTasks([])
            setError(e instanceof Error ? e.message : "加载失败")
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        if (props?.initialTasks) return
        void load()
    }, [load, props?.initialTasks])

    React.useEffect(() => subscribeDispatchRefresh(() => void load()), [load])

    const filteredTasks = React.useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return tasks
        return tasks.filter((t) => buildSearchText(t).includes(q))
    }, [query, tasks])

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                    <ListTodo className="h-4 w-4" />
                    <span className="truncate">待分配任务池</span>
                    <Badge variant="secondary" className="shrink-0 text-xs">
                        {filteredTasks.length}/{tasks.length}
                    </Badge>
                    {loading ? <span className="text-xs">加载中…</span> : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7"
                        onClick={() => void load()}
                        disabled={loading}
                        title="刷新"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/tasks">任务中心</Link>
                    </Button>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索任务标题/关联案件/项目…"
                />
            </div>

            {error ? <div className="text-sm text-destructive">加载失败：{error}</div> : null}

            {!loading && !error && tasks.length === 0 ? (
                <div className="text-sm text-muted-foreground">暂无待分配任务</div>
            ) : null}

            <ScrollArea className="h-[360px] pr-2">
                <div className="space-y-2">
                    {filteredTasks.map((t) => {
                        const selected = selection?.type === "TASK" && selection.id === t.id
                        const priority = getTaskPriorityMeta(t.priority)
                        const due = safeDate(t.dueDate)
                        const contextLabel = t.case
                            ? `${t.case.caseCode ? `#${t.case.caseCode} ` : ""}${t.case.title}`
                            : t.project
                              ? `${t.project.projectCode ? `#${t.project.projectCode} ` : ""}${t.project.title}`
                              : "未关联"

                        return (
                            <button
                                key={t.id}
                                type="button"
                                className={cn(
                                    "w-full rounded-lg border bg-card/50 px-3 py-2 text-left transition-colors hover:bg-muted/40",
                                    selected && "border-primary/30 bg-primary/10"
                                )}
                                onClick={() => selectTask(t.id, t.title)}
                                title="选择后点击成员卡片即可分配"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Badge
                                                variant="secondary"
                                                className={cn("text-[10px]", priority.badgeClassName)}
                                            >
                                                {priority.label}
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
                                        {due ? (
                                            <div className="flex items-center gap-1">
                                                <Calendar className="h-3 w-3" />
                                                {due}
                                            </div>
                                        ) : null}
                                        <div className="flex items-center gap-1">
                                            <UserPlus className="h-3 w-3" />
                                            未分配
                                        </div>
                                    </div>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </ScrollArea>

            <div className="text-xs text-muted-foreground">
                选择任务后，再点“团队热力图”中的成员卡片即可完成分配（真实落库）。  
            </div>
        </div>
    )
}
