"use client"

import * as React from "react"
import Link from "next/link"
import { RefreshCw, Search, Users } from "lucide-react"

import { getCustomerDirectory } from "@/actions/customer-actions"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { getCustomerGradeMeta, getCustomerStageMeta } from "@/lib/crm/customer-meta"

type CustomerDirectoryRow = Extract<
    Awaited<ReturnType<typeof getCustomerDirectory>>,
    { success: true }
>["data"][number]

function formatTypeLabel(type: CustomerDirectoryRow["type"]) {
    return type === "COMPANY" ? "企业" : "个人"
}

function buildSubtitle(row: CustomerDirectoryRow) {
    const parts = [
        formatTypeLabel(row.type),
        row.email || "",
        row.phone || "",
    ].filter(Boolean)
    return parts.join(" · ")
}

export function CustomerDirectoryWidgetClient() {
    const [query, setQuery] = React.useState("")
    const [rows, setRows] = React.useState<CustomerDirectoryRow[]>([])
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    const load = React.useCallback(async (nextQuery: string) => {
        setLoading(true)
        setError(null)
        try {
            const res = await getCustomerDirectory({ search: nextQuery || undefined, limit: 30 })
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
                    <Users className="h-4 w-4" />
                    <span>客户目录</span>
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
                        <Link href="/crm/customers">打开 CRM</Link>
                    </Button>
                </div>
            </div>

            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索客户（名称/邮箱/电话）"
                    className="pl-9"
                />
            </div>

            {error ? <div className="text-sm text-muted-foreground">加载失败：{error}</div> : null}

            <div className="space-y-2">
                {!loading && !error && rows.length === 0 ? (
                    <div className="text-sm text-muted-foreground">暂无匹配客户</div>
                ) : null}
                {rows.map((row) => {
                    const stage = getCustomerStageMeta(row.stage)
                    const grade = getCustomerGradeMeta(row.grade)
                    return (
                        <Link
                            key={row.id}
                            href={`/crm/customers/${row.id}`}
                            className="block rounded-lg border bg-card/50 px-3 py-2 hover:bg-accent transition-colors"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-sm font-medium truncate">{row.name}</div>
                                    <div className="mt-1 text-xs text-muted-foreground truncate">
                                        {buildSubtitle(row)}
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                    <Badge variant={stage.badgeVariant} className="text-[10px]">
                                        {stage.label}
                                    </Badge>
                                    <Badge variant={grade.badgeVariant} className="text-[10px]">
                                        {grade.label}
                                    </Badge>
                                </div>
                            </div>
                        </Link>
                    )
                })}
            </div>
        </div>
    )
}

