"use client"

import * as React from "react"
import Link from "next/link"
import { FileText, FolderOpen, RefreshCcw } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { getDashboardRecentDocuments, type DashboardRecentDocument } from "@/actions/dashboard-widgets"

function formatDocType(fileType?: string | null) {
    if (!fileType) return "—"
    const lower = fileType.toLowerCase()
    if (lower.includes("pdf")) return "PDF"
    if (lower.includes("word")) return "Word"
    if (lower.includes("officedocument")) return "Office"
    if (lower.includes("image")) return "图片"
    if (lower.includes("text")) return "文本"
    return fileType.split("/")[1] || fileType
}

function DocRow({ doc }: { doc: DashboardRecentDocument }) {
    const updated = new Date(doc.updatedAt).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    })

    return (
        <div className="flex items-start justify-between gap-3 rounded-lg border bg-card/50 px-3 py-2">
            <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <Link href={`/documents/${doc.id}`} className="text-sm font-medium truncate hover:underline">
                        {doc.title || "未命名文档"}
                    </Link>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{updated}</span>
                    <span className="truncate">
                        • {doc.case.caseCode ? `${doc.case.caseCode} ` : ""}
                        {doc.case.title}
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {doc.category ? <Badge variant="secondary">{doc.category}</Badge> : null}
                <Badge variant="outline">{formatDocType(doc.fileType)}</Badge>
            </div>
        </div>
    )
}

export function RecentDocumentsWidget() {
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [docs, setDocs] = React.useState<DashboardRecentDocument[]>([])

    const load = React.useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await getDashboardRecentDocuments({ take: 8 })
            if (!res.success) {
                setDocs([])
                setError(res.error || "获取最近文档失败")
                return
            }
            setDocs(res.data)
        } catch {
            setDocs([])
            setError("获取最近文档失败")
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        void load()
    }, [load])

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FolderOpen className="h-4 w-4" />
                    <span>最近更新</span>
                </div>
                <div className="flex items-center gap-2">
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/documents">打开文档中心</Link>
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={load}
                        disabled={loading}
                        title="刷新"
                    >
                        <RefreshCcw className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {error ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    {error}
                </div>
            ) : loading ? (
                <div className="text-sm text-muted-foreground">加载中...</div>
            ) : docs.length === 0 ? (
                <div className="text-sm text-muted-foreground">暂无文档</div>
            ) : (
                <div className="space-y-2">
                    {docs.map((doc) => (
                        <DocRow key={doc.id} doc={doc} />
                    ))}
                </div>
            )}
        </div>
    )
}
