"use client"

import * as React from "react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Calendar, LayoutGrid, List, Loader2, Plus, Search, User } from "lucide-react"
import { TaskPriority, TaskStatus } from "@/lib/prisma-browser"
import { toast } from "sonner"
import { useVirtualizer } from "@tanstack/react-virtual"

import {
    createProjectTask,
    getAccessibleTasksForListPage,
    type TaskListItem,
} from "@/actions/tasks-crud"
import { logger } from "@/lib/logger"
import { useUiPreferences } from "@/components/layout/UiPreferencesProvider"
import { TaskKanban } from "@/components/tasks/TaskKanban"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { ScrollArea } from "@/components/ui/ScrollArea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { Textarea } from "@/components/ui/Textarea"
import { cn } from "@/lib/utils"
import type { TaskCapabilities } from "@/lib/capabilities/types"

const STATUS_OPTIONS: Array<{ value: TaskStatus | "ALL"; label: string }> = [
    { value: "ALL", label: "全部状态" },
    { value: "TODO", label: "待办" },
    { value: "IN_PROGRESS", label: "进行中" },
    { value: "REVIEW", label: "待审核" },
    { value: "DONE", label: "已完成" },
]

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string; color: string }> = [
    { value: "P0_URGENT", label: "紧急", color: "bg-destructive text-destructive-foreground" },
    { value: "P1_HIGH", label: "高", color: "bg-primary text-primary-foreground" },
    { value: "P2_MEDIUM", label: "中", color: "bg-warning text-warning-foreground" },
    { value: "P3_LOW", label: "低", color: "bg-secondary text-secondary-foreground" },
]

function useDebouncedValue<TValue>(value: TValue, delayMs: number) {
    const [debounced, setDebounced] = useState(value)

    useEffect(() => {
        const handle = window.setTimeout(() => setDebounced(value), delayMs)
        return () => window.clearTimeout(handle)
    }, [value, delayMs])

    return debounced
}

export function ProjectTasksPanelClient(props: {
    projectId: string
    assignees: Array<{ id: string; name: string | null; email: string }>
}) {
    const { projectId, assignees } = props
    const { app } = useUiPreferences()

    const [view, setView] = useState<"list" | "kanban">("kanban")
    const [searchQuery, setSearchQuery] = useState("")
    const debouncedSearch = useDebouncedValue(searchQuery, 250)
    const [statusFilter, setStatusFilter] = useState<TaskStatus | "ALL">("ALL")

    const statusList = useMemo(() => {
        return statusFilter === "ALL"
            ? (["TODO", "IN_PROGRESS", "REVIEW", "DONE"] as TaskStatus[])
            : ([statusFilter] as TaskStatus[])
    }, [statusFilter])

    const density = app.density
    const rowHeight = density === "compact" ? 86 : 98

    const [listItems, setListItems] = useState<TaskListItem[]>([])
    const [listTotal, setListTotal] = useState(0)
    const [listPage, setListPage] = useState(0)
    const [listTake, setListTake] = useState(50)
    const [listHasMore, setListHasMore] = useState(false)
    const [listLoading, setListLoading] = useState(false)
    const [listLoadingMore, setListLoadingMore] = useState(false)
    const [listError, setListError] = useState<string | null>(null)

    const [kanbanTotal, setKanbanTotal] = useState<number | null>(null)
    const [kanbanRefreshKey, setKanbanRefreshKey] = useState(0)
    const [taskCapabilities, setTaskCapabilities] = useState<TaskCapabilities | null>(null)

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
                    projectId,
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
            } catch (e) {
                setListError(e instanceof Error ? e.message : "加载失败")
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
        [projectId, statusList, debouncedSearch, listTake]
    )

    useEffect(() => {
        if (view !== "list") return
        void loadListPage(0, "replace")
    }, [view, statusList, debouncedSearch, loadListPage])

    useEffect(() => {
        if (view !== "kanban") return
        setKanbanTotal(null)
    }, [view, statusList, debouncedSearch])

    const virtualItems = rowVirtualizer.getVirtualItems()
    const lastVirtualIndex = virtualItems.length ? virtualItems[virtualItems.length - 1]!.index : 0

    useEffect(() => {
        if (view !== "list") return
        if (!listHasMore || listLoading || listLoadingMore) return
        if (lastVirtualIndex < listItems.length - 1) return
        void loadListPage(listPage + 1, "append")
    }, [view, listHasMore, listLoading, listLoadingMore, lastVirtualIndex, listItems.length, listPage, loadListPage])

    const [createOpen, setCreateOpen] = useState(false)
    const [createTitle, setCreateTitle] = useState("")
    const [createDescription, setCreateDescription] = useState("")
    const [createPriority, setCreatePriority] = useState<TaskPriority>("P2_MEDIUM")
    const [createAssigneeId, setCreateAssigneeId] = useState<string>("__none__")
    const [createDueDate, setCreateDueDate] = useState<string>("")
    const [creating, setCreating] = useState(false)

    const handleCreateTask = async () => {
        if (taskCapabilities && !taskCapabilities.canCreate) {
            toast.error("无创建任务权限", { description: "当前工作区不允许创建任务。" })
            return
        }
        const title = createTitle.trim()
        if (!title) {
            toast.error("任务标题不能为空")
            return
        }

        setCreating(true)
        try {
            const dueDate = createDueDate ? new Date(createDueDate) : undefined
            if (dueDate && Number.isNaN(dueDate.getTime())) {
                toast.error("无效日期")
                return
            }

            const res = await createProjectTask({
                projectId,
                title,
                description: createDescription.trim() ? createDescription.trim() : undefined,
                priority: createPriority,
                assigneeId: createAssigneeId === "__none__" ? undefined : createAssigneeId,
                dueDate,
            })

            if (!res.success) {
                toast.error("创建失败", { description: res.error })
                return
            }

            toast.success("任务已创建", { description: "已保存到任务中心，并与项目关联。" })
            setCreateOpen(false)
            setCreateTitle("")
            setCreateDescription("")
            setCreateAssigneeId("__none__")
            setCreateDueDate("")

            if (view === "kanban") {
                setKanbanTotal(null)
                setKanbanRefreshKey((v) => v + 1)
            } else {
                void loadListPage(0, "replace")
            }
        } catch (e) {
            logger.error("创建项目任务失败", e)
            toast.error("创建失败", { description: "请稍后重试。" })
        } finally {
            setCreating(false)
        }
    }

    const listSummary = useMemo(() => {
        const loaded = listItems.length
        if (listLoading && loaded === 0) return "加载中…"
        if (listTotal <= 0) return `已加载 ${loaded} 项`
        return `已加载 ${loaded} / ${listTotal} 项`
    }, [listItems.length, listTotal, listLoading])

    return (
        <Card className="bg-card">
            <CardHeader className={cn("space-y-3", density === "compact" ? "py-3" : "py-4")}>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="space-y-1">
                        <CardTitle className="text-base">项目任务</CardTitle>
                        <div className="text-xs text-muted-foreground">
                            {view === "kanban" ? (kanbanTotal === null ? "加载中…" : `${kanbanTotal} 项`) : listSummary}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="relative">
                            <Search className="h-4 w-4 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
                            <Input
                                className="pl-8 w-64"
                                placeholder="搜索任务标题/描述..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TaskStatus | "ALL")}>
                            <SelectTrigger className="w-32">
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

                        <Button
                            size="sm"
                            className="gap-1"
                            disabled={Boolean(taskCapabilities && !taskCapabilities.canCreate)}
                            onClick={() => setCreateOpen(true)}
                        >
                            <Plus className="h-4 w-4" />
                            新建任务
                        </Button>

                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/tasks">打开任务中心</Link>
                        </Button>
                    </div>
                </div>

                {view === "list" && listError ? (
                    <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        加载列表失败：{listError}
                    </div>
                ) : null}
            </CardHeader>

            <CardContent className={cn(density === "compact" ? "p-3 pt-0" : "p-4 pt-0")}>
                {view === "kanban" ? (
                    <TaskKanban
                        dataMode="remote"
                        projectId={projectId}
                        assignees={assignees}
                        query={{ status: statusList, search: debouncedSearch.trim() || undefined }}
                        refreshKey={kanbanRefreshKey}
                        onMetaChange={(meta) => setKanbanTotal(meta.total)}
                        onCapabilitiesChange={setTaskCapabilities}
                    />
                ) : (
                    <ScrollArea
                        className={cn("rounded-md border", density === "compact" ? "h-[520px]" : "h-[600px]")}
                        viewportRef={listScrollRef}
                    >
                        {listLoading && listItems.length === 0 ? (
                            <div className="flex items-center justify-center h-[420px] text-sm text-muted-foreground gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                加载中...
                            </div>
                        ) : listItems.length === 0 ? (
                            <div className="p-8 text-center text-sm text-muted-foreground">暂无任务。</div>
                        ) : (
                            <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
                                {virtualItems.map((virtualRow) => {
                                    const task = listItems[virtualRow.index]
                                    const isLoaderRow = virtualRow.index > listItems.length - 1
                                    const priorityConfig = task ? PRIORITY_OPTIONS.find((p) => p.value === task.priority) : null
                                    const statusLabel = task
                                        ? STATUS_OPTIONS.find((s) => s.value === task.status)?.label || task.status
                                        : ""

                                    return (
                                        <div
                                            key={virtualRow.key}
                                            className="absolute left-0 top-0 w-full"
                                            style={{
                                                height: virtualRow.size,
                                                transform: `translateY(${virtualRow.start}px)`,
                                            }}
                                        >
                                            <div className={cn("px-2", density === "compact" ? "py-2" : "py-3")}>
                                                {isLoaderRow ? (
                                                    <div className="h-full rounded-md border bg-muted/30 flex items-center justify-center text-sm text-muted-foreground">
                                                        {listLoadingMore ? (
                                                            <div className="flex items-center gap-2">
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                                加载更多...
                                                            </div>
                                                        ) : (
                                                            "已到底"
                                                        )}
                                                    </div>
                                                ) : task ? (
                                                    <Link href={`/tasks/${task.id}`} className="block">
                                                        <div className="rounded-md border bg-card hover:border-primary/50 hover:shadow-sm transition-colors">
                                                            <div className={cn("flex items-start justify-between gap-3", density === "compact" ? "p-3" : "p-4")}>
                                                                <div className="min-w-0 flex-1 space-y-1">
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        {priorityConfig ? (
                                                                            <Badge className={priorityConfig.color} variant="secondary">
                                                                                {priorityConfig.label}
                                                                            </Badge>
                                                                        ) : null}
                                                                        <span className="font-medium truncate">{task.title}</span>
                                                                        <Badge variant="outline" className="text-[10px]">
                                                                            {statusLabel}
                                                                        </Badge>
                                                                    </div>
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
                                                            </div>
                                                        </div>
                                                    </Link>
                                                ) : null}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </ScrollArea>
                )}
            </CardContent>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-[520px]">
                    <DialogHeader>
                        <DialogTitle>新建项目任务</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>任务标题</Label>
                            <Input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} placeholder="例如：整理项目章程与里程碑" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>优先级</Label>
                                <Select value={createPriority} onValueChange={(v) => setCreatePriority(v as TaskPriority)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PRIORITY_OPTIONS.map((p) => (
                                            <SelectItem key={p.value} value={p.value}>
                                                {p.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>负责人（可选）</Label>
                                <Select value={createAssigneeId} onValueChange={setCreateAssigneeId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="不指定" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">不指定</SelectItem>
                                        {assignees.map((u) => (
                                            <SelectItem key={u.id} value={u.id}>
                                                {u.name || u.email.split("@")[0]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>截止日期（可选）</Label>
                            <Input type="date" value={createDueDate} onChange={(e) => setCreateDueDate(e.target.value)} />
                        </div>

                        <div className="space-y-2">
                            <Label>描述（可选）</Label>
                            <Textarea
                                value={createDescription}
                                onChange={(e) => setCreateDescription(e.target.value)}
                                placeholder="补充关键背景、验收标准、交付物要求..."
                            />
                        </div>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                            取消
                        </Button>
                        <Button onClick={handleCreateTask} disabled={creating}>
                            {creating ? "创建中..." : "创建"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    )
}
