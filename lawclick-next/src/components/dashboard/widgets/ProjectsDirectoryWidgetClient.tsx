"use client"

import * as React from "react"
import Link from "next/link"
import { FolderKanban, RefreshCw, Search } from "lucide-react"

import { getProjects } from "@/actions/projects-crud"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"

type ProjectRow = Extract<Awaited<ReturnType<typeof getProjects>>, { success: true }>["data"][number]

function formatSubtitle(row: ProjectRow) {
    const parts = [
        row.projectCode || "",
        row.status || "",
        row.type || "",
        typeof row.openTasksCount === "number" ? `未完成任务 ${row.openTasksCount}` : "",
    ].filter(Boolean)
    return parts.join(" · ")
}

export function ProjectsDirectoryWidgetClient() {
    const [query, setQuery] = React.useState("")
    const [rows, setRows] = React.useState<ProjectRow[]>([])
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    const load = React.useCallback(async (nextQuery: string) => {
        setLoading(true)
        setError(null)
        try {
            const res = await getProjects({ query: nextQuery || undefined, take: 30 })
            if (!res.success) {
                setRows([])
                setError(res.error || "加载失败")
                return
            }
            setRows(res.data)
        } catch {
            setRows([])
            setError("加载失败")
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        const t = setTimeout(() => {
            void load(query.trim())
        }, 250)
        return () => clearTimeout(t)
    }, [load, query])

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FolderKanban className="h-4 w-4" />
                    <span>项目目录</span>
                    {loading ? <span className="text-xs">加载中…</span> : null}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7"
                        onClick={() => void load(query.trim())}
                        disabled={loading}
                        title="刷新"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/projects">查看全部</Link>
                    </Button>
                </div>
            </div>

            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索项目（名称/编号）"
                    className="pl-9"
                />
            </div>

            {error ? <div className="text-sm text-muted-foreground">加载失败：{error}</div> : null}

            <div className="space-y-2">
                {!loading && !error && rows.length === 0 ? (
                    <div className="text-sm text-muted-foreground">暂无匹配项目</div>
                ) : null}
                {rows.map((row) => (
                    <Link
                        key={row.id}
                        href={`/projects/${row.id}`}
                        className="block rounded-lg border bg-card/50 px-3 py-2 hover:bg-accent transition-colors"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{row.title}</div>
                                <div className="mt-1 text-xs text-muted-foreground truncate">
                                    {formatSubtitle(row)}
                                </div>
                            </div>
                            <Badge variant="secondary" className="shrink-0 text-[10px]">
                                {row._count?.members ?? 0} 人
                            </Badge>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    )
}

