"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { OpsAlertStatus, type TaskStatus } from "@/lib/prisma-browser"

import type { OpsKanbanMonitoringData } from "@/actions/ops-kanban-monitoring"
import { enqueueKanbanHealthCheck } from "@/actions/ops-kanban-monitoring"
import { ackOpsAlert, resolveOpsAlert, snoozeOpsAlert, unsnoozeOpsAlert } from "@/actions/ops-queue-monitoring"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table"

function severityBadgeClass(severity: string): string {
    if (severity === "P0") return "bg-destructive text-destructive-foreground"
    if (severity === "P1") return "bg-primary text-primary-foreground"
    if (severity === "P2") return "bg-warning text-warning-foreground"
    return "bg-secondary text-secondary-foreground"
}

function statusBadgeClass(status: OpsAlertStatus): string {
    if (status === OpsAlertStatus.OPEN) return "bg-destructive text-destructive-foreground"
    if (status === OpsAlertStatus.ACKED) return "bg-info text-info-foreground"
    if (status === OpsAlertStatus.SNOOZED) return "bg-secondary text-secondary-foreground"
    return "bg-success text-success-foreground"
}

function formatStatusLabel(status: TaskStatus): string {
    if (status === "TODO") return "待办"
    if (status === "IN_PROGRESS") return "进行中"
    if (status === "REVIEW") return "待审核"
    return "已完成"
}

function formatMaybe(value: unknown): string {
    if (value === null || value === undefined) return "-"
    if (typeof value === "number" && !Number.isFinite(value)) return "-"
    return String(value)
}

function formatMs(value: unknown): string {
    const base = formatMaybe(value)
    return base === "-" ? "-" : `${base}ms`
}

function formatAgeSeconds(value: unknown): string {
    if (value === null || value === undefined) return "-"
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "-"
    const seconds = Math.floor(value)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    return `${hours}h`
}

function formatDateTime(iso: string | null): string {
    if (!iso) return "-"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "-"
    return d.toLocaleString()
}

export function KanbanOpsClient(props: { monitoring: OpsKanbanMonitoringData }) {
    const router = useRouter()

    const [running, setRunning] = React.useState(false)
    const [actingAlertId, setActingAlertId] = React.useState<string | null>(null)

    const alerts = React.useMemo(() => props.monitoring.alerts ?? [], [props.monitoring.alerts])
    const snapshots = React.useMemo(() => props.monitoring.snapshots ?? [], [props.monitoring.snapshots])
    const latest = snapshots[0]?.metrics ?? null
    const autoHealthCheck = props.monitoring.autoHealthCheck

    const pollers = props.monitoring.realtime.tenantSignalPollers || []
    const pollerSubscribers = pollers.reduce((acc, p) => acc + (typeof p.subscribers === "number" ? p.subscribers : 0), 0)
    const pollerErrorCount = pollers.reduce(
        (acc, p) => acc + (typeof p.dbPollErrorCount === "number" ? p.dbPollErrorCount : 0),
        0
    )
    const pollerLastDbPollMs =
        pollers
            .map((p) => p.lastDbPollMs)
            .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
            .sort((a, b) => b - a)[0] ?? null

    const triggerHealthCheck = React.useCallback(async () => {
        setRunning(true)
        try {
            const res = await enqueueKanbanHealthCheck()
            if (!res.success) {
                toast.error("入队失败", { description: res.error })
                return
            }
            toast.success("已入队看板健康检查", { description: res.data.jobId })
            router.refresh()
        } finally {
            setRunning(false)
        }
    }, [router])

    const doAlertAction = React.useCallback(
        async (alertId: string, action: "ack" | "resolve" | "snooze60" | "snooze1440" | "unsnooze") => {
            setActingAlertId(alertId)
            try {
                const res =
                    action === "ack"
                        ? await ackOpsAlert(alertId)
                        : action === "resolve"
                          ? await resolveOpsAlert(alertId)
                          : action === "unsnooze"
                            ? await unsnoozeOpsAlert(alertId)
                            : action === "snooze60"
                              ? await snoozeOpsAlert(alertId, 60)
                              : await snoozeOpsAlert(alertId, 24 * 60)

                if (!res.success) {
                    toast.error("操作失败", { description: res.error })
                    return
                }
                toast.success("已更新告警状态")
                router.refresh()
            } finally {
                setActingAlertId(null)
            }
        },
        [router]
    )

    const deck = React.useMemo<SectionCatalogItem[]>(
        () => [
            {
                id: "b_kanban_ops_snapshot",
                title: "最新快照概览",
                pinned: true,
                chrome: "none",
                defaultSize: { w: 4, h: 12, minW: 4, minH: 10 },
                content: (
                    <Card className="h-full bg-card">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">最新快照概览</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            {latest ? (
                                <>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">总任务</span>
                                        <span className="font-medium">{formatMaybe(latest.totalTasks)}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">未完成</span>
                                        <span className="font-medium">{formatMaybe(latest.openTasks)}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">孤儿任务</span>
                                        <span className="font-medium">{formatMaybe(latest.orphanTasks)}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">最大列</span>
                                        <span className="font-medium">
                                            {formatStatusLabel(latest.maxColumn.status)} · {formatMaybe(latest.maxColumn.count)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">最久未更新</span>
                                        <span className="font-medium">
                                            {latest.oldestOpenAgeHours !== null ? `${latest.oldestOpenAgeHours}h` : "-"}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">实时信号</span>
                                        <span className="font-medium">
                                            {latest.tasksChangedSignalUpdatedAt
                                                ? `${formatAgeSeconds(latest.tasksChangedSignalAgeSeconds)}${
                                                      typeof latest.tasksChangedSignalVersion === "number"
                                                          ? ` · v${latest.tasksChangedSignalVersion}`
                                                          : ""
                                                  } · ${latest.tasksChangedSignalAction || "无动作"}${
                                                      latest.tasksChangedSignalReindexed
                                                          ? ` · reindex${
                                                                typeof latest.tasksChangedSignalReindexedTaskCount === "number"
                                                                    ? `(n=${latest.tasksChangedSignalReindexedTaskCount})`
                                                                    : ""
                                                            }`
                                                          : ""
                                                  }`
                                                : "-"}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">实时连接</span>
                                            <span className="font-medium">
                                                {pollers.length > 0
                                                    ? `${pollerSubscribers} · DB 轮询 ${formatMs(pollerLastDbPollMs)} · 错误 ${pollerErrorCount}`
                                                    : "-"}
                                            </span>
                                        </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">自动采集</span>
                                        <span className="font-medium">
                                            {autoHealthCheck.enqueuedJobId
                                                ? "已入队"
                                                : autoHealthCheck.latestSnapshotAgeMinutes !== null
                                                  ? `快照 ${autoHealthCheck.latestSnapshotAgeMinutes}m`
                                                  : "-"}
                                        </span>
                                    </div>
                                    {latest.queryMs ? (
                                        <>
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">采集耗时</span>
                                                <span className="font-medium">{formatMs(latest.runMs)}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">DB 状态聚合</span>
                                                <span className="font-medium">{formatMs(latest.queryMs.statusGrouped)}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">DB 项目 Top</span>
                                                <span className="font-medium">{formatMs(latest.queryMs.topProjects)}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">DB 案件 Top</span>
                                                <span className="font-medium">{formatMs(latest.queryMs.topCases)}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">DB 项目待办抽样</span>
                                                <span className="font-medium">{formatMs(latest.queryMs.sampleProjectTodo)}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground">DB 案件待办抽样</span>
                                                <span className="font-medium">{formatMs(latest.queryMs.sampleCaseTodo)}</span>
                                            </div>
                                        </>
                                    ) : null}
                                </>
                            ) : (
                                <div className="text-muted-foreground">暂无快照（请先采集）</div>
                            )}
                        </CardContent>
                    </Card>
                ),
            },
            {
                id: "b_kanban_ops_alerts",
                title: "告警",
                pinned: true,
                chrome: "none",
                defaultSize: { w: 8, h: 12, minW: 6, minH: 10 },
                content: (
                    <Card className="h-full bg-card">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">告警</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {alerts.length === 0 ? (
                                <div className="text-sm text-muted-foreground">暂无告警</div>
                            ) : (
                                alerts.map((a) => (
                                    <div
                                        key={a.id}
                                        className="flex flex-col gap-2 rounded-lg border bg-card/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className="font-medium truncate">{a.title}</div>
                                                <Badge className={severityBadgeClass(a.severity)}>{a.severity}</Badge>
                                                <Badge className={statusBadgeClass(a.status)}>{a.status}</Badge>
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                {a.message} · 最后出现 {formatDateTime(a.lastSeenAt)}
                                                {a.snoozedUntil ? ` · 静音至 ${formatDateTime(a.snoozedUntil)}` : ""}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                disabled={actingAlertId === a.id || a.status !== OpsAlertStatus.OPEN}
                                                onClick={() => void doAlertAction(a.id, "ack")}
                                            >
                                                确认
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                disabled={actingAlertId === a.id || a.status === OpsAlertStatus.RESOLVED}
                                                onClick={() => void doAlertAction(a.id, "snooze60")}
                                            >
                                                静音 1h
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                disabled={actingAlertId === a.id || a.status === OpsAlertStatus.RESOLVED}
                                                onClick={() => void doAlertAction(a.id, "snooze1440")}
                                            >
                                                静音 24h
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                disabled={actingAlertId === a.id || a.status !== OpsAlertStatus.SNOOZED}
                                                onClick={() => void doAlertAction(a.id, "unsnooze")}
                                            >
                                                取消静音
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                disabled={actingAlertId === a.id || a.status === OpsAlertStatus.RESOLVED}
                                                onClick={() => void doAlertAction(a.id, "resolve")}
                                            >
                                                标记恢复
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                ),
            },
            {
                id: "b_kanban_ops_top_projects",
                title: "热点项目（Top 5）",
                chrome: "none",
                defaultSize: { w: 6, h: 10, minW: 6, minH: 8 },
                content: (
                    <Card className="h-full bg-card">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">热点项目（Top 5）</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            {!latest ? (
                                <div className="text-muted-foreground">暂无数据</div>
                            ) : latest.topProjects.length === 0 ? (
                                <div className="text-muted-foreground">暂无项目任务</div>
                            ) : (
                                latest.topProjects.map((p) => (
                                    <div key={p.projectId} className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-medium truncate">{p.title}</div>
                                            <div className="text-xs text-muted-foreground font-mono truncate">{p.projectCode}</div>
                                        </div>
                                        <Badge variant="secondary">{p.count}</Badge>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                ),
            },
            {
                id: "b_kanban_ops_top_cases",
                title: "热点案件（Top 5）",
                chrome: "none",
                defaultSize: { w: 6, h: 10, minW: 6, minH: 8 },
                content: (
                    <Card className="h-full bg-card">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">热点案件（Top 5）</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            {!latest ? (
                                <div className="text-muted-foreground">暂无数据</div>
                            ) : latest.topCases.length === 0 ? (
                                <div className="text-muted-foreground">暂无案件任务</div>
                            ) : (
                                latest.topCases.map((c) => (
                                    <div key={c.caseId} className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-medium truncate">{c.title}</div>
                                            <div className="text-xs text-muted-foreground font-mono truncate">{c.caseCode || "-"}</div>
                                        </div>
                                        <Badge variant="secondary">{c.count}</Badge>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                ),
            },
            {
                id: "b_kanban_ops_history",
                title: "历史快照",
                chrome: "none",
                defaultSize: { w: 12, h: 14, minW: 8, minH: 10 },
                content: (
                    <Card className="h-full bg-card">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">历史快照</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {snapshots.length === 0 ? (
                                <div className="text-sm text-muted-foreground">暂无快照</div>
                            ) : (
                                <div className="rounded-lg border overflow-hidden">
                                    <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>采集时间</TableHead>
                                                    <TableHead>未结/总数</TableHead>
                                                    <TableHead>最大列</TableHead>
                                                    <TableHead>最久未结</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                        <TableBody>
                                            {snapshots.map((s) => (
                                                <TableRow key={s.id}>
                                                    <TableCell className="whitespace-nowrap">{formatDateTime(s.capturedAt)}</TableCell>
                                                    <TableCell>{s.metrics ? `${s.metrics.openTasks}/${s.metrics.totalTasks}` : "-"}</TableCell>
                                                    <TableCell>
                                                        {s.metrics
                                                            ? `${formatStatusLabel(s.metrics.maxColumn.status)}:${s.metrics.maxColumn.count}`
                                                            : "-"}
                                                    </TableCell>
                                                    <TableCell>
                                                        {s.metrics && s.metrics.oldestOpenAgeHours !== null
                                                            ? `${s.metrics.oldestOpenAgeHours}h`
                                                            : "-"}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ),
            },
        ],
        [
            actingAlertId,
            alerts,
            autoHealthCheck.enqueuedJobId,
            autoHealthCheck.latestSnapshotAgeMinutes,
            doAlertAction,
            latest,
            pollerErrorCount,
            pollerLastDbPollMs,
            pollerSubscribers,
            pollers.length,
            snapshots,
        ]
    )

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 rounded-xl border bg-card/70 shadow-sm p-4">
                <div>
                    <div className="text-xs text-muted-foreground">看板可观测性</div>
                    <div className="text-xl font-semibold tracking-tight">健康快照与告警</div>
                </div>
                <div className="flex items-center gap-2">
                    <Button disabled={running} onClick={() => void triggerHealthCheck()}>
                        {running ? "入队中…" : "采集健康快照"}
                    </Button>
                </div>
            </div>

            <SectionWorkspace
                title="运维卡片（可拖拽/可记忆/可恢复）"
                sectionId="admin_kanban_ops"
                headerVariant="compact"
                rowHeight={30}
                margin={[12, 12]}
                className="rounded-xl border bg-card/70 shadow-sm p-4"
                catalog={deck}
            />
        </div>
    )
}
