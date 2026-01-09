"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, Copy, FileText, ShieldAlert, XCircle } from "lucide-react"
import { analyzeDocumentById } from "@/actions/ai-actions"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { ScrollArea } from "@/components/ui/ScrollArea"
import { Textarea } from "@/components/ui/Textarea"
import type { DocumentReviewDoc, DocumentReviewItem, DocumentReviewStatus } from "@/lib/documents/document-review-types"

function statusBadgeVariant(status: DocumentReviewStatus) {
    if (status === "PASS") return "secondary" as const
    if (status === "WARN") return "outline" as const
    return "destructive" as const
}

function statusIcon(status: DocumentReviewStatus) {
    if (status === "PASS") return CheckCircle2
    if (status === "WARN") return AlertTriangle
    return XCircle
}

function statusLabel(status: DocumentReviewStatus) {
    if (status === "PASS") return "通过"
    if (status === "WARN") return "需关注"
    return "阻断"
}

export function DocumentReviewClient(props: { document: DocumentReviewDoc; items: DocumentReviewItem[] }) {
    const { document, items } = props

    const stats = useMemo(() => {
        const counts = { PASS: 0, WARN: 0, FAIL: 0 } as const as Record<DocumentReviewStatus, number>
        for (const it of items) counts[it.status] += 1
        return counts
    }, [items])

    type DocumentAnalysisType = "summary" | "keypoints" | "risks" | "timeline"
    type DocumentContentSource = "notes" | "pasted"

    const [analysisType, setAnalysisType] = useState<DocumentAnalysisType>("risks")
    const [contentSource, setContentSource] = useState<DocumentContentSource>("notes")
    const [pastedText, setPastedText] = useState("")
    const [aiSubmitting, setAiSubmitting] = useState(false)
    const [aiError, setAiError] = useState<string | null>(null)
    const [aiOutput, setAiOutput] = useState<string | null>(null)

    const reviewText = useMemo(() => {
        const lines: string[] = []
        lines.push(`文档审阅：${document.title}`)
        lines.push(`案件：${document.case.caseCode ? `${document.case.caseCode} · ` : ""}${document.case.title}`)
        lines.push(`版本：v${document.version || 1}`)
        lines.push(`时间：${new Date().toLocaleString("zh-CN")}`)
        lines.push("")
        for (const it of items) {
            const prefix = it.status === "PASS" ? "✅" : it.status === "WARN" ? "⚠️" : "⛔"
            lines.push(`${prefix} ${it.title}${it.detail ? `：${it.detail}` : ""}`)
        }
        return lines.join("\n")
    }, [document.case.caseCode, document.case.title, document.title, document.version, items])

    async function handleAnalyze() {
        if (aiSubmitting) return
        setAiSubmitting(true)
        setAiError(null)
        setAiOutput(null)
        try {
            const result = await analyzeDocumentById({
                documentId: document.id,
                analysisType,
                contentSource,
                ...(contentSource === "pasted" ? { pastedText } : {}),
            })
            if (!result.success) {
                setAiError(result.error || "AI 审查失败")
                return
            }
            setAiOutput((result.data?.content || "").trim() || "（无输出）")
        } finally {
            setAiSubmitting(false)
        }
    }

    const header = (
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
                <div className="text-sm text-muted-foreground">
                    <Link href="/documents" className="hover:underline">
                        文档中心
                    </Link>
                    <span className="mx-2">/</span>
                    <Link href={`/documents/${document.id}`} className="hover:underline">
                        文档详情
                    </Link>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                    <h1 className="text-xl font-bold truncate">文档审阅：{document.title}</h1>
                    <Badge variant="secondary">v{document.version || 1}</Badge>
                    {document.isConfidential ? <Badge variant="destructive">保密</Badge> : null}
                </div>
            </div>
            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    onClick={async () => {
                        try {
                            await navigator.clipboard.writeText(reviewText)
                            toast.success("已复制审阅报告")
                        } catch {
                            toast.error("复制失败")
                        }
                    }}
                >
                    <Copy className="h-4 w-4 mr-2" />
                    复制报告
                </Button>
                <Button asChild variant="outline">
                    <Link href={`/cases/${document.case.id}`}>进入案件</Link>
                </Button>
            </div>
        </div>
    )

    const summaryCard = (
        <Card className="h-full">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-primary" />
                    审阅摘要
                </CardTitle>
                <CardDescription>
                    该页默认提供规则/一致性审阅（不含 AI 生成），用于快速核对文档与系统元数据、版本的一致性。
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" /> 通过 {stats.PASS}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                        <AlertTriangle className="h-3 w-3" /> 需关注 {stats.WARN}
                    </Badge>
                    <Badge variant="destructive" className="gap-1">
                        <XCircle className="h-3 w-3" /> 阻断 {stats.FAIL}
                    </Badge>
                </div>

                <div className="rounded-md border bg-muted/20 p-3 space-y-1">
                    <div className="text-xs text-muted-foreground">文档元信息</div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <span>分类：{document.category || "-"}</span>
                        <span>文件：{document.fileUrl ? "已上传" : "未上传"}</span>
                        <span>标签：{(document.tags || []).length}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    )

    const checklistCard = (
        <Card className="h-full">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    审阅清单
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
                {items.length === 0 ? (
                    <div className="text-muted-foreground">暂无检查项</div>
                ) : (
                    items.map((it) => {
                        const Icon = statusIcon(it.status)
                        return (
                            <div key={it.id} className="rounded-md border bg-card/50 p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <Icon
                                                className={
                                                    it.status === "PASS"
                                                        ? "h-4 w-4 text-success"
                                                        : it.status === "WARN"
                                                          ? "h-4 w-4 text-warning"
                                                          : "h-4 w-4 text-destructive"
                                                }
                                            />
                                            <div className="font-medium truncate">{it.title}</div>
                                        </div>
                                        {it.detail ? (
                                            <div className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
                                                {it.detail}
                                            </div>
                                        ) : null}
                                    </div>
                                    <Badge variant={statusBadgeVariant(it.status)}>{statusLabel(it.status)}</Badge>
                                </div>
                            </div>
                        )
                    })
                )}
            </CardContent>
        </Card>
    )

    const aiReviewCard = (
        <Card className="h-full">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-primary" />
                    AI 审查
                </CardTitle>
                <CardDescription>基于备注/粘贴文本进行 AI 审查，并落库可追溯审计记录。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="grid gap-2">
                        <div className="text-xs text-muted-foreground">分析类型</div>
                        <Select value={analysisType} onValueChange={(v) => setAnalysisType(v as DocumentAnalysisType)}>
                            <SelectTrigger>
                                <SelectValue placeholder="选择分析类型" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="risks">风险识别</SelectItem>
                                <SelectItem value="keypoints">要点提取</SelectItem>
                                <SelectItem value="summary">摘要</SelectItem>
                                <SelectItem value="timeline">时间线</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <div className="text-xs text-muted-foreground">内容来源</div>
                        <Select value={contentSource} onValueChange={(v) => setContentSource(v as DocumentContentSource)}>
                            <SelectTrigger>
                                <SelectValue placeholder="选择内容来源" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="notes">备注/草稿（notes）</SelectItem>
                                <SelectItem value="pasted">粘贴文本</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {contentSource === "pasted" ? (
                    <div className="grid gap-2">
                        <div className="text-xs text-muted-foreground">粘贴文本</div>
                        <Textarea
                            value={pastedText}
                            onChange={(e) => setPastedText(e.target.value)}
                            placeholder="粘贴需要审查的文本内容..."
                            rows={6}
                        />
                    </div>
                ) : null}

                <div className="flex items-center gap-2">
                    <Button onClick={handleAnalyze} disabled={aiSubmitting}>
                        {aiSubmitting ? "生成中..." : "生成 AI 审查结果"}
                    </Button>
                    {aiOutput ? (
                        <Button
                            variant="outline"
                            onClick={async () => {
                                try {
                                    await navigator.clipboard.writeText(aiOutput)
                                    toast.success("已复制 AI 审查结果")
                                } catch {
                                    toast.error("复制失败")
                                }
                            }}
                        >
                            复制结果
                        </Button>
                    ) : null}
                </div>

                {aiError ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                        <div className="font-medium text-destructive">AI 审查失败</div>
                        <div className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap break-words">{aiError}</div>
                    </div>
                ) : null}

                {aiOutput ? (
                    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                        <div className="font-medium">AI 审查结果</div>
                        <ScrollArea className="h-[360px] rounded-md border bg-background/50 p-3">
                            <pre className="whitespace-pre-wrap text-sm leading-relaxed">{aiOutput}</pre>
                        </ScrollArea>
                    </div>
                ) : null}
            </CardContent>
        </Card>
    )

    const contentCard = (
        <Card className="h-full">
            <CardHeader>
                <CardTitle>内容预览</CardTitle>
                <CardDescription>用于快速核对摘要/备注是否与文档版本一致。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                <div className="grid gap-2">
                    <div className="text-xs text-muted-foreground">摘要</div>
                    <ScrollArea className="h-[120px] rounded-md border bg-muted/20 p-3">
                        <pre className="whitespace-pre-wrap text-sm leading-relaxed">
                            {(document.summary || "").trim() || "（暂无摘要）"}
                        </pre>
                    </ScrollArea>
                </div>
                <div className="grid gap-2">
                    <div className="text-xs text-muted-foreground">备注/草稿（notes）</div>
                    <ScrollArea className="h-[240px] rounded-md border bg-muted/20 p-3">
                        <pre className="whitespace-pre-wrap text-sm leading-relaxed">
                            {(document.notes || "").trim() || "（暂无备注）"}
                        </pre>
                    </ScrollArea>
                </div>
            </CardContent>
        </Card>
    )

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_review_header",
            title: "导航",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 4, minW: 8, minH: 3 },
            content: header,
        },
        {
            id: "b_review_summary",
            title: "摘要",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 6, h: 10, minW: 4, minH: 8 },
            content: summaryCard,
        },
        {
            id: "b_review_checklist",
            title: "清单",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 6, h: 10, minW: 4, minH: 8 },
            content: checklistCard,
        },
        {
            id: "b_review_content",
            title: "内容预览",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 18, minW: 6, minH: 12 },
            content: contentCard,
        },
        {
            id: "b_review_ai",
            title: "AI 审查",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 18, minW: 6, minH: 12 },
            content: aiReviewCard,
        },
    ]

    return (
        <SectionWorkspace title="文档审阅" sectionId="document_review" entityId={document.id} catalog={catalog} className="h-full" />
    )
}
