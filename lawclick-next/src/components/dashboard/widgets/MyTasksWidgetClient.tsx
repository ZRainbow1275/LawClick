"use client"

import * as React from "react"
import Link from "next/link"
import { Clock, ListTodo, RefreshCw } from "lucide-react"

import { getUserTasks } from "@/actions/tasks-crud"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"

type UserTask = Awaited<ReturnType<typeof getUserTasks>>["data"][number]

function safeDateTime(value: string | null) {
    if (!value) return "未设置"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return "未设置"
    return d.toLocaleString("zh-CN")
}

function formatPriority(priority: UserTask["priority"]) {
    switch (priority) {
        case "P0_URGENT":
            return { label: "紧急", variant: "destructive" as const }
        case "P1_HIGH":
            return { label: "高", variant: "outline" as const }
        case "P2_MEDIUM":
            return { label: "中", variant: "secondary" as const }
        case "P3_LOW":
            return { label: "低", variant: "secondary" as const }
        default:
            return { label: "—", variant: "secondary" as const }
    }
}

export function MyTasksWidgetClient() {
    const [loading, setLoading] = React.useState(true)
    const [tasks, setTasks] = React.useState<UserTask[]>([])
    const [error, setError] = React.useState<string | null>(null)

    const load = React.useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await getUserTasks()
            if (!res.success) {
                setError(res.error || "加载失败")
                setTasks([])
                return
            }
            setTasks(res.data)
        } catch (e) {
            setError(e instanceof Error ? e.message : "加载失败")
            setTasks([])
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        void load()
    }, [load])

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ListTodo className="h-4 w-4" />
                    <span>我的待办（未完成）</span>
                    {loading ? <span className="text-xs">加载中…</span> : null}
                </div>
                <div className="flex items-center gap-2">
                    <Button
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
                        <Link href="/tasks">查看全部</Link>
                    </Button>
                </div>
            </div>

            {error ? (
                <div className="text-sm text-muted-foreground">加载失败：{error}</div>
            ) : null}

            <div className="space-y-2">
                {!loading && !error && tasks.length === 0 ? (
                    <div className="text-sm text-muted-foreground">暂无待办</div>
                ) : null}
                {tasks.map((t) => {
                    const p = formatPriority(t.priority)
                    const parentLabel = t.case?.title
                        ? `案件：${t.case.title}`
                        : t.project?.title
                          ? `项目：${t.project.title}`
                          : null

                    return (
                        <div
                            key={t.id}
                            className="flex items-start justify-between gap-3 rounded-lg border bg-card/50 px-3 py-2"
                        >
                            <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{t.title}</div>
                                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground truncate">
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {safeDateTime(t.dueDate)}
                                    </span>
                                    {parentLabel ? <span className="truncate">• {parentLabel}</span> : null}
                                </div>
                            </div>
                            <Badge variant={p.variant} className="shrink-0">
                                {p.label}
                            </Badge>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

