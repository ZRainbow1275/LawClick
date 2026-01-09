"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Loader2, Plus, RefreshCcw } from "lucide-react"
import { TimeLogStatus } from "@/lib/prisma-browser"
import { useRouter } from "next/navigation"

import { createTimeLog } from "@/actions/timelogs"
import {
    getCaseTimeLogsPage,
    getCaseTimeSummary,
    type CaseTimeLogListItem,
    type TimeLogSummary,
} from "@/actions/timelogs-crud"
import { LegoDeck } from "@/components/layout/LegoDeck"
import type { SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"

const STATUS_LABEL: Record<TimeLogStatus, string> = {
    RUNNING: "计时中",
    PAUSED: "已暂停",
    COMPLETED: "已完成",
    APPROVED: "已审批",
    BILLED: "已开票",
}

function formatDurationHms(seconds: number) {
    const s = Math.max(0, Math.floor(seconds))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
}

function toDateTimeLocalValue(date: Date) {
    const pad = (n: number) => n.toString().padStart(2, "0")
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
        date.getMinutes()
    )}`
}

export function CaseTimeLogsTab(props: { caseId: string }) {
    const { caseId } = props
    const router = useRouter()

    const [summary, setSummary] = useState<TimeLogSummary | null>(null)
    const [summaryError, setSummaryError] = useState<string | null>(null)

    const [logs, setLogs] = useState<CaseTimeLogListItem[]>([])
    const [nextCursor, setNextCursor] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)

    const [status, setStatus] = useState<"ALL" | TimeLogStatus>("ALL")
    const statusFilter = useMemo(() => (status === "ALL" ? undefined : [status]), [status])

    const [createOpen, setCreateOpen] = useState(false)
    const [creating, setCreating] = useState(false)

    const loadSummary = useCallback(async () => {
        setSummaryError(null)
        try {
            const res = await getCaseTimeSummary(caseId)
            if (!res.success) {
                setSummary(res.data)
                setSummaryError(res.error || "获取工时汇总失败")
                return
            }
            setSummary(res.data)
        } catch {
            setSummaryError("获取工时汇总失败")
        }
    }, [caseId])

    const loadFirstPage = useCallback(async () => {
        setLoading(true)
        try {
            const res = await getCaseTimeLogsPage({
                caseId,
                take: 50,
                status: statusFilter,
            })
            if (!res.success) {
                toast.error("获取工时列表失败", { description: res.error })
                setLogs([])
                setNextCursor(null)
                return
            }
            setLogs(res.data)
            setNextCursor(res.nextCursor)
        } catch {
            toast.error("获取工时列表失败")
            setLogs([])
            setNextCursor(null)
        } finally {
            setLoading(false)
        }
    }, [caseId, statusFilter])

    const loadMore = useCallback(async () => {
        if (!nextCursor || loadingMore) return
        setLoadingMore(true)
        try {
            const res = await getCaseTimeLogsPage({
                caseId,
                cursor: nextCursor,
                take: 50,
                status: statusFilter,
            })
            if (!res.success) {
                toast.error("获取工时列表失败", { description: res.error })
                return
            }
            setLogs((prev) => [...prev, ...res.data])
            setNextCursor(res.nextCursor)
        } catch {
            toast.error("获取工时列表失败")
        } finally {
            setLoadingMore(false)
        }
    }, [caseId, loadingMore, nextCursor, statusFilter])

    useEffect(() => {
        void loadSummary()
        void loadFirstPage()
    }, [loadFirstPage, loadSummary])

    const handleCreate = useCallback(
        async (formData: FormData) => {
            setCreating(true)
            try {
                formData.set("caseId", caseId)
                const res = await createTimeLog(formData)
                if ("error" in res && res.error) {
                    toast.error("记录失败", { description: res.error })
                    return
                }
                toast.success("工时已记录")
                setCreateOpen(false)
                router.refresh()
                await loadSummary()
                await loadFirstPage()
            } catch {
                toast.error("记录失败")
            } finally {
                setCreating(false)
            }
        },
        [caseId, loadFirstPage, loadSummary, router]
    )

    const deck = useMemo<SectionCatalogItem[]>(
        () => [
            {
                id: "b_case_timelogs_main",
                title: "案件工时",
                pinned: true,
                chrome: "none",
                defaultSize: { w: 8, h: 14, minW: 6, minH: 10 },
                content: (
                    <Card className="h-full">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-base">案件工时</CardTitle>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        void loadSummary()
                                        void loadFirstPage()
                                    }}
                                    disabled={loading}
                                >
                                    <RefreshCcw className="h-4 w-4 mr-1" />
                                    刷新
                                </Button>
                                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                                    <DialogTrigger asChild>
                                        <Button size="sm" variant="outline" data-testid="case-detail-add-timelog">
                                            <Plus className="h-4 w-4 mr-1" />
                                            记工时
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>记录工时</DialogTitle>
                                        </DialogHeader>
                                        <form action={handleCreate} className="space-y-4">
                                            <div className="grid gap-2">
                                                <Label htmlFor="timelog-description">工作内容</Label>
                                                <Input
                                                    id="timelog-description"
                                                    name="description"
                                                    placeholder="例如：起草合同条款"
                                                    required
                                                    maxLength={5000}
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="grid gap-2">
                                                    <Label htmlFor="timelog-startTime">开始时间</Label>
                                                    <Input
                                                        id="timelog-startTime"
                                                        name="startTime"
                                                        type="datetime-local"
                                                        required
                                                        defaultValue={toDateTimeLocalValue(new Date())}
                                                    />
                                                </div>
                                                <div className="grid gap-2">
                                                    <Label htmlFor="timelog-duration">持续分钟</Label>
                                                    <Input
                                                        id="timelog-duration"
                                                        name="duration"
                                                        type="number"
                                                        required
                                                        min={1}
                                                        max={24 * 60}
                                                        defaultValue={60}
                                                    />
                                                </div>
                                            </div>
                                            <DialogFooter>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => setCreateOpen(false)}
                                                    disabled={creating}
                                                >
                                                    取消
                                                </Button>
                                                <Button type="submit" disabled={creating}>
                                                    {creating ? (
                                                        <>
                                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                            提交中...
                                                        </>
                                                    ) : (
                                                        "确认记录"
                                                    )}
                                                </Button>
                                            </DialogFooter>
                                        </form>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                <Badge variant="secondary">总工时：{summary ? `${summary.totalHours}h` : "—"}</Badge>
                                <Badge variant="secondary">
                                    可计费：{summary ? `${summary.billableHours}h` : "—"}
                                </Badge>
                                <Badge variant="secondary">记录数：{summary ? summary.count : "—"}</Badge>
                                {summaryError ? (
                                    <Badge variant="destructive" className="font-normal">
                                        {summaryError}
                                    </Badge>
                                ) : null}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="text-xs text-muted-foreground">状态筛选</div>
                                <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                                    <SelectTrigger className="h-8 w-[180px]">
                                        <SelectValue placeholder="全部" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">全部</SelectItem>
                                        {Object.values(TimeLogStatus).map((s) => (
                                            <SelectItem key={s} value={s}>
                                                {STATUS_LABEL[s]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>
                ),
            },
            {
                id: "b_case_timelogs_hint",
                title: "提示",
                chrome: "none",
                defaultSize: { w: 4, h: 14, minW: 4, minH: 10 },
                content: (
                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle className="text-base">提示</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground space-y-2">
                            <div>这里展示全案工时（含全部成员），用于案件复盘与计费核对。</div>
                            <div>已审批/已开票的工时不可删除；如需调整请走审批流程。</div>
                        </CardContent>
                    </Card>
                ),
            },
            {
                id: "b_case_timelogs_list",
                title: "工时记录列表",
                pinned: true,
                chrome: "none",
                defaultSize: { w: 12, h: 18, minW: 8, minH: 12 },
                content: (
                    <Card className="h-full flex flex-col">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-base">工时记录列表</CardTitle>
                            {loading ? (
                                <Badge variant="secondary" className="text-xs">
                                    加载中...
                                </Badge>
                            ) : null}
                        </CardHeader>
                        <CardContent className="flex-1 min-h-0 overflow-auto">
                            {loading ? (
                                <div className="py-8 text-sm text-muted-foreground">正在加载工时记录...</div>
                            ) : logs.length === 0 ? (
                                <div className="py-8 text-sm text-muted-foreground text-center">暂无工时记录</div>
                            ) : (
                                <div className="space-y-3">
                                    {logs.map((log) => (
                                        <div key={log.id} className="rounded-lg border bg-card/50 p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 space-y-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <Badge variant="outline" className="text-[10px]">
                                                            {STATUS_LABEL[log.status]}
                                                        </Badge>
                                                        {log.isBillable ? (
                                                            <Badge variant="secondary" className="text-[10px]">
                                                                可计费
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="text-[10px]">
                                                                不计费
                                                            </Badge>
                                                        )}
                                                        <div className="text-xs text-muted-foreground truncate">
                                                            {log.user.name || log.user.email}
                                                        </div>
                                                    </div>
                                                    <div className="text-sm font-medium text-foreground break-words">
                                                        {log.description}
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                        <span>{new Date(log.startTime).toLocaleString("zh-CN")}</span>
                                                        {log.task ? (
                                                            <span className="truncate">· 任务：{log.task.title}</span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <div className="font-mono text-sm font-semibold">
                                                        {formatDurationHms(log.duration)}
                                                    </div>
                                                    {log.billingAmount != null ? (
                                                        <div className="text-xs text-muted-foreground mt-1">
                                                            ￥{log.billingAmount.toFixed(2)}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {nextCursor ? (
                                        <div className="flex justify-center pt-2">
                                            <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
                                                {loadingMore ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                        加载中...
                                                    </>
                                                ) : (
                                                    "加载更多"
                                                )}
                                            </Button>
                                        </div>
                                    ) : null}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ),
            },
        ],
        [
            createOpen,
            creating,
            handleCreate,
            loadFirstPage,
            loadMore,
            loadSummary,
            loading,
            loadingMore,
            logs,
            nextCursor,
            status,
            summary,
            summaryError,
        ]
    )

    return <LegoDeck title="案件工时（可拖拽）" sectionId="case_timelogs" catalog={deck} />
}
