"use client"

import Link from "next/link"
import { ArrowLeft, ExternalLink, Puzzle, Wrench } from "lucide-react"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"

export type WorkbenchDocumentSummary = {
    id: string
    title: string
    case: { id: string; title: string; caseCode: string } | null
    category: string | null
    tags: string[] | null
    isConfidential: boolean
    versionCount: number
}

export type WorkbenchModuleSummary = {
    name: string
    url: string
} | null

function buildWorkbenchHref(baseUrl: string, documentId: string): string {
    try {
        const url = new URL(baseUrl)
        url.searchParams.set("documentId", documentId)
        url.searchParams.set("source", "lawclick")
        return url.toString()
    } catch {
        return baseUrl
    }
}

export function DocumentWorkbenchWorkspaceClient(props: { document: WorkbenchDocumentSummary; module: WorkbenchModuleSummary }) {
    const { document, module } = props

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_header",
            title: "工作台与导航",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 4, minW: 8, minH: 3 },
            content: (
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <Button asChild variant="ghost" size="sm" className="gap-2">
                            <Link href={`/documents/${document.id}`}>
                                <ArrowLeft className="h-4 w-4" />
                                返回文档详情
                            </Link>
                        </Button>
                        <div className="min-w-0">
                            <div className="text-xs text-muted-foreground">在线编辑工作台</div>
                            <div className="text-lg font-semibold truncate">{document.title}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="gap-1">
                            <Puzzle className="h-3 w-3" />
                            占位（外部项目）
                        </Badge>
                        {module?.url ? (
                            <Button asChild size="sm" className="gap-2">
                                <a href={buildWorkbenchHref(module.url, document.id)} target="_blank" rel="noreferrer">
                                    <ExternalLink className="h-4 w-4" />
                                    打开外部工作台
                                </a>
                            </Button>
                        ) : null}
                    </div>
                </div>
            ),
        },
        {
            id: "b_status",
            title: "接入状态",
            defaultSize: { w: 6, h: 10, minW: 6, minH: 8 },
            chrome: "none",
            content: (
                <Card className="h-full">
                    <CardHeader>
                        <CardTitle>接入状态</CardTitle>
                        <CardDescription>该能力由“实时在线编辑工作台”独立项目提供；本页仅作为占位与集成入口。</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        {module?.url ? (
                            <div className="rounded-md border bg-muted/20 p-3 space-y-1">
                                <div className="font-medium">已配置入口</div>
                                <div className="text-xs text-muted-foreground break-all">
                                    模块：{module.name} · 链接：{module.url}
                                </div>
                                <div className="text-xs text-muted-foreground">已为外部 URL 自动附加 `documentId` 参数，外部项目可选择性使用。</div>
                            </div>
                        ) : (
                            <div className="rounded-md border bg-muted/20 p-3 space-y-1">
                                <div className="font-medium">未配置入口</div>
                                <div className="text-xs text-muted-foreground">
                                    请由管理员在 <Link className="text-primary hover:underline" href="/tools">工具箱</Link> 创建一个工具模块：
                                    <span className="ml-2 inline-flex flex-wrap gap-2">
                                        <code className="px-1 py-0.5 rounded bg-muted">category=workbench（工作台分类）</code>
                                        <code className="px-1 py-0.5 rounded bg-muted">url=https://…</code>
                                    </span>
                                </div>
                            </div>
                        )}

                        <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                            <div className="font-medium flex items-center gap-2">
                                <Wrench className="h-4 w-4" />
                                预留集成点
                            </div>
                            <div className="text-xs text-muted-foreground">
                                外部工作台应在其侧完成：鉴权（SSO/Token）、文档读取/保存、协同（Yjs/OT）、版本与审计落库等。本项目仅保留入口与上下文参数。
                            </div>
                            <div className="text-xs text-muted-foreground">
                                推荐最小上下文：
                                <code className="ml-2 px-1 py-0.5 rounded bg-muted">documentId</code>
                                <code className="ml-2 px-1 py-0.5 rounded bg-muted">source=lawclick（本系统）</code>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ),
        },
        {
            id: "b_doc_case",
            title: "案件",
            pinned: true,
            defaultSize: { w: 12, h: 4, minW: 6, minH: 3 },
            content: document.case ? (
                <div className="p-4 text-sm">
                    <Link className="font-medium hover:underline" href={`/cases/${document.case.id}`}>
                        {document.case.caseCode} · {document.case.title}
                    </Link>
                </div>
            ) : (
                <div className="p-4 text-sm text-muted-foreground">-</div>
            ),
        },
        {
            id: "b_doc_category",
            title: "分类",
            pinned: true,
            defaultSize: { w: 4, h: 3, minW: 3, minH: 3 },
            content: <div className="p-4 text-sm">{document.category || "-"}</div>,
        },
        {
            id: "b_doc_versions",
            title: "版本数",
            pinned: true,
            defaultSize: { w: 4, h: 3, minW: 3, minH: 3 },
            content: <div className="p-4 text-sm">{document.versionCount}</div>,
        },
        {
            id: "b_doc_confidential",
            title: "保密",
            pinned: true,
            defaultSize: { w: 4, h: 3, minW: 3, minH: 3 },
            content: <div className="p-4 text-sm">{document.isConfidential ? "是" : "否"}</div>,
        },
        {
            id: "b_doc_tags",
            title: "标签",
            pinned: true,
            defaultSize: { w: 12, h: 6, minW: 6, minH: 4 },
            content: (
                <div className="p-4">
                    <div className="flex flex-wrap gap-2">
                        {(document.tags || []).length ? (
                            (document.tags || []).map((t) => (
                                <Badge key={t} variant="secondary">
                                    {t}
                                </Badge>
                            ))
                        ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                        )}
                    </div>
                </div>
            ),
        },
    ]

    return (
        <SectionWorkspace
            title={`在线编辑工作台 · ${document.title}`}
            sectionId="document_workbench"
            entityId={document.id}
            catalog={catalog}
            headerVariant="compact"
            className="h-full"
        />
    )
}
