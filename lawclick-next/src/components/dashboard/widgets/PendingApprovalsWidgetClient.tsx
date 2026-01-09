"use client"

import * as React from "react"
import Link from "next/link"
import { RefreshCcw, ShieldCheck } from "lucide-react"

import { getMyApprovals } from "@/actions/approval-actions"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"

type ApprovalItem = {
    id: string
    title: string
    type: string
    status: string
    createdAt: string
    requesterName: string | null
    caseTitle: string | null
    amount: string | null
}

function safeDateTime(value: Date | string) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "—"
    return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function toApprovalItem(raw: Extract<Awaited<ReturnType<typeof getMyApprovals>>, { success: true }>["data"][number]): ApprovalItem {
    const createdAt = new Date(raw.createdAt)
    const iso = Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString()

    const amountRaw = raw.amount
    const amount =
        amountRaw === null || amountRaw === undefined
            ? null
            : typeof amountRaw === "string"
              ? amountRaw
              : "toString" in amountRaw && typeof amountRaw.toString === "function"
                ? amountRaw.toString()
                : String(amountRaw)

    return {
        id: raw.id,
        title: raw.title,
        type: String(raw.type),
        status: String(raw.status),
        createdAt: iso,
        requesterName: raw.requester?.name ?? null,
        caseTitle: raw.case?.title ?? null,
        amount,
    }
}

export function PendingApprovalsWidgetClient() {
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [items, setItems] = React.useState<ApprovalItem[]>([])

    const load = React.useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await getMyApprovals("pending")
            if (!res.success) {
                setItems([])
                setError(res.error || "获取审批失败")
                return
            }
            setItems(res.data.map(toApprovalItem).slice(0, 10))
        } catch (e) {
            setItems([])
            setError(e instanceof Error ? e.message : "获取审批失败")
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        void load()
    }, [load])

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                    <ShieldCheck className="h-4 w-4" />
                    <span className="truncate">待我审批</span>
                    <Badge variant={items.length > 0 ? "default" : "secondary"} className="shrink-0">
                        {items.length}
                    </Badge>
                    {loading ? <span className="text-xs">加载中…</span> : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7"
                        onClick={() => void load()}
                        disabled={loading}
                        title="刷新"
                    >
                        <RefreshCcw className="h-4 w-4" />
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/admin/approvals">打开</Link>
                    </Button>
                </div>
            </div>

            {error ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    {error}
                </div>
            ) : loading ? (
                <div className="text-sm text-muted-foreground">加载中...</div>
            ) : items.length === 0 ? (
                <div className="text-sm text-muted-foreground">暂无待处理审批</div>
            ) : (
                <div className="space-y-2">
                    {items.map((a) => {
                        const when = safeDateTime(a.createdAt)
                        return (
                            <div key={a.id} className="rounded-lg border bg-card/50 px-3 py-2">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <Link
                                            href={`/admin/approvals/${a.id}`}
                                            className="text-sm font-medium truncate hover:underline block"
                                        >
                                            {a.title}
                                        </Link>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                            <span>{when}</span>
                                            {a.requesterName ? <span>• 发起人：{a.requesterName}</span> : null}
                                            {a.caseTitle ? <span className="truncate">• 案件：{a.caseTitle}</span> : null}
                                            {a.amount ? <span>• 金额：{a.amount}</span> : null}
                                        </div>
                                    </div>
                                    <div className="text-xs text-muted-foreground shrink-0">{a.type}</div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

