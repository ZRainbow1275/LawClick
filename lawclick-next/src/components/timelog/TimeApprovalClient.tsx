"use client"

import * as React from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import {
    approveTimeLog,
    getTimeLogsPendingApproval,
    markTimeLogBilled,
    unapproveTimeLog,
    unmarkTimeLogBilled,
} from "@/actions/timelogs-crud"

type ApprovalLog = Awaited<ReturnType<typeof getTimeLogsPendingApproval>>["data"][number]

function formatDurationCompact(seconds: number) {
    const s = Math.max(0, Math.floor(seconds))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
}

export function TimeApprovalClient({ enabled, onChanged }: { enabled: boolean; onChanged?: () => void }) {
    const [loading, setLoading] = React.useState(true)
    const [logs, setLogs] = React.useState<ApprovalLog[]>([])

    const load = React.useCallback(async () => {
        if (!enabled) return
        setLoading(true)
        const res = await getTimeLogsPendingApproval({
            take: 100,
            status: ["COMPLETED", "APPROVED", "BILLED"],
        })
        if (res.success) setLogs(res.data)
        setLoading(false)
    }, [enabled])

    React.useEffect(() => {
        load()
    }, [load])

    const mutate = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
        const res = await fn()
        if (!res.success) {
            toast.error("操作失败", { description: res.error })
            return
        }
        toast.success("已更新")
        await load()
        onChanged?.()
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">工时审批</CardTitle>
                {enabled ? (
                    <CardDescription>状态流：COMPLETED → APPROVED → BILLED</CardDescription>
                ) : (
                    <CardDescription>当前角色缺少 timelog:approve 权限</CardDescription>
                )}
            </CardHeader>
            {enabled ? (
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-10 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin mr-2" />
                            加载中…
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground">暂无记录</div>
                    ) : (
                        <div className="space-y-2">
                            {logs.map((log) => (
                                <div
                                    key={log.id}
                                    className="flex items-center justify-between gap-4 p-3 rounded-lg border bg-background hover:bg-muted/30 transition-colors"
                                >
                                    <div className="min-w-0">
                                        <div className="font-medium truncate">{log.description}</div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                            {log.user?.name || log.user?.email} · {formatDurationCompact(log.duration)} ·{" "}
                                            {log.isBillable ? "可计费" : "不计费"}
                                        </div>
                                        {log.case ? (
                                            <div className="text-xs text-muted-foreground mt-1 truncate">
                                                {log.case.caseCode} · {log.case.title}
                                                {log.task ? ` · ${log.task.title}` : ""}
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <Badge
                                            variant={
                                                log.status === "BILLED"
                                                    ? "default"
                                                    : log.status === "APPROVED"
                                                        ? "secondary"
                                                        : "outline"
                                            }
                                        >
                                            {log.status}
                                        </Badge>

                                        {log.status === "COMPLETED" ? (
                                            <Button size="sm" onClick={() => mutate(() => approveTimeLog(log.id))}>
                                                审批
                                            </Button>
                                        ) : null}

                                        {log.status === "APPROVED" ? (
                                            <>
                                                <Button size="sm" variant="outline" onClick={() => mutate(() => unapproveTimeLog(log.id))}>
                                                    撤销
                                                </Button>
                                                <Button size="sm" onClick={() => mutate(() => markTimeLogBilled(log.id))}>
                                                    计费
                                                </Button>
                                            </>
                                        ) : null}

                                        {log.status === "BILLED" ? (
                                            <Button size="sm" variant="outline" onClick={() => mutate(() => unmarkTimeLogBilled(log.id))}>
                                                撤销计费
                                            </Button>
                                        ) : null}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            ) : (
                <CardContent>
                    <div className="text-sm text-muted-foreground">请切换到具备审批权限的角色或联系管理员授权。</div>
                </CardContent>
            )}
        </Card>
    )
}

