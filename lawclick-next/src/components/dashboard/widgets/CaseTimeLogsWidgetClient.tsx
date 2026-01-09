"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { RefreshCw, Timer } from "lucide-react"
import { TimeLogStatus } from "@/lib/prisma-browser"

import { getCaseTimeLogs } from "@/actions/timelogs-crud"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getCaseIdFromPathname(pathname: string) {
    const match = pathname.match(/^\/cases\/([^/]+)$/)
    if (!match) return null
    const id = match[1] || ""
    return UUID_RE.test(id) ? id : null
}

function formatDurationMinutes(seconds: number) {
    const s = Math.max(0, Math.floor(seconds))
    const m = Math.round(s / 60)
    return `${m} 分钟`
}

function formatStatus(status: TimeLogStatus) {
    switch (status) {
        case "RUNNING":
            return { label: "计时中", variant: "warning" as const }
        case "PAUSED":
            return { label: "已暂停", variant: "outline" as const }
        case "COMPLETED":
            return { label: "已完成", variant: "secondary" as const }
        case "APPROVED":
            return { label: "已审批", variant: "success" as const }
        case "BILLED":
            return { label: "已开票", variant: "default" as const }
        default:
            return { label: status, variant: "secondary" as const }
    }
}

type LogRow = Extract<Awaited<ReturnType<typeof getCaseTimeLogs>>, { success: true }>["data"][number]

export function CaseTimeLogsWidgetClient() {
    const pathname = usePathname()
    const caseId = React.useMemo(() => getCaseIdFromPathname(pathname || "/"), [pathname])

    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [rows, setRows] = React.useState<LogRow[]>([])

    const load = React.useCallback(async () => {
        if (!caseId) return
        setLoading(true)
        setError(null)
        try {
            const res = await getCaseTimeLogs(caseId)
            if (!res.success) {
                setRows(res.data)
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
    }, [caseId])

    React.useEffect(() => {
        void load()
    }, [load])

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Timer className="h-4 w-4" />
                    <span>案件工时（最近记录）</span>
                    {loading ? <span className="text-xs">加载中…</span> : null}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7"
                        onClick={() => void load()}
                        disabled={!caseId || loading}
                        title="刷新"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    {caseId ? (
                        <Button asChild variant="ghost" size="sm">
                            <Link href={`/cases/${caseId}?tab=timelog`}>打开工时</Link>
                        </Button>
                    ) : (
                        <Button asChild variant="ghost" size="sm">
                            <Link href="/cases">选择案件</Link>
                        </Button>
                    )}
                </div>
            </div>

            {!caseId ? (
                <div className="text-sm text-muted-foreground">
                    提示：请在案件详情页添加该组件（可自动识别案件），或直接进入案件的「工时」Tab。
                </div>
            ) : null}

            {error ? <div className="text-sm text-muted-foreground">加载失败：{error}</div> : null}

            <div className="space-y-2">
                {!loading && !error && caseId && rows.length === 0 ? (
                    <div className="text-sm text-muted-foreground">暂无工时记录</div>
                ) : null}
                {rows.slice(0, 12).map((row) => {
                    const status = formatStatus(row.status)
                    return (
                        <div
                            key={row.id}
                            className="flex items-start justify-between gap-3 rounded-lg border bg-card/50 px-3 py-2"
                        >
                            <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{row.description}</div>
                                <div className="mt-1 text-xs text-muted-foreground truncate">
                                    {formatDurationMinutes(row.duration)} · {new Date(row.startTime).toLocaleString("zh-CN")}
                                </div>
                            </div>
                            <Badge variant={status.variant} className="shrink-0">
                                {status.label}
                            </Badge>
                        </div>
                    )
                })}
                {caseId && rows.length > 12 ? (
                    <div className="text-xs text-muted-foreground">仅展示最近 12 条（共 {rows.length} 条）</div>
                ) : null}
            </div>
        </div>
    )
}
