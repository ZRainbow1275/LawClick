"use client"

import { useEffect, useMemo, useState, type ComponentProps } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { OpsAlertSeverity, OpsAlertStatus, QueueStatus } from "@/lib/prisma-browser"

import { cancelJob, getQueueJobs, requeueJob, type QueueHealthSnapshot, type QueueJobListItem, type QueueTypeStatsItem } from "@/actions/queue-ops"
import { ackOpsAlert, enqueueQueueHealthCheck, resolveOpsAlert, snoozeOpsAlert, unsnoozeOpsAlert, type OpsAlertListItem, type OpsQueueSnapshotListItem } from "@/actions/ops-queue-monitoring"
import { LegoDeck } from "@/components/layout/LegoDeck"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table"

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>

const STATUS_META: Record<QueueStatus, { label: string; badgeVariant: BadgeVariant }> = {
    PENDING: { label: "待执行", badgeVariant: "warning" },
    PROCESSING: { label: "执行中", badgeVariant: "info" },
    COMPLETED: { label: "已完成", badgeVariant: "success" },
    FAILED: { label: "失败", badgeVariant: "destructive" },
}

const ALERT_STATUS_META: Record<OpsAlertStatus, { label: string; badgeVariant: BadgeVariant }> = {
    OPEN: { label: "未确认", badgeVariant: "destructive" },
    ACKED: { label: "已确认", badgeVariant: "info" },
    SNOOZED: { label: "已静音", badgeVariant: "secondary" },
    RESOLVED: { label: "已恢复", badgeVariant: "success" },
}

const ALERT_SEVERITY_META: Record<OpsAlertSeverity, { label: string; badgeVariant: BadgeVariant }> = {
    P0: { label: "P0", badgeVariant: "destructive" },
    P1: { label: "P1", badgeVariant: "default" },
    P2: { label: "P2", badgeVariant: "warning" },
    P3: { label: "P3", badgeVariant: "secondary" },
}

const EMPTY_ALERTS: OpsAlertListItem[] = []
const EMPTY_SNAPSHOTS: OpsQueueSnapshotListItem[] = []

function formatDate(value: unknown) {
    if (!value) return "-"
    const d = typeof value === "string" ? new Date(value) : value instanceof Date ? value : null
    if (!d || Number.isNaN(d.getTime())) return "-"
    return d.toLocaleString()
}

function shortId(id: string) {
    const v = (id || "").trim()
    if (v.length <= 10) return v
    return `${v.slice(0, 6)}…${v.slice(-4)}`
}

function formatAgeSeconds(value: number) {
    if (!Number.isFinite(value) || value < 0) return "-"
    const seconds = Math.floor(value)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    const rem = minutes % 60
    return `${hours}h${rem}m`
}

function formatSeconds(value: number | null) {
    if (value === null) return "-"
    if (!Number.isFinite(value) || value < 0) return "-"
    return `${value}s`
}

function formatRate(value: number | null) {
    if (value === null) return "-"
    if (!Number.isFinite(value) || value < 0) return "-"
    return `${Math.round(value * 1000) / 10}%`
}

function safeJsonString(value: unknown) {
    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}

function formatPerTypeProcessed(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return ""
    const entries = Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => [k, typeof v === "number" ? v : Number(v)] as const)
        .filter(([, v]) => Number.isFinite(v) && v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([k, v]) => `${k}:${v}`)
    return entries.length ? `（${entries.join("，")}）` : ""
}

export function QueueOpsClient(props: {
    initialJobs: QueueJobListItem[]
    counts: Partial<Record<QueueStatus, number>>
    typeStats: QueueTypeStatsItem[]
    health: QueueHealthSnapshot | null
    initialStatus: QueueStatus | "ALL"
    initialType: string
    initialQuery: string
    nextCursor: string | null
    monitoring: { alerts: OpsAlertListItem[]; snapshots: OpsQueueSnapshotListItem[] } | null
}) {
    const router = useRouter()
    const searchParams = useSearchParams()

    const [status, setStatus] = useState<QueueStatus | "ALL">(props.initialStatus)
    const [type, setType] = useState(props.initialType)
    const [query, setQuery] = useState(props.initialQuery)
    const [jobs, setJobs] = useState<QueueJobListItem[]>(props.initialJobs)
    const [cursor, setCursor] = useState<string | null>(props.nextCursor)

    const [loadingMore, setLoadingMore] = useState(false)
    const [processingQueue, setProcessingQueue] = useState(false)
    const [runningAction, setRunningAction] = useState<string | null>(null)
    const [runningHealthCheck, setRunningHealthCheck] = useState(false)
    const [runningAlertAction, setRunningAlertAction] = useState<string | null>(null)

    const [detailOpen, setDetailOpen] = useState(false)
    const [detailJob, setDetailJob] = useState<QueueJobListItem | null>(null)

    useEffect(() => {
        setStatus(props.initialStatus)
        setType(props.initialType)
        setQuery(props.initialQuery)
        setJobs(props.initialJobs)
        setCursor(props.nextCursor)
    }, [props.initialJobs, props.initialQuery, props.initialStatus, props.initialType, props.nextCursor])

    const statusCounts = useMemo(() => {
        const counts = props.counts || {}
        const all = Object.values(QueueStatus).reduce((sum, s) => sum + (counts[s] || 0), 0)
        return { all, counts }
    }, [props.counts])

    const alerts = props.monitoring?.alerts ?? EMPTY_ALERTS
    const snapshots = props.monitoring?.snapshots ?? EMPTY_SNAPSHOTS

    const jumpToType = (nextType: string) => {
        const params = new URLSearchParams(Array.from(searchParams.entries()))
        const t = nextType.trim()
        if (t) params.set("type", t)
        else params.delete("type")

        const qs = params.toString()
        router.push(`/admin/ops/queue${qs ? `?${qs}` : ""}`)
    }

    const applyFilters = () => {
        const params = new URLSearchParams(Array.from(searchParams.entries()))
        const q = query.trim()
        const t = type.trim()

        if (q) params.set("q", q)
        else params.delete("q")

        if (t) params.set("type", t)
        else params.delete("type")

        if (status === "ALL") params.delete("status")
        else params.set("status", status)

        const qs = params.toString()
        router.push(`/admin/ops/queue${qs ? `?${qs}` : ""}`)
    }

    const loadMore = async () => {
        if (!cursor || loadingMore) return
        setLoadingMore(true)
        try {
            const res = await getQueueJobs({
                status: status === "ALL" ? undefined : status,
                type: type.trim() || undefined,
                query: query.trim() || undefined,
                take: 100,
                cursor,
            })
            if (!res.success) {
                toast.error("加载失败", { description: res.error })
                return
            }

            const next = res.data || []
            const merged = [...jobs, ...next]
            const uniq = new Map<string, QueueJobListItem>()
            for (const item of merged) uniq.set(item.id, item)
            setJobs(Array.from(uniq.values()))
            setCursor(res.nextCursor ?? null)
        } catch {
            toast.error("加载失败")
        } finally {
            setLoadingMore(false)
        }
    }

    const runQueueNow = async () => {
        setProcessingQueue(true)
        try {
            const params = new URLSearchParams({ max: "50", budgetMs: "20000" })
            const t = type.trim()
            if (t) params.set("type", t)
            else params.set("mode", "balanced")

            const res = await fetch(`/api/queue/process?${params.toString()}`, { method: "POST" })
            const data = (await res.json().catch(() => null)) as unknown
            if (!res.ok) {
                const message =
                    data && typeof data === "object" && "error" in data && typeof (data as { error?: unknown }).error === "string"
                        ? (data as { error: string }).error
                        : "队列执行失败"
                toast.error("队列执行失败", { description: message })
                return
            }

            const processed = String((data as { processed?: unknown } | null)?.processed ?? "")
            const perType = formatPerTypeProcessed((data as { perTypeProcessed?: unknown } | null)?.perTypeProcessed)
            toast.success("队列已执行", { description: `processed: ${processed}${perType}` })
            router.refresh()
        } catch {
            toast.error("队列执行失败")
        } finally {
            setProcessingQueue(false)
        }
    }

    const runHealthCheckNow = async () => {
        setRunningHealthCheck(true)
        try {
            const enq = await enqueueQueueHealthCheck()
            if (!enq.success) {
                toast.error("入队失败", { description: enq.error })
                return
            }

            const params = new URLSearchParams({ max: "5", budgetMs: "20000", type: "QUEUE_HEALTH_CHECK" })
            const res = await fetch(`/api/queue/process?${params.toString()}`, { method: "POST" })
            const data = (await res.json().catch(() => null)) as unknown
            if (!res.ok) {
                const message =
                    data && typeof data === "object" && "error" in data && typeof (data as { error?: unknown }).error === "string"
                        ? (data as { error: string }).error
                        : "健康检查执行失败"
                toast.error("健康检查执行失败", { description: message })
                return
            }

            const processed = String((data as { processed?: unknown } | null)?.processed ?? "")
            const perType = formatPerTypeProcessed((data as { perTypeProcessed?: unknown } | null)?.perTypeProcessed)
            toast.success("健康检查已执行", { description: `processed: ${processed}${perType}` })
            router.refresh()
        } catch {
            toast.error("健康检查执行失败")
        } finally {
            setRunningHealthCheck(false)
        }
    }

    const doAckAlert = async (alertId: string) => {
        setRunningAlertAction(alertId)
        try {
            const res = await ackOpsAlert(alertId)
            if (!res.success) {
                toast.error("确认失败", { description: res.error })
                return
            }
            toast.success("已确认告警")
            router.refresh()
        } catch {
            toast.error("确认失败")
        } finally {
            setRunningAlertAction(null)
        }
    }

    const doSnoozeAlert = async (alertId: string, minutes: number) => {
        setRunningAlertAction(alertId)
        try {
            const res = await snoozeOpsAlert(alertId, minutes)
            if (!res.success) {
                toast.error("静音失败", { description: res.error })
                return
            }
            toast.success("已静音告警", { description: `${minutes} 分钟` })
            router.refresh()
        } catch {
            toast.error("静音失败")
        } finally {
            setRunningAlertAction(null)
        }
    }

    const doUnsnoozeAlert = async (alertId: string) => {
        setRunningAlertAction(alertId)
        try {
            const res = await unsnoozeOpsAlert(alertId)
            if (!res.success) {
                toast.error("解除静音失败", { description: res.error })
                return
            }
            toast.success("已解除静音")
            router.refresh()
        } catch {
            toast.error("解除静音失败")
        } finally {
            setRunningAlertAction(null)
        }
    }

    const doResolveAlert = async (alertId: string) => {
        setRunningAlertAction(alertId)
        try {
            const res = await resolveOpsAlert(alertId)
            if (!res.success) {
                toast.error("标记恢复失败", { description: res.error })
                return
            }
            toast.success("已标记恢复")
            router.refresh()
        } catch {
            toast.error("标记恢复失败")
        } finally {
            setRunningAlertAction(null)
        }
    }

    const doRequeue = async (jobId: string) => {
        setRunningAction(jobId)
        try {
            const res = await requeueJob(jobId)
            if (!res.success) {
                toast.error("重试失败", { description: res.error })
                return
            }
            toast.success("已重置为待执行", { description: shortId(jobId) })
            router.refresh()
        } catch {
            toast.error("重试失败")
        } finally {
            setRunningAction(null)
        }
    }

    const doCancel = async (jobId: string) => {
        setRunningAction(jobId)
        try {
            const res = await cancelJob(jobId)
            if (!res.success) {
                toast.error("取消失败", { description: res.error })
                return
            }
            toast.success("已取消任务", { description: shortId(jobId) })
            router.refresh()
        } catch {
            toast.error("取消失败")
        } finally {
            setRunningAction(null)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 rounded-xl border bg-card/70 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="text-xs text-muted-foreground">后台运行机制 / 队列</div>
                        <div className="text-xl font-semibold tracking-tight">任务队列运维</div>
                        <div className="text-xs text-muted-foreground mt-1">
                            并发安全抢占、退避重试、失败可观测与人工干预入口（P2/P3 运维闭环）。
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={runHealthCheckNow} disabled={runningHealthCheck}>
                            {runningHealthCheck ? "检查中…" : "运行健康检查"}
                        </Button>
                        <Button variant="outline" onClick={runQueueNow} disabled={processingQueue}>
                            {processingQueue ? "执行中…" : "立即执行队列"}
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                        全部 {statusCounts.all}
                    </Badge>
                    {Object.values(QueueStatus).map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">
                            {STATUS_META[s].label} {props.counts?.[s] ?? 0}
                        </Badge>
                    ))}
                </div>

                {props.health ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="secondary" className="text-xs">
                            tenant <span className="font-mono">{props.health.tenantId}</span>
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                            可执行待执行 {props.health.duePending}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                            定时待执行 {props.health.scheduledPending}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                            最老可执行 {props.health.oldestDuePendingAgeSeconds === null ? "-" : formatAgeSeconds(props.health.oldestDuePendingAgeSeconds)}
                        </Badge>
                        <Badge
                            variant={props.health.staleProcessing > 0 ? "destructive" : "secondary"}
                            className="text-xs"
                        >
                            疑似卡死 {props.health.staleProcessing}
                        </Badge>
                        <Badge
                            variant={props.health.failed24h > 0 ? "destructive" : "secondary"}
                            className="text-xs"
                        >
                            24h 失败 {props.health.failed24h}
                        </Badge>
                        {props.health.processing24h ? (
                            <>
                                <Badge variant="secondary" className="text-xs">
                                    24h 处理 {props.health.processing24h.total}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                    P95 {formatSeconds(props.health.processing24h.p95Seconds)}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                    失败率 {formatRate(props.health.processing24h.failureRate)}
                                </Badge>
                            </>
                        ) : null}
                        {props.health.latestFailure ? (
                            <span className="text-muted-foreground">
                                最近失败：<span className="font-mono">{props.health.latestFailure.type}</span>{" "}
                                {shortId(props.health.latestFailure.jobId)}（{formatDate(props.health.latestFailure.updatedAt)}）
                            </span>
                        ) : null}
                    </div>
                ) : null}

                {props.typeStats.length ? (
                    <div className="flex flex-wrap items-center gap-2">
                        {props.typeStats.map((item) => {
                            const pending = item.counts.PENDING ?? 0
                            const failed = item.counts.FAILED ?? 0
                            const active = item.counts.PROCESSING ?? 0
                            const isActive = type.trim() === item.type
                            return (
                                <Button
                                    key={item.type}
                                    size="sm"
                                    variant={isActive ? "default" : "outline"}
                                    className="h-8"
                                    onClick={() => jumpToType(item.type)}
                                >
                                    <span className="font-mono text-xs">{item.type}</span>
                                    <span className="ml-2 text-xs text-muted-foreground">
                                        待{pending}｜中{active}｜错{failed}
                                    </span>
                                </Button>
                            )
                        })}
                    </div>
                ) : null}
            </div>

            {props.monitoring ? (
                <LegoDeck
                    title="监控卡片（可拖拽）"
                    sectionId="admin_queue_ops_monitoring"
                    rowHeight={30}
                    margin={[12, 12]}
                    catalog={[
                        {
                            id: "b_queue_ops_alerts",
                            title: "告警",
                            pinned: true,
                            chrome: "none",
                            defaultSize: { w: 6, h: 12, minW: 6, minH: 10 },
                            content: (
                                <Card className="h-full">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">告警</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {alerts.length === 0 ? (
                                <div className="text-sm text-muted-foreground">暂无告警</div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[72px]">级别</TableHead>
                                            <TableHead className="w-[88px]">状态</TableHead>
                                            <TableHead className="w-[160px]">标题</TableHead>
                                            <TableHead>说明</TableHead>
                                            <TableHead className="w-[160px]">最近</TableHead>
                                            <TableHead className="w-[220px]"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {alerts.map((a) => (
                                            <TableRow key={a.id}>
                                                <TableCell>
                                                    <Badge variant={ALERT_SEVERITY_META[a.severity].badgeVariant}>{ALERT_SEVERITY_META[a.severity].label}</Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={ALERT_STATUS_META[a.status].badgeVariant}>{ALERT_STATUS_META[a.status].label}</Badge>
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    <div className="font-mono text-[10px] text-muted-foreground">{a.type}</div>
                                                    <div className="font-medium">{a.title}</div>
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    <div className="line-clamp-2">{a.message}</div>
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground">{formatDate(a.lastSeenAt)}</TableCell>
                                                <TableCell className="text-xs">
                                                    <div className="flex flex-wrap gap-2">
                                                        {a.status === OpsAlertStatus.SNOOZED ? (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => void doUnsnoozeAlert(a.id)}
                                                                disabled={runningAlertAction === a.id}
                                                            >
                                                                解除静音
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => void doAckAlert(a.id)}
                                                                disabled={runningAlertAction === a.id || a.status !== OpsAlertStatus.OPEN}
                                                            >
                                                                确认
                                                            </Button>
                                                        )}

                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => void doSnoozeAlert(a.id, 60)}
                                                            disabled={runningAlertAction === a.id}
                                                        >
                                                            静音 1h
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => void doSnoozeAlert(a.id, 240)}
                                                            disabled={runningAlertAction === a.id}
                                                        >
                                                            静音 4h
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => void doResolveAlert(a.id)}
                                                            disabled={runningAlertAction === a.id}
                                                        >
                                                            标记恢复
                                                        </Button>
                                                    </div>
                                                    {a.status === OpsAlertStatus.SNOOZED && a.snoozedUntil ? (
                                                        <div className="mt-1 text-[10px] text-muted-foreground">
                                                            静音到：{formatDate(a.snoozedUntil)}
                                                        </div>
                                                    ) : null}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                                </Card>
                            ),
                        },
                        {
                            id: "b_queue_ops_snapshots",
                            title: "健康快照（最近）",
                            pinned: true,
                            chrome: "none",
                            defaultSize: { w: 6, h: 12, minW: 6, minH: 10 },
                            content: (
                                <Card className="h-full">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">健康快照（最近）</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {snapshots.length === 0 ? (
                                <div className="text-sm text-muted-foreground">暂无快照</div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[160px]">时间</TableHead>
                                            <TableHead className="w-[80px]">待执行</TableHead>
                                            <TableHead className="w-[80px]">定时</TableHead>
                                            <TableHead className="w-[80px]">卡死</TableHead>
                                            <TableHead className="w-[80px]">24h失败</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {snapshots.map((s) => (
                                            <TableRow key={s.id}>
                                                <TableCell className="text-xs text-muted-foreground">{formatDate(s.capturedAt)}</TableCell>
                                                {s.metrics ? (
                                                    <>
                                                        <TableCell className="text-xs font-mono">{s.metrics.duePending}</TableCell>
                                                        <TableCell className="text-xs font-mono">{s.metrics.scheduledPending}</TableCell>
                                                        <TableCell className="text-xs font-mono">{s.metrics.staleProcessing}</TableCell>
                                                        <TableCell className="text-xs font-mono">{s.metrics.failed24h}</TableCell>
                                                    </>
                                                ) : (
                                                    <TableCell className="text-xs text-muted-foreground" colSpan={4}>
                                                        快照数据损坏（可用 DB 查询 metricsRaw 追溯）
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                                </Card>
                            ),
                        },
                    ]}
                />
            ) : null}

            <LegoDeck
                title="队列操作（可拖拽）"
                sectionId="admin_queue_ops_controls"
                rowHeight={30}
                margin={[12, 12]}
                catalog={[
                    {
                        id: "b_queue_ops_filters",
                        title: "筛选",
                        pinned: true,
                        chrome: "none",
                        defaultSize: { w: 12, h: 8, minW: 6, minH: 6 },
                        content: (
                            <Card className="h-full">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base">筛选</CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                                    <div className="flex flex-col md:flex-row md:items-center gap-2">
                                        <Select
                                            value={status}
                                            onValueChange={(v) => setStatus(v as QueueStatus | "ALL")}
                                        >
                                            <SelectTrigger className="w-40">
                                                <SelectValue placeholder="状态" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ALL">全部</SelectItem>
                                                {Object.values(QueueStatus).map((s) => (
                                                    <SelectItem key={s} value={s}>
                                                        {STATUS_META[s].label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>

                                        <Input
                                            className="w-56"
                                            placeholder="type（精确匹配）"
                                            value={type}
                                            onChange={(e) => setType(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") applyFilters()
                                            }}
                                        />

                                        <Input
                                            className="w-72"
                                            placeholder="搜索：jobId / idempotencyKey / type"
                                            value={query}
                                            onChange={(e) => setQuery(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") applyFilters()
                                            }}
                                        />

                                        <Button variant="outline" onClick={applyFilters}>
                                            应用
                                        </Button>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        当前 {jobs.length} 条{cursor ? "（可继续加载）" : ""}
                                    </div>
                                </CardContent>
                            </Card>
                        ),
                    },
                    {
                        id: "b_queue_ops_jobs",
                        title: "任务列表",
                        pinned: true,
                        chrome: "none",
                        defaultSize: { w: 12, h: 16, minW: 6, minH: 12 },
                        content: (
                            <Card className="h-full">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base">任务列表</CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[110px]">状态</TableHead>
                                                <TableHead className="w-[180px]">类型</TableHead>
                                                <TableHead>幂等键</TableHead>
                                                <TableHead className="w-[130px]">重试</TableHead>
                                                <TableHead className="w-[90px]">优先级</TableHead>
                                                <TableHead className="w-[160px]">可执行时间</TableHead>
                                                <TableHead className="w-[160px]">锁</TableHead>
                                                <TableHead>错误</TableHead>
                                                <TableHead className="w-[180px]">操作</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {jobs.length === 0 ? (
                                                <TableRow>
                                                    <TableCell
                                                        colSpan={9}
                                                        className="text-sm text-muted-foreground"
                                                    >
                                                        暂无数据
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                jobs.map((job) => {
                                                    const meta = STATUS_META[job.status]
                                                    return (
                                                        <TableRow key={job.id}>
                                                            <TableCell>
                                                                <Badge variant={meta.badgeVariant}>{meta.label}</Badge>
                                                                <div className="text-xs text-muted-foreground mt-1">
                                                                    #{shortId(job.id)}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="font-mono text-xs">
                                                                {job.type}
                                                            </TableCell>
                                                            <TableCell className="text-xs">
                                                                <div className="font-mono truncate max-w-[360px]">
                                                                    {job.idempotencyKey || "-"}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-xs">
                                                                {job.attempts}/{job.maxAttempts}
                                                            </TableCell>
                                                            <TableCell className="text-xs font-mono">
                                                                {job.priority}
                                                            </TableCell>
                                                            <TableCell className="text-xs">
                                                                {formatDate(job.availableAt)}
                                                            </TableCell>
                                                            <TableCell className="text-xs">
                                                                <div>{formatDate(job.lockedAt)}</div>
                                                                <div className="text-muted-foreground font-mono truncate max-w-[200px]">
                                                                    {job.lockedBy || ""}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-xs max-w-[280px]">
                                                                <div className="text-destructive line-clamp-2">
                                                                    {job.lastError || ""}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-xs">
                                                                <div className="flex flex-wrap gap-2">
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => {
                                                                            setDetailJob(job)
                                                                            setDetailOpen(true)
                                                                        }}
                                                                    >
                                                                        详情
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => doRequeue(job.id)}
                                                                        disabled={runningAction === job.id}
                                                                    >
                                                                        重试
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => doCancel(job.id)}
                                                                        disabled={runningAction === job.id}
                                                                    >
                                                                        取消
                                                                    </Button>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    )
                                                })
                                            )}
                                        </TableBody>
                                    </Table>

                                    <div className="flex items-center justify-center p-4">
                                        <Button
                                            variant="outline"
                                            onClick={loadMore}
                                            disabled={!cursor || loadingMore}
                                        >
                                            {loadingMore ? "加载中…" : cursor ? "加载更多" : "已到末尾"}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ),
                    },
                ]}
            />

            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>任务详情</DialogTitle>
                    </DialogHeader>
                    {detailJob ? (
                        <div className="space-y-3">
                            <div className="text-xs text-muted-foreground">
                                jobId: <span className="font-mono">{detailJob.id}</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <div className="text-xs text-muted-foreground mb-1">Payload</div>
                                    <pre className="text-xs bg-muted border rounded-md p-3 overflow-auto max-h-[320px]">
                                        {safeJsonString(detailJob.payload)}
                                    </pre>
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground mb-1">Result</div>
                                    <pre className="text-xs bg-muted border rounded-md p-3 overflow-auto max-h-[320px]">
                                        {safeJsonString(detailJob.result)}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    ) : null}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDetailOpen(false)}>
                            关闭
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
