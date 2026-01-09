"use client"

import * as React from "react"
import Link from "next/link"
import { RefreshCcw, Search } from "lucide-react"

import { getSimilarCases, type SimilarCaseItem } from "@/actions/similar-cases"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { getCaseStatusMeta } from "@/lib/cases/case-status-meta"
import { logger } from "@/lib/logger"

export function SimilarCasesBlock(props: { caseId: string }) {
    const { caseId } = props
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [items, setItems] = React.useState<SimilarCaseItem[]>([])

    const load = React.useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await getSimilarCases({ caseId, take: 8 })
            if (!res.success) {
                setItems([])
                setError(res.error || "获取相似案件失败")
                return
            }
            setItems(res.data)
        } catch (e) {
            logger.error("加载相似案件失败", e)
            setItems([])
            setError(e instanceof Error ? e.message : "获取相似案件失败")
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
                <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                    <Search className="h-4 w-4" />
                    <span className="truncate">相似案件</span>
                    {loading ? <span className="text-xs">加载中…</span> : null}
                </div>
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
            </div>

            {error ? <div className="text-sm text-destructive">加载失败：{error}</div> : null}
            {!loading && !error && items.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                    暂未找到明显相似的案件（按客户/模板/当事人/标题与描述关键词综合计算）。
                </div>
            ) : null}

            {items.length > 0 ? (
                <div className="space-y-2">
                    {items.map((c) => {
                        const meta = getCaseStatusMeta(c.status)
                        return (
                            <div key={c.id} className="rounded-lg border bg-card/50 px-3 py-2">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <Link
                                            href={`/cases/${c.id}`}
                                            className="text-sm font-medium truncate hover:underline block"
                                        >
                                            {c.caseCode ? `${c.caseCode} · ` : ""}
                                            {c.title}
                                        </Link>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                            <span>匹配分：{c.score}</span>
                                            {c.match.sameClient ? <span>• 同一客户</span> : null}
                                            {c.match.sameTemplate ? <span>• 同一模板</span> : null}
                                            {c.match.sharedPartyCount > 0 ? (
                                                <span>• 当事人重合 {c.match.sharedPartyCount}</span>
                                            ) : null}
                                            {c.match.sharedKeywordCount > 0 ? (
                                                <span>• 关键词重合 {c.match.sharedKeywordCount}</span>
                                            ) : null}
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="shrink-0 text-xs">
                                        {meta.label}
                                    </Badge>
                                </div>
                            </div>
                        )
                    })}
                </div>
            ) : null}
        </div>
    )
}
