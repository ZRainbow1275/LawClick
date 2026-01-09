"use client"

import * as React from "react"
import Link from "next/link"
import { Briefcase, RefreshCw } from "lucide-react"

import { getCaseKanbanCards, type CaseKanbanCard } from "@/actions/case-kanban"
import { CaseKanban } from "@/components/features/CaseKanban"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { subscribeDispatchRefresh } from "@/lib/dispatch-refresh"
import { logger } from "@/lib/logger"

export function DispatchCasePoolWidgetClient(props?: { initialCases?: CaseKanbanCard[] }) {
    const [cases, setCases] = React.useState<CaseKanbanCard[]>(props?.initialCases ?? [])
    const [loading, setLoading] = React.useState(props?.initialCases ? false : true)
    const [error, setError] = React.useState<string | null>(null)
    const [query, setQuery] = React.useState("")
    const requestSeq = React.useRef(0)
    const effectiveQuery = React.useMemo(() => {
        const trimmed = query.trim()
        return trimmed.length >= 2 ? trimmed : ""
    }, [query])

    const load = React.useCallback(async (q?: string) => {
        const seq = ++requestSeq.current
        setLoading(true)
        setError(null)
        try {
            const trimmed = (q ?? "").trim()
            const res = await getCaseKanbanCards({
                status: ["LEAD", "INTAKE"],
                take: 300,
                query: trimmed.length ? trimmed : undefined,
            })
            if (seq !== requestSeq.current) return
            if (!res.success) {
                setCases([])
                setError(res.error || "加载失败")
                return
            }
            setCases(res.data)
        } catch (e) {
            if (seq !== requestSeq.current) return
            logger.error("加载待分配案件池失败", e)
            setCases([])
            setError(e instanceof Error ? e.message : "加载失败")
        } finally {
            if (seq !== requestSeq.current) return
            setLoading(false)
        }
    }, [])

    React.useEffect(() => subscribeDispatchRefresh(() => void load(effectiveQuery)), [effectiveQuery, load])

    React.useEffect(() => {
        const q = query.trim()
        if (props?.initialCases && q.length === 0) {
            requestSeq.current += 1
            setCases(props.initialCases)
            setError(null)
            setLoading(false)
            return
        }

        if (q.length === 1) {
            requestSeq.current += 1
            setError(null)
            setLoading(false)
            return
        }

        const delay = q.length >= 2 ? 200 : 0
        const timer = setTimeout(() => void load(q), delay)
        return () => clearTimeout(timer)
    }, [load, props?.initialCases, query])

    return (
        <div className="space-y-3 h-full min-h-0 flex flex-col">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                    <Briefcase className="h-4 w-4" />
                    <span className="truncate">待分配案件池</span>
                    <Badge variant="secondary" className="shrink-0 text-xs">
                        {cases.length}
                    </Badge>
                    {loading ? <span className="text-xs">加载中…</span> : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7"
                        onClick={() => void load(effectiveQuery)}
                        disabled={loading}
                        title="刷新"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/cases">案件管理</Link>
                    </Button>
                </div>
            </div>

            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索案件标题/案号/客户…" />

            <div className="text-xs text-muted-foreground">
                先在案件池选择卡片，再到“团队热力图”为成员分配承办人/执行人（真实落库）。
            </div>
            {query.trim().length === 1 ? (
                <div className="text-xs text-muted-foreground">输入至少 2 个字开始搜索</div>
            ) : null}

            {error ? <div className="text-sm text-destructive">加载失败：{error}</div> : null}
            {!loading && !error && cases.length === 0 ? (
                <div className="text-sm text-muted-foreground">暂无匹配案件</div>
            ) : null}

            <div className="flex-1 min-h-0 overflow-hidden">
                <CaseKanban cases={cases} enableDispatchSelection />
            </div>
        </div>
    )
}
