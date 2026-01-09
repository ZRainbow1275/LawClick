"use client"

import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { TaskPriority, TaskStatus } from "@/lib/prisma-browser"
import { Calendar, LayoutGrid, List, Loader2, Search, User } from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"

import { getAccessibleTasksForListPage, type TaskListItem } from "@/actions/tasks-crud"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { useUiPreferences } from "@/components/layout/UiPreferencesProvider"
import { TaskKanban } from "@/components/tasks/TaskKanban"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { ScrollArea } from "@/components/ui/ScrollArea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"

const STATUS_OPTIONS: Array<{ value: TaskStatus | "ALL"; label: string }> = [
    { value: "ALL", label: "全部状态" },
    { value: "TODO", label: "待办" },
    { value: "IN_PROGRESS", label: "进行中" },
    { value: "REVIEW", label: "待审核" },
    { value: "DONE", label: "已完成" },
]

const PRIORITY_LABELS: Record<TaskPriority, { label: string; color: string }> = {
    P0_URGENT: { label: "紧急", color: "bg-destructive text-destructive-foreground" },
    P1_HIGH: { label: "高", color: "bg-primary text-primary-foreground" },
    P2_MEDIUM: { label: "中", color: "bg-warning text-warning-foreground" },
    P3_LOW: { label: "低", color: "bg-secondary text-secondary-foreground" },
}

function useDebouncedValue<TValue>(value: TValue, delayMs: number) {
    const [debounced, setDebounced] = useState(value)

    useEffect(() => {
        const handle = window.setTimeout(() => setDebounced(value), delayMs)
        return () => window.clearTimeout(handle)
    }, [value, delayMs])

    return debounced
}

export default function TasksPage() {
    const { app } = useUiPreferences()
    const [view, setView] = useState<"list" | "kanban">("list")
    const [searchQuery, setSearchQuery] = useState("")
    const debouncedSearch = useDebouncedValue(searchQuery, 250)
    const [statusFilter, setStatusFilter] = useState<TaskStatus | "ALL">("ALL")

    const statusList = useMemo(() => {
        return statusFilter === "ALL"
            ? (["TODO", "IN_PROGRESS", "REVIEW", "DONE"] as TaskStatus[])
            : ([statusFilter] as TaskStatus[])
    }, [statusFilter])

    const [listItems, setListItems] = useState<TaskListItem[]>([])
    const [listTotal, setListTotal] = useState(0)
    const [listPage, setListPage] = useState(0)
    const [listTake, setListTake] = useState(50)
    const [listHasMore, setListHasMore] = useState(false)
    const [listLoading, setListLoading] = useState(false)
    const [listLoadingMore, setListLoadingMore] = useState(false)
    const [listError, setListError] = useState<string | null>(null)

    const [kanbanTotal, setKanbanTotal] = useState<number | null>(null)

    const density = app.density
    const rowHeight = density === "compact" ? 86 : 98

    const listScrollRef = React.useRef<HTMLDivElement>(null)
    const listVirtualCount = listItems.length + (listHasMore ? 1 : 0)
    const rowVirtualizer = useVirtualizer({
        count: listVirtualCount,
        getScrollElement: () => listScrollRef.current,
        estimateSize: () => rowHeight,
        overscan: 10,
    })

    const loadListPage = React.useCallback(
        async (page: number, mode: "replace" | "append") => {
            if (mode === "append") setListLoadingMore(true)
            else setListLoading(true)
            setListError(null)

            try {
                const res = await getAccessibleTasksForListPage({
                    status: statusList,
                    search: debouncedSearch.trim() || undefined,
                    page,
                    take: listTake,
                })

                if (!res.success) {
                    setListError(res.error || "加载失败")
                    if (mode === "replace") {
                        setListItems([])
                        setListTotal(0)
                        setListPage(0)
                        setListHasMore(false)
                    }
                    return
                }

                setListTotal(res.total)
                setListPage(res.page)
                setListTake(res.take)
                setListHasMore(res.hasMore)

                setListItems((prev) => {
                    const next = mode === "append" ? [...prev, ...res.data] : res.data
                    const uniq = new Map<string, TaskListItem>()
                    for (const item of next) uniq.set(item.id, item)
                    return Array.from(uniq.values())
                })
            } catch (error) {
                setListError(error instanceof Error ? error.message : "加载失败")
                if (mode === "replace") {
                    setListItems([])
                    setListTotal(0)
                    setListPage(0)
                    setListHasMore(false)
                }
            } finally {
                if (mode === "append") setListLoadingMore(false)
                else setListLoading(false)
            }
        },
        [statusList, debouncedSearch, listTake]
    )

    useEffect(() => {
        if (view !== "list") return
        void loadListPage(0, "replace")
    }, [view, statusList, debouncedSearch, loadListPage])

    const virtualItems = rowVirtualizer.getVirtualItems()
    const lastVirtualIndex = virtualItems.length ? virtualItems[virtualItems.length - 1]!.index : 0

    useEffect(() => {
        if (view !== "list") return
        if (!listHasMore || listLoading || listLoadingMore) return
        if (lastVirtualIndex < listItems.length - 1) return
        void loadListPage(listPage + 1, "append")
    }, [view, listHasMore, listLoading, listLoadingMore, lastVirtualIndex, listItems.length, listPage, loadListPage])

    const listSummary = useMemo(() => {
        const loaded = listItems.length
        const total = listTotal
        if (listLoading && loaded === 0) return "加载中…"
        if (total <= 0) return `已加载 ${loaded} 项`
        return `已加载 ${loaded} / ${total} 项`
    }, [listItems.length, listTotal, listLoading])

    const totalBadge = useMemo(() => {
        if (view === "kanban") {
            return kanbanTotal === null ? "加载中…" : `${kanbanTotal} 项`
        }
        return listTotal ? `${listTotal} 项` : `${listItems.length} 项`
    }, [view, kanbanTotal, listTotal, listItems.length])

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_tasks_filters",
            title: "过滤与视图",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 5, minW: 8, minH: 4 },
            content: (
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                            {totalBadge}
                        </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="h-4 w-4 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
                            <Input
                                className="pl-8 w-64"
                                placeholder="搜索任务/案件..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TaskStatus | "ALL")}>
                            <SelectTrigger className="w-32" aria-label="按状态筛选">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {STATUS_OPTIONS.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>
                                        {s.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <div className="flex rounded-md border bg-card">
                            <Button
                                variant={view === "list" ? "secondary" : "ghost"}
                                size="sm"
                                onClick={() => setView("list")}
                                className="rounded-none"
                            >
                                <List className="h-4 w-4 mr-1" />
                                列表
                            </Button>
                            <Button
                                variant={view === "kanban" ? "secondary" : "ghost"}
                                size="sm"
                                onClick={() => setView("kanban")}
                                className="rounded-none"
                            >
                                <LayoutGrid className="h-4 w-4 mr-1" />
                                看板
                            </Button>
                        </div>
                    </div>
                </div>
            ),
        },
        {
            id: "b_tasks_content",
            title: view === "kanban" ? "看板" : "列表",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 18, minW: 8, minH: 12 },
            content: (
                <div className="h-full min-h-0">
                    {view === "kanban" ? (
                        <TaskKanban
                            dataMode="remote"
                            showCaseInfo
                            query={{ status: statusList, search: debouncedSearch.trim() || undefined }}
                            onMetaChange={(meta) => setKanbanTotal(meta.total)}
                        />
                    ) : listLoading && listItems.length === 0 ? (
                        <Card className="h-full flex items-center justify-center">
                            <CardContent className="flex items-center justify-center py-16 text-muted-foreground">
                                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                加载任务中...
                            </CardContent>
                        </Card>
                    ) : listError ? (
                        <Card className="h-full border-destructive/20 bg-destructive/10">
                            <CardContent className="py-10 text-sm text-destructive flex items-center justify-between gap-3">
                                <div>加载失败：{listError}</div>
                                <Button variant="outline" onClick={() => loadListPage(0, "replace")}>
                                    重试
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card className="h-full min-h-0 flex flex-col">
                            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                <CardTitle className="text-base">我的任务</CardTitle>
                                <div className="text-xs text-muted-foreground">{listSummary}</div>
                            </CardHeader>
                            <CardContent className="flex-1 min-h-0">
                                <ScrollArea className="h-full pr-2" viewportRef={listScrollRef}>
                                    {listItems.length === 0 ? (
                                        <div className="text-sm text-muted-foreground py-8 text-center">暂无任务</div>
                                    ) : (
                                        <div
                                            style={{
                                                height: `${rowVirtualizer.getTotalSize()}px`,
                                                width: "100%",
                                                position: "relative",
                                            }}
                                        >
                                            {virtualItems.map((virtualRow) => {
                                                const isLoaderRow = virtualRow.index > listItems.length - 1
                                                const task = isLoaderRow ? null : listItems[virtualRow.index] ?? null

                                                if (isLoaderRow) {
                                                    return (
                                                        <div
                                                            key={virtualRow.key}
                                                            style={{
                                                                position: "absolute",
                                                                top: 0,
                                                                left: 0,
                                                                width: "100%",
                                                                height: `${virtualRow.size}px`,
                                                                transform: `translateY(${virtualRow.start}px)`,
                                                            }}
                                                        >
                                                            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                                                                {listLoadingMore ? (
                                                                    <span className="flex items-center gap-2">
                                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                                        加载更多中…
                                                                    </span>
                                                                ) : (
                                                                    "继续滚动加载更多"
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                }

                                                if (!task) return null
                                                const priority = PRIORITY_LABELS[task.priority]
                                                const statusLabel =
                                                    STATUS_OPTIONS.find((s) => s.value === task.status)?.label || task.status

                                                const padding = density === "compact" ? "p-2" : "p-3"
                                                const titleClassName = density === "compact" ? "text-sm" : "text-sm"

                                                return (
                                                    <div
                                                        key={virtualRow.key}
                                                        style={{
                                                            position: "absolute",
                                                            top: 0,
                                                            left: 0,
                                                            width: "100%",
                                                            height: `${virtualRow.size}px`,
                                                            transform: `translateY(${virtualRow.start}px)`,
                                                        }}
                                                    >
                                                        <div className="h-full pb-2">
                                                            <Link
                                                                href={`/tasks/${task.id}`}
                                                                className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                            >
                                                                <Card className="hover:shadow-sm transition-shadow">
                                                                    <CardContent className={`${padding} flex items-start justify-between gap-4`}>
                                                                        <div className="space-y-1 min-w-0">
                                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                                <Badge className={priority.color} variant="secondary">
                                                                                    {priority.label}
                                                                                </Badge>
                                                                                <span className={`font-medium truncate ${titleClassName}`}>
                                                                                    {task.title}
                                                                                </span>
                                                                                <Badge variant="outline" className="text-[10px]">
                                                                                    {statusLabel}
                                                                                </Badge>
                                                                            </div>
                                                                            {task.case || task.project ? (
                                                                                <div className="text-xs text-muted-foreground truncate">
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
                                                                            {task.description ? (
                                                                                <div className="text-xs text-muted-foreground line-clamp-2">
                                                                                    {task.description}
                                                                                </div>
                                                                            ) : null}
                                                                        </div>

                                                                        <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground min-w-[120px] shrink-0">
                                                                            {task.assignee ? (
                                                                                <div className="flex items-center gap-1">
                                                                                    <User className="h-3 w-3" />
                                                                                    {task.assignee.name || task.assignee.email.split("@")[0]}
                                                                                </div>
                                                                            ) : null}
                                                                            {task.dueDate ? (
                                                                                <div className="flex items-center gap-1">
                                                                                    <Calendar className="h-3 w-3" />
                                                                                    {new Date(task.dueDate).toLocaleDateString("zh-CN")}
                                                                                </div>
                                                                            ) : null}
                                                                        </div>
                                                                    </CardContent>
                                                                </Card>
                                                            </Link>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    )}
                </div>
            ),
        },
    ]

    return <SectionWorkspace title="任务中心" catalog={catalog} className="h-full" />
}
