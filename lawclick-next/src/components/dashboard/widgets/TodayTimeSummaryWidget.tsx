"use client"

import * as React from "react"
import Link from "next/link"
import { Briefcase, Clock, RefreshCw, Timer } from "lucide-react"

import { getTodayTimeSummary } from "@/actions/timelogs-crud"
import { LegoDeck } from "@/components/layout/LegoDeck"
import type { SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"

type TodayTimeSummary = Awaited<ReturnType<typeof getTodayTimeSummary>>["data"]

function formatHours(value: number) {
    if (!Number.isFinite(value)) return "0.00"
    return value.toFixed(2)
}

export function TodayTimeSummaryWidget() {
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [data, setData] = React.useState<TodayTimeSummary | null>(null)

    const load = React.useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await getTodayTimeSummary()
            if (!res.success) {
                setError(res.error || "加载失败")
                setData(res.data)
                return
            }
            setData(res.data)
        } catch (e) {
            setError(e instanceof Error ? e.message : "加载失败")
            setData(null)
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        void load()
    }, [load])

    const running = data?.runningTimer || null
    const runningStatus = running?.status ? String(running.status) : null       
    const runningDescription = running?.description ? String(running.description) : null
    const runningCaseTitle = running?.case?.title ? String(running.case.title) : null
    const runningTaskTitle = running?.task?.title ? String(running.task.title) : null

    const statsDeck = [
        {
            id: "b_today_time_total",
            title: "总工时",
            chrome: "none",
            defaultSize: { w: 4, h: 3, minW: 4, minH: 3 },
            content: (
                <div className="rounded-lg border bg-card/50 p-3">
                    <div className="text-xs text-muted-foreground">总工时</div>
                    <div className="text-lg font-semibold">{formatHours(data?.totalHours ?? 0)}h</div>
                </div>
            ),
        },
        {
            id: "b_today_time_billable",
            title: "计费工时",
            chrome: "none",
            defaultSize: { w: 4, h: 3, minW: 4, minH: 3 },
            content: (
                <div className="rounded-lg border bg-card/50 p-3">
                    <div className="text-xs text-muted-foreground">计费工时</div>
                    <div className="text-lg font-semibold">{formatHours(data?.billableHours ?? 0)}h</div>
                </div>
            ),
        },
        {
            id: "b_today_time_count",
            title: "记录数",
            chrome: "none",
            defaultSize: { w: 4, h: 3, minW: 4, minH: 3 },
            content: (
                <div className="rounded-lg border bg-card/50 p-3">
                    <div className="text-xs text-muted-foreground">记录数</div>
                    <div className="text-lg font-semibold">{data?.count ?? 0}</div>
                </div>
            ),
        },
    ] satisfies SectionCatalogItem[]

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>今日工时汇总</span>
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
                        <Link href="/timelog">查看工时</Link>
                    </Button>
                </div>
            </div>

            {error ? (
                <div className="text-sm text-muted-foreground">加载失败：{error}</div>
            ) : null}

            <LegoDeck
                title="统计卡片（可拖拽）"
                sectionId="today_time_summary_stats"
                rowHeight={24}
                margin={[12, 12]}
                catalog={statsDeck}
            />

            <div className="rounded-lg border bg-card/50 p-3">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Timer className="h-4 w-4 text-muted-foreground" />
                        <div className="text-sm font-medium">进行中计时</div>
                    </div>
                    {runningStatus ? <Badge variant="outline">{runningStatus}</Badge> : null}
                </div>
                {running ? (
                    <div className="mt-2 space-y-1 text-sm">
                        {runningDescription ? <div className="font-medium">{runningDescription}</div> : null}
                        {runningTaskTitle ? (
                            <div className="text-muted-foreground">任务：{runningTaskTitle}</div>
                        ) : null}
                        {runningCaseTitle ? (
                            <div className="flex items-center gap-1 text-muted-foreground">
                                <Briefcase className="h-3 w-3" />
                                <span className="truncate">案件：{runningCaseTitle}</span>
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <div className="mt-2 text-sm text-muted-foreground">当前没有进行中的计时</div>
                )}
            </div>
        </div>
    )
}
