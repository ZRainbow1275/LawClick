"use client"

import * as React from "react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { FolderKanban, Loader2, RefreshCw, Search } from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"

import { getProjectsListPage, type ProjectListItem } from "@/actions/projects-crud"
import { CreateProjectDialog } from "@/components/projects/CreateProjectDialog"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { useUiPreferences } from "@/components/layout/UiPreferencesProvider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from "@/lib/projects/project-labels"
import { cn } from "@/lib/utils"

type ProjectsListPageResult = Awaited<ReturnType<typeof getProjectsListPage>>

const STATUS_OPTIONS = [
    { value: "ALL", label: "全部状态" },
    { value: "PLANNED", label: "规划中" },
    { value: "ACTIVE", label: "进行中" },
    { value: "ON_HOLD", label: "暂停" },
    { value: "COMPLETED", label: "已完成" },
    { value: "ARCHIVED", label: "归档" },
] as const

const TYPE_OPTIONS = [
    { value: "ALL", label: "全部类型" },
    { value: "ADMIN", label: "行政" },
    { value: "HR", label: "人事" },
    { value: "MARKETING", label: "品牌市场" },
    { value: "IT", label: "信息化/IT" },
    { value: "BUSINESS", label: "业务项目" },
    { value: "OTHER", label: "其他" },
] as const

type StatusFilter = (typeof STATUS_OPTIONS)[number]["value"]
type TypeFilter = (typeof TYPE_OPTIONS)[number]["value"]

function useDebouncedValue<TValue>(value: TValue, delayMs: number) {
    const [debounced, setDebounced] = useState(value)

    useEffect(() => {
        const handle = window.setTimeout(() => setDebounced(value), delayMs)
        return () => window.clearTimeout(handle)
    }, [value, delayMs])

    return debounced
}

export function ProjectsListClient(props: { initial: ProjectsListPageResult; canCreateProject?: boolean }) {
    const { app } = useUiPreferences()

    const [searchQuery, setSearchQuery] = useState("")
    const debouncedSearch = useDebouncedValue(searchQuery, 250)
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL")
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL")

    const initial = props.initial
    const [items, setItems] = useState<ProjectListItem[]>(() => (initial.success ? [...initial.data] : []))
    const [total, setTotal] = useState(() => (initial.success ? initial.total : 0))
    const [page, setPage] = useState(() => (initial.success ? initial.page : 0))
    const [take, setTake] = useState(() => (initial.success ? initial.take : 50))
    const [hasMore, setHasMore] = useState(() => (initial.success ? initial.hasMore : false))
    const [loading, setLoading] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(() => (!initial.success ? initial.error || "加载失败" : null))

    const density = app.density
    const rowHeight = density === "compact" ? 110 : 128

    const listScrollRef = React.useRef<HTMLDivElement>(null)
    const listVirtualCount = items.length + (hasMore ? 1 : 0)
    const rowVirtualizer = useVirtualizer({
        count: listVirtualCount,
        getScrollElement: () => listScrollRef.current,
        estimateSize: () => rowHeight,
        overscan: 10,
    })

    const loadPage = React.useCallback(
        async (nextPage: number, mode: "replace" | "append") => {
            if (mode === "append") setLoadingMore(true)
            else setLoading(true)
            setError(null)

            try {
                const res = await getProjectsListPage({
                    query: debouncedSearch.trim() || undefined,
                    status: statusFilter === "ALL" ? undefined : statusFilter,
                    type: typeFilter === "ALL" ? undefined : typeFilter,
                    page: nextPage,
                    take,
                })

                if (!res.success) {
                    setError(res.error || "加载失败")
                    if (mode === "replace") {
                        setItems([])
                        setTotal(0)
                        setPage(0)
                        setHasMore(false)
                    }
                    return
                }

                setTotal(res.total)
                setPage(res.page)
                setTake(res.take)
                setHasMore(res.hasMore)
                setItems((prev) => {
                    const next = mode === "append" ? [...prev, ...res.data] : res.data
                    const uniq = new Map<string, ProjectListItem>()
                    for (const item of next) uniq.set(item.id, item)
                    return Array.from(uniq.values())
                })
            } catch (e) {
                setError(e instanceof Error ? e.message : "加载失败")
                if (mode === "replace") {
                    setItems([])
                    setTotal(0)
                    setPage(0)
                    setHasMore(false)
                }
            } finally {
                if (mode === "append") setLoadingMore(false)
                else setLoading(false)
            }
        },
        [debouncedSearch, statusFilter, typeFilter, take]
    )

    const didHydrateRef = React.useRef(false)
    useEffect(() => {
        if (!didHydrateRef.current) {
            didHydrateRef.current = true
            return
        }
        void loadPage(0, "replace")
    }, [debouncedSearch, statusFilter, typeFilter, loadPage])

    const virtualItems = rowVirtualizer.getVirtualItems()
    const lastVirtualIndex = virtualItems.length ? virtualItems[virtualItems.length - 1]!.index : 0

    useEffect(() => {
        if (!hasMore || loading || loadingMore) return
        if (lastVirtualIndex < items.length - 1) return
        void loadPage(page + 1, "append")
    }, [hasMore, loading, loadingMore, lastVirtualIndex, items.length, page, loadPage])

    const summary = useMemo(() => {
        const loaded = items.length
        if (loading && loaded === 0) return "加载中…"
        if (total <= 0) return `已加载 ${loaded} 个项目`
        return `已加载 ${loaded} / ${total} 个项目`
    }, [items.length, total, loading])

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_projects_intro",
            title: "项目中心",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 5, minW: 8, minH: 4 },
            content: (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <FolderKanban className="h-5 w-5 text-primary" />
                        <div>
                            <h1 className="text-xl font-semibold tracking-tight">项目中心</h1>
                            <div className="text-sm text-muted-foreground">
                                展示律所正在推进的非案件项目（行政/市场/IT等）
                            </div>
                        </div>
                    </div>
                    {props.canCreateProject ? <CreateProjectDialog /> : null}
                </div>
            ),
        },
        {
            id: "b_projects_filters",
            title: "筛选与概览",
            pinned: true,
            defaultSize: { w: 12, h: 6, minW: 8, minH: 5 },
            content: (
                <div className="space-y-3">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="space-y-1">
                            <div className="text-sm font-medium">项目列表</div>
                            <div className="text-xs text-muted-foreground">{summary}</div>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="h-4 w-4 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
                                <Input
                                    className="pl-8 w-64"
                                    placeholder="搜索项目名称/编号..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>

                            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                                <SelectTrigger className="w-28">
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

                            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
                                <SelectTrigger className="w-28">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {TYPE_OPTIONS.map((t) => (
                                        <SelectItem key={t.value} value={t.value}>
                                            {t.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Button
                                variant="outline"
                                size="icon-sm"
                                className="h-9 w-9"
                                title="刷新"
                                onClick={() => void loadPage(0, "replace")}
                                disabled={loading}
                            >
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            </Button>
                        </div>
                    </div>

                    {error ? (
                        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            加载失败：{error}
                        </div>
                    ) : null}
                </div>
            ),
        },
        {
            id: "b_projects_list",
            title: "列表",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 16, minW: 8, minH: 12 },
            content: (
                <div ref={listScrollRef} className="h-full min-h-0 rounded-md border overflow-auto">
                    {items.length === 0 && !loading ? (
                        <div className="p-8 text-center text-sm text-muted-foreground">暂无匹配项目。</div>
                    ) : (
                        <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
                            {virtualItems.map((virtualRow) => {
                                const project = items[virtualRow.index]
                                const isLoaderRow = virtualRow.index > items.length - 1

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
                                                    {loadingMore ? (
                                                        <div className="flex items-center gap-2">
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                            加载更多...
                                                        </div>
                                                    ) : (
                                                        "已到底"
                                                    )}
                                                </div>
                                            ) : project ? (
                                                <Link href={`/projects/${project.id}`} className="block">
                                                    <div className="rounded-md border bg-card hover:border-primary/50 hover:shadow-sm transition-colors">
                                                        <div
                                                            className={cn(
                                                                "flex items-start justify-between gap-3",
                                                                density === "compact" ? "p-3" : "p-4"
                                                            )}
                                                        >
                                                            <div className="min-w-0 flex-1 space-y-1">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <div className="text-xs text-muted-foreground">
                                                                        {project.projectCode}
                                                                    </div>
                                                                    <Badge variant={PROJECT_STATUS_LABELS[project.status]?.badgeVariant ?? "secondary"}>
                                                                        {PROJECT_STATUS_LABELS[project.status]?.label || project.status}
                                                                    </Badge>
                                                                    <Badge variant="outline" className="text-xs">
                                                                        {PROJECT_TYPE_LABELS[project.type] || project.type}
                                                                    </Badge>
                                                                </div>
                                                                <div className="font-semibold truncate">{project.title}</div>
                                                                {project.description ? (
                                                                    <div className="text-sm text-muted-foreground line-clamp-2">
                                                                        {project.description}
                                                                    </div>
                                                                ) : null}
                                                            </div>

                                                            <div className="flex flex-col items-end gap-2 shrink-0">
                                                                <div className="text-xs text-muted-foreground text-right">
                                                                    未完成：{project.openTasksCount} · 成员：{project._count.members}
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <div className="flex -space-x-2">
                                                                        {project.members.map((m) => (
                                                                            <Avatar key={m.user.id} className="h-6 w-6 border-2 border-background">
                                                                                <AvatarImage src={m.user.avatarUrl || undefined} />
                                                                                <AvatarFallback>
                                                                                    {(m.user.name || m.user.email)[0]?.toUpperCase() || "U"}
                                                                                </AvatarFallback>
                                                                            </Avatar>
                                                                        ))}
                                                                    </div>
                                                                    <Avatar className="h-7 w-7">
                                                                        <AvatarImage src={project.owner.avatarUrl || undefined} />
                                                                        <AvatarFallback>
                                                                            {(project.owner.name || project.owner.email)[0]?.toUpperCase() || "U"}
                                                                        </AvatarFallback>
                                                                    </Avatar>
                                                                </div>
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
                </div>
            ),
        },
    ]

    return <SectionWorkspace catalog={catalog} className="h-full" />
}
