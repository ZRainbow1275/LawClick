"use client"

import { useEffect, useMemo, useState, type ComponentProps } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { UploadIntentStatus } from "@/lib/prisma-browser"

import { enqueueCleanupUploadIntents, getUploadIntents, type UploadIntentListItem } from "@/actions/upload-intents"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table"
import { TaskType } from "@/lib/queue-task-types"

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>

const STATUS_META: Record<UploadIntentStatus, { label: string; badgeVariant: BadgeVariant }> = {
    INITIATED: { label: "已初始化", badgeVariant: "warning" },
    FINALIZED: { label: "已落库", badgeVariant: "success" },
    EXPIRED: { label: "已过期", badgeVariant: "secondary" },
    CLEANED: { label: "已回收", badgeVariant: "info" },
    FAILED: { label: "失败", badgeVariant: "destructive" },
}

function formatBytes(bytes: number) {
    const n = Number.isFinite(bytes) ? Math.max(0, bytes) : 0
    if (n < 1024) return `${n} B`
    const kb = n / 1024
    if (kb < 1024) return `${kb.toFixed(1)} KB`
    const mb = kb / 1024
    if (mb < 1024) return `${mb.toFixed(1)} MB`
    const gb = mb / 1024
    return `${gb.toFixed(2)} GB`
}

function formatDate(value: unknown) {
    if (!value) return "-"
    const d = typeof value === "string" ? new Date(value) : value instanceof Date ? value : null
    if (!d || Number.isNaN(d.getTime())) return "-"
    return d.toLocaleString("zh-CN")
}

function shortId(id: string) {
    const v = (id || "").trim()
    if (v.length <= 10) return v
    return `${v.slice(0, 6)}...${v.slice(-4)}`
}

export function UploadIntentsClient(props: {
    initialIntents: UploadIntentListItem[]
    counts: Partial<Record<UploadIntentStatus, number>>
    tenantId: string | null
    initialStatus: UploadIntentStatus | "ALL"
    initialQuery: string
    nextCursor: string | null
}) {
    const router = useRouter()
    const searchParams = useSearchParams()

    const [hydrated, setHydrated] = useState(false)
    const [status, setStatus] = useState<UploadIntentStatus | "ALL">(props.initialStatus)
    const [query, setQuery] = useState(props.initialQuery)
    const [intents, setIntents] = useState<UploadIntentListItem[]>(props.initialIntents)
    const [cursor, setCursor] = useState<string | null>(props.nextCursor)
    const [loadingMore, setLoadingMore] = useState(false)
    const [enqueueing, setEnqueueing] = useState(false)
    const [processingQueue, setProcessingQueue] = useState(false)

    useEffect(() => {
        setStatus(props.initialStatus)
        setQuery(props.initialQuery)
        setIntents(props.initialIntents)
        setCursor(props.nextCursor)
    }, [props.initialIntents, props.initialQuery, props.initialStatus, props.nextCursor])

    useEffect(() => {
        setHydrated(true)
    }, [])

    const statusCounts = useMemo(() => {
        const counts = props.counts || {}
        const all = Object.values(UploadIntentStatus).reduce((sum, s) => sum + (counts[s] || 0), 0)
        return { all, counts }
    }, [props.counts])

    const applyFilters = () => {
        const params = new URLSearchParams(Array.from(searchParams.entries()))
        const q = query.trim()
        if (q) params.set("q", q)
        else params.delete("q")

        if (status === "ALL") params.delete("status")
        else params.set("status", status)

        const qs = params.toString()
        router.push(`/admin/ops/uploads${qs ? `?${qs}` : ""}`)
    }

    const loadMore = async () => {
        if (!cursor || loadingMore) return
        setLoadingMore(true)
        try {
            const res = await getUploadIntents({
                status: status === "ALL" ? undefined : status,
                query: query.trim() || undefined,
                take: 100,
                cursor,
            })
            if (!res.success) {
                toast.error("加载失败", { description: res.error })
                return
            }

            const next = res.data || []
            const merged = [...intents, ...next]
            const uniq = new Map<string, UploadIntentListItem>()
            for (const item of merged) uniq.set(item.id, item)
            setIntents(Array.from(uniq.values()))
            setCursor(res.nextCursor ?? null)
        } catch {
            toast.error("加载失败")
        } finally {
            setLoadingMore(false)
        }
    }

    const enqueueCleanup = async () => {
        setEnqueueing(true)
        try {
            const res = await enqueueCleanupUploadIntents({ take: 100, graceMinutes: 24 * 60 })
            if (!res.success) {
                toast.error("入队失败", { description: res.error })
                return
            }
            toast.success("已入队清理任务", { description: `jobId: ${res.jobId}` })
            router.refresh()
        } catch {
            toast.error("入队失败")
        } finally {
            setEnqueueing(false)
        }
    }

    const runQueueNow = async () => {
        setProcessingQueue(true)
        try {
            const res = await fetch(`/api/queue/process?max=50&budgetMs=20000&type=${TaskType.CLEANUP_UPLOAD_INTENTS}`, {
                method: "POST",
            })
            const data = (await res.json().catch(() => null)) as unknown
            if (!res.ok) {
                const message =
                    data && typeof data === "object" && "error" in data && typeof (data as { error?: unknown }).error === "string"
                        ? (data as { error: string }).error
                        : "清理队列执行失败"
                toast.error("清理队列执行失败", { description: message })
                return
            }
            toast.success("清理队列已执行", {
                description: `processed: ${String((data as { processed?: unknown } | null)?.processed ?? "")}`,
            })
            router.refresh()
        } catch {
            toast.error("清理队列执行失败")
        } finally {
            setProcessingQueue(false)
        }
    }

    const overviewPanel = (
        <div className="space-y-3">
            <div className="hidden" data-testid="upload-intents-hydrated" data-hydrated={hydrated ? "1" : "0"} />

            <div className="flex flex-col gap-3 rounded-xl border bg-card/70 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="text-xs text-muted-foreground">后台运行机制 / 上传</div>
                        <div className="text-xl font-semibold tracking-tight">上传意图审计与对象回收</div>
                        <div className="text-xs text-muted-foreground mt-1">
                            Presigned 直传会先写入 UploadIntent；finalize 成功标记为“已落库”；过期未 finalize
                            可通过队列清理回收。
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={runQueueNow} disabled={processingQueue}>
                            {processingQueue ? "执行中…" : "立即执行队列"}
                        </Button>
                        <Button onClick={enqueueCleanup} disabled={enqueueing}>
                            {enqueueing ? "入队中…" : "入队清理任务"}
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                        全部 {statusCounts.all}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                        tenant <span className="font-mono">{props.tenantId || "--"}</span>
                    </Badge>
                    {Object.values(UploadIntentStatus).map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">
                            {STATUS_META[s].label} {props.counts?.[s] ?? 0}
                        </Badge>
                    ))}
                </div>
            </div>
        </div>
    )

    const filterPanel = (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base">筛选</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                    <Select value={status} onValueChange={(v) => setStatus(v as UploadIntentStatus | "ALL")}>
                        <SelectTrigger className="w-40">
                            <SelectValue placeholder="状态" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">全部</SelectItem>
                            {Object.values(UploadIntentStatus).map((s) => (
                                <SelectItem key={s} value={s}>
                                    {STATUS_META[s].label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Input
                        className="w-72"
                        placeholder="搜索：文件名 / key / 案号 / 案件标题 / documentId"
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
                    当前 {intents.length} 条{cursor ? "（可继续加载）" : ""}
                </div>
            </CardContent>
        </Card>
    )

    const listPanel = (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base">UploadIntent 列表</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[120px]">状态</TableHead>
                            <TableHead>案件</TableHead>
                            <TableHead>文档</TableHead>
                            <TableHead>文件</TableHead>
                            <TableHead className="w-[110px]">版本</TableHead>
                            <TableHead className="w-[150px]">过期时间</TableHead>
                            <TableHead className="w-[150px]">创建时间</TableHead>
                            <TableHead>错误</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {intents.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="text-sm text-muted-foreground">
                                    暂无数据
                                </TableCell>
                            </TableRow>
                        ) : (
                            intents.map((intent) => {
                                const meta = STATUS_META[intent.status]
                                return (
                                    <TableRow key={intent.id}>
                                        <TableCell>
                                            <Badge variant={meta.badgeVariant}>{meta.label}</Badge>
                                        </TableCell>
                                        <TableCell className="min-w-[220px]">
                                            <div className="text-sm">
                                                <Link href={`/cases/${intent.caseId}`} className="hover:underline">
                                                    {intent.case.caseCode ? `#${intent.case.caseCode} ` : ""}
                                                    {intent.case.title}
                                                </Link>
                                            </div>
                                            <div className="text-xs text-muted-foreground">caseId: {shortId(intent.caseId)}</div>
                                        </TableCell>
                                        <TableCell className="min-w-[160px]">
                                            <div className="text-sm">
                                                <Link href={`/documents/${intent.documentId}`} className="hover:underline">
                                                    {shortId(intent.documentId)}
                                                </Link>
                                            </div>
                                            <div className="text-xs text-muted-foreground">{formatBytes(intent.expectedFileSize)}</div>
                                        </TableCell>
                                        <TableCell className="min-w-[260px]">
                                            <div className="text-sm">{intent.filename}</div>
                                            <div className="text-xs text-muted-foreground truncate max-w-[420px]">{intent.key}</div>
                                        </TableCell>
                                        <TableCell>v{intent.expectedVersion}</TableCell>
                                        <TableCell>{formatDate(intent.expiresAt)}</TableCell>
                                        <TableCell>{formatDate(intent.createdAt)}</TableCell>
                                        <TableCell className="max-w-[280px]">
                                            <div className="text-xs text-destructive line-clamp-2">{intent.lastError || ""}</div>
                                        </TableCell>
                                    </TableRow>
                                )
                            })
                        )}
                    </TableBody>
                </Table>
                <div className="flex items-center justify-center p-4">
                    <Button variant="outline" onClick={loadMore} disabled={!cursor || loadingMore}>
                        {loadingMore ? "加载中…" : cursor ? "加载更多" : "已到末尾"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_upload_overview",
            title: "概览 / 队列",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 8, minW: 6, minH: 6 },
            content: overviewPanel,
        },
        {
            id: "b_upload_filters",
            title: "筛选",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 9, minW: 6, minH: 7 },
            content: filterPanel,
        },
        {
            id: "b_upload_list",
            title: "列表",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 22, minW: 6, minH: 12 },
            content: listPanel,
        },
    ]

    return (
        <SectionWorkspace title="上传意图" sectionId="admin_upload_intents" catalog={catalog} className="p-6" />
    )
}
