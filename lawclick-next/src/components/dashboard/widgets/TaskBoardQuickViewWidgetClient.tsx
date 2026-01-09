"use client"

import * as React from "react"
import Link from "next/link"
import { RefreshCw, Trello } from "lucide-react"
import { TaskStatus } from "@/lib/prisma-browser"

import {
    getAccessibleTasksForBoard,
    getAccessibleTasksForBoardMeta,
    updateTaskStatus,
    type AccessibleTasksForBoardItem,
} from "@/actions/tasks-crud"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { usePermission } from "@/hooks/use-permission"

type TaskRow = AccessibleTasksForBoardItem

function safeDateTime(value: string | null) {
    if (!value) return "未设置"
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return "未设置"
    return d.toLocaleString("zh-CN")
}

function formatStatus(status: TaskStatus) {
    switch (status) {
        case "TODO":
            return { label: "待办", variant: "secondary" as const }
        case "IN_PROGRESS":
            return { label: "进行中", variant: "outline" as const }
        case "REVIEW":
            return { label: "复核", variant: "outline" as const }
        case "DONE":
            return { label: "完成", variant: "default" as const }
        default:
            return { label: status, variant: "secondary" as const }
    }
}

const OPEN_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW"]

export function TaskBoardQuickViewWidgetClient() {
    const { can } = usePermission()
    const canEdit = can("task:edit")

    const [mode, setMode] = React.useState<"OPEN" | "ALL">("OPEN")
    const [query, setQuery] = React.useState("")

    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [rows, setRows] = React.useState<TaskRow[]>([])
    const [meta, setMeta] = React.useState<{ total: number; hasMore: boolean } | null>(null)

    const [updatingId, setUpdatingId] = React.useState<string | null>(null)

    const load = React.useCallback(async () => {
        const status = mode === "OPEN" ? OPEN_STATUSES : undefined
        const search = query.trim() || undefined

        setLoading(true)
        setError(null)
        try {
            const [metaRes, listRes] = await Promise.all([
                getAccessibleTasksForBoardMeta({ status, search, take: 12 }),
                getAccessibleTasksForBoard({ status, search, take: 12 }),
            ])

            setMeta(metaRes.success ? { total: metaRes.total, hasMore: metaRes.hasMore } : null)
            if (!listRes.success) {
                setRows(listRes.data)
                setError(listRes.error || "加载失败")
                return
            }
            setRows(listRes.data)
        } catch {
            setRows([])
            setMeta(null)
            setError("加载失败")
        } finally {
            setLoading(false)
        }
    }, [mode, query])

    React.useEffect(() => {
        void load()
    }, [load])

    const handleUpdateStatus = async (taskId: string, next: TaskStatus) => {
        if (!canEdit) {
            setError("无编辑权限")
            return
        }
        setUpdatingId(taskId)
        try {
            const res = await updateTaskStatus(taskId, next)
            if (!res.success) {
                setError(res.error || "更新失败")
                return
            }
            setRows((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: next } : t)))
            await load()
        } catch {
            setError("更新失败")
        } finally {
            setUpdatingId(null)
        }
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Trello className="h-4 w-4" />
                    <span>任务中心（快速视图）</span>
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
                        <Link href="/tasks">打开任务</Link>
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索任务标题"
                />
                <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                    <SelectTrigger>
                        <SelectValue placeholder="范围" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="OPEN">仅未完成</SelectItem>
                        <SelectItem value="ALL">全部</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {meta ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>总计：{meta.total}</span>
                    {meta.hasMore ? <span>（已展示前 12 条）</span> : null}
                </div>
            ) : null}

            {error ? <div className="text-sm text-muted-foreground">提示：{error}</div> : null}

            <div className="space-y-2">
                {!loading && !error && rows.length === 0 ? (
                    <div className="text-sm text-muted-foreground">暂无任务</div>
                ) : null}
                {rows.map((t) => {
                    const status = formatStatus(t.status)
                    const parentLabel = t.case
                        ? `案件：${t.case.caseCode || t.case.title}`
                        : t.project
                            ? `项目：${t.project.projectCode || t.project.title}`
                            : null

                    return (
                        <div
                            key={t.id}
                            className="rounded-lg border bg-card/50 px-3 py-2 space-y-1"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-sm font-medium truncate">{t.title}</div>
                                    <div className="text-xs text-muted-foreground truncate">
                                        {safeDateTime(t.dueDate)}
                                        {parentLabel ? ` · ${parentLabel}` : ""}
                                    </div>
                                </div>
                                <Badge variant={status.variant} className="shrink-0">
                                    {status.label}
                                </Badge>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                                <div className="text-xs text-muted-foreground truncate">
                                    {t.assignee?.name ? `负责人：${t.assignee.name}` : null}
                                </div>
                                <Select
                                    value={t.status}
                                    onValueChange={(v) => void handleUpdateStatus(t.id, v as TaskStatus)}
                                    disabled={!canEdit || updatingId === t.id}
                                >
                                    <SelectTrigger className="h-8 w-[140px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="TODO">待办</SelectItem>
                                        <SelectItem value="IN_PROGRESS">进行中</SelectItem>
                                        <SelectItem value="REVIEW">复核</SelectItem>
                                        <SelectItem value="DONE">完成</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
