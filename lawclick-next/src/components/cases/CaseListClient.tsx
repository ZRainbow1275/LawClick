"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
    Briefcase,
    Calendar,
    Clock,
    Eye,
    FileText,
    Kanban,
    LayoutGrid,
    List,
    MoreHorizontal,
    Plus,
    Search,
    Users,
} from "lucide-react"

import { LegoDeck } from "@/components/layout/LegoDeck"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Progress } from "@/components/ui/Progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { getCaseStatusMeta } from "@/lib/cases/case-status-meta"
import { CreateCaseWizard } from "./CreateCaseWizard"

interface CaseListItem {
    id: string
    caseCode: string
    title: string
    clientName: string
    status: string
    caseType: string
    progress: number
    contractValue: number | string
    updatedAt: Date
}

export type CaseListClientProps = {
    initialCases: CaseListItem[]
    title?: string
    description?: string
}

export function CaseListClient({ initialCases, title, description }: CaseListClientProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const pathname = usePathname()
    const basePath = pathname || "/cases"

    const [searchTerm, setSearchTerm] = useState(searchParams.get("q") || "")
    const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all")
    const [typeFilter, setTypeFilter] = useState(searchParams.get("type") || "all")
    const [showWizard, setShowWizard] = useState(false)
    const [viewMode, setViewMode] = useState<"grid" | "kanban" | "list">("grid")

    useEffect(() => {
        const timer = setTimeout(() => {
            const params = new URLSearchParams()
            if (searchTerm) params.set("q", searchTerm)
            if (statusFilter && statusFilter !== "all") params.set("status", statusFilter)
            if (typeFilter && typeFilter !== "all") params.set("type", typeFilter)

            const nextQuery = params.toString()
            const currentQuery = searchParams.toString()
            const nextUrl = nextQuery ? `${basePath}?${nextQuery}` : basePath
            const currentUrl = currentQuery ? `${basePath}?${currentQuery}` : basePath

            if (nextUrl !== currentUrl) {
                router.push(nextUrl)
            }
        }, 300)

        return () => clearTimeout(timer)
    }, [searchTerm, statusFilter, typeFilter, router, searchParams, basePath])

    const getStatusMeta = (status: string) => getCaseStatusMeta(status)

    const stats = useMemo(() => {
        const total = initialCases.length
        const active = initialCases.filter((c) => c.status === "ACTIVE").length
        const pending = initialCases.filter((c) => c.status === "LEAD" || c.status === "INTAKE").length
        const closed = initialCases.filter((c) => c.status === "CLOSED" || c.status === "ARCHIVED").length
        return { total, active, pending, closed }
    }, [initialCases])

    const statsDeck = [
        {
            id: "b_cases_stat_total",
            title: "总案件数",
            chrome: "none",
            defaultSize: { w: 3, h: 5, minW: 3, minH: 4 },
            content: (
                <Card className="h-full">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">总案件数</CardTitle>
                        <FileText className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.total}</div>
                    </CardContent>
                </Card>
            ),
        },
        {
            id: "b_cases_stat_active",
            title: "进行中",
            chrome: "none",
            defaultSize: { w: 3, h: 5, minW: 3, minH: 4 },
            content: (
                <Card className="h-full">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">进行中</CardTitle>
                        <Clock className="h-4 w-4 text-info" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">{stats.active}</div>
                    </CardContent>
                </Card>
            ),
        },
        {
            id: "b_cases_stat_pending",
            title: "待处理",
            chrome: "none",
            defaultSize: { w: 3, h: 5, minW: 3, minH: 4 },
            content: (
                <Card className="h-full">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">待处理</CardTitle>
                        <Calendar className="h-4 w-4 text-warning" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-warning-foreground">{stats.pending}</div>
                    </CardContent>
                </Card>
            ),
        },
        {
            id: "b_cases_stat_closed",
            title: "已结案/归档",
            chrome: "none",
            defaultSize: { w: 3, h: 5, minW: 3, minH: 4 },
            content: (
                <Card className="h-full">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">已结案/归档</CardTitle>
                        <Users className="h-4 w-4 text-success" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-foreground">{stats.closed}</div>
                    </CardContent>
                </Card>
            ),
        },
    ] satisfies SectionCatalogItem[]

    const caseGridCardsDeck = useMemo(
        () =>
            initialCases.map((caseItem) => {
                const statusMeta = getCaseStatusMeta(caseItem.status)

                return {
                    id: `case_${caseItem.id}`,
                    title: caseItem.caseCode || caseItem.title,
                    pinned: true,
                    chrome: "none",
                    defaultSize: { w: 4, h: 13, minW: 3, minH: 9 },
                    content: (
                        <Card className="h-full hover:shadow-lg transition-shadow">
                            <CardHeader>
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1 min-w-0">
                                        <CardTitle className="text-lg line-clamp-1">
                                            {caseItem.title}
                                        </CardTitle>
                                        <CardDescription className="flex items-center gap-2">
                                            <span className="font-mono text-xs">
                                                {caseItem.caseCode}
                                            </span>
                                            <span>·</span>
                                            <span className="truncate">{caseItem.clientName}</span>
                                        </CardDescription>
                                    </div>
                                    <Badge variant={statusMeta.badgeVariant}>{statusMeta.label}</Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">进度</span>
                                        <span className="font-medium">{caseItem.progress}%</span>
                                    </div>
                                    <Progress value={caseItem.progress} className="h-2" />
                                </div>

                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">合同金额</span>
                                    <span className="font-medium">
                                        ¥{Number(caseItem.contractValue).toLocaleString()}
                                    </span>
                                </div>

                                <div className="flex gap-2 pt-2">
                                    <Button variant="outline" size="sm" className="flex-1" asChild>
                                        <Link href={`/cases/${caseItem.id}`}>
                                            <Eye className="mr-2 h-4 w-4" /> 查看
                                        </Link>
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        aria-label="更多操作"
                                        title="更多操作"
                                    >
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ),
                } satisfies SectionCatalogItem
            }),
        [initialCases]
    )

    const caseKanbanColumnsDeck = useMemo(() => {
        const statuses = ["LEAD", "INTAKE", "ACTIVE", "SUSPENDED", "CLOSED", "ARCHIVED"] as const

        return statuses.map((status) => {
            const statusCases = initialCases.filter((c) => c.status === status)
            const statusMeta = getCaseStatusMeta(status)

            return {
                id: `case_kanban_${status}`,
                title: statusMeta.label,
                pinned: true,
                chrome: "none",
                defaultSize: { w: 2, h: 18, minW: 2, minH: 12 },
                content: (
                    <div className="rounded-lg border bg-muted/30 p-3 h-full flex flex-col min-h-[420px]">
                        <div className="flex items-center justify-between">
                            <h3 className="font-medium text-sm">{statusMeta.label}</h3>
                            <Badge variant="secondary">{statusCases.length}</Badge>
                        </div>
                        <div className="mt-3 space-y-2 min-h-0 overflow-auto pr-1">
                            {statusCases.map((c) => (
                                <Link key={c.id} href={`/cases/${c.id}`}>
                                    <Card className="cursor-pointer hover:shadow-sm transition-shadow">
                                        <CardContent className="p-3">
                                            <div className="font-medium text-sm truncate">
                                                {c.title}
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                {c.caseCode}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {c.clientName}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    </div>
                ),
            } satisfies SectionCatalogItem
        })
    }, [initialCases])

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_cases_header",
            title: "操作栏",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 5, minW: 8, minH: 4 },
            content: (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="text-xl font-semibold tracking-tight truncate">{title || "案件管理"}</h1>
                        <div className="text-sm text-muted-foreground">
                            {description || "管理和跟踪所有法律案件"}
                        </div>
                        <div className="text-xs text-muted-foreground">支持列表 / 看板 / 网格视图切换；布局可拖拽记忆</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button className="bg-primary hover:bg-primary/90" onClick={() => setShowWizard(true)}>
                            <Plus className="mr-2 h-4 w-4" /> 新建案件
                        </Button>
                    </div>
                </div>
            ),
        },
        {
            id: "b_cases_stats",
            title: "概览",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 7, minW: 8, minH: 6 },
            content: (
                <LegoDeck
                    title="概览卡片（可拖拽）"
                    sectionId="cases_list_stats_cards"
                    rowHeight={28}
                    margin={[12, 12]}
                    catalog={statsDeck}
                />
            ),
        },
        {
            id: "b_cases_filters",
            title: "筛选",
            pinned: true,
            defaultSize: { w: 12, h: 7, minW: 8, minH: 6 },
            content: (
                <div className="space-y-4">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="搜索案件标题、编号或客户..."
                                className="pl-10"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[180px]" aria-label="按状态筛选">
                                <SelectValue placeholder="状态" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部状态</SelectItem>
                                <SelectItem value="LEAD">线索</SelectItem>
                                <SelectItem value="INTAKE">立案中</SelectItem>
                                <SelectItem value="ACTIVE">在办</SelectItem>
                                <SelectItem value="SUSPENDED">中止</SelectItem>
                                <SelectItem value="CLOSED">结案</SelectItem>
                                <SelectItem value="ARCHIVED">归档</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger className="w-[180px]" aria-label="按类型筛选">
                                <SelectValue placeholder="类型" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部类型</SelectItem>
                                <SelectItem value="LITIGATION">诉讼</SelectItem>
                                <SelectItem value="NON_LITIGATION">非诉</SelectItem>
                                <SelectItem value="ARBITRATION">仲裁</SelectItem>
                                <SelectItem value="ADVISORY">顾问</SelectItem>
                            </SelectContent>
                        </Select>
                        <div className="flex gap-1 border rounded-md p-1">
                            <Button
                                variant={viewMode === "grid" ? "secondary" : "ghost"}
                                size="sm"
                                onClick={() => setViewMode("grid")}
                                aria-label="网格视图"
                                aria-pressed={viewMode === "grid"}
                                title="网格视图"
                            >
                                <LayoutGrid className="h-4 w-4" />
                            </Button>
                            <Button
                                variant={viewMode === "kanban" ? "secondary" : "ghost"}
                                size="sm"
                                onClick={() => setViewMode("kanban")}
                                aria-label="看板视图"
                                aria-pressed={viewMode === "kanban"}
                                title="看板视图"
                            >
                                <Kanban className="h-4 w-4" />
                            </Button>
                            <Button
                                variant={viewMode === "list" ? "secondary" : "ghost"}
                                size="sm"
                                onClick={() => setViewMode("list")}
                                aria-label="列表视图"
                                aria-pressed={viewMode === "list"}
                                title="列表视图"
                            >
                                <List className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            ),
        },
        {
            id: "b_cases_content",
            title: "内容",
            pinned: true,
            defaultSize: { w: 12, h: 18, minW: 8, minH: 12 },
            content: (
                <div className="space-y-4">
                    {viewMode === "grid" && (
                        <LegoDeck
                            title="案件卡片（可拖拽）"
                            sectionId="cases_list_grid_cards"
                            rowHeight={28}
                            margin={[12, 12]}
                            catalog={caseGridCardsDeck}
                        />
                    )}

                    {viewMode === "kanban" && (
                        <LegoDeck
                            title="案件状态看板（可拖拽列）"
                            sectionId="cases_list_kanban_columns"
                            rowHeight={24}
                            margin={[12, 12]}
                            catalog={caseKanbanColumnsDeck}
                        />
                    )}

                    {viewMode === "list" && (
                        <div className="border rounded-lg divide-y">
                            {initialCases.map((caseItem) => (
                                <Link key={caseItem.id} href={`/cases/${caseItem.id}`}>
                                    <div className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div>
                                                <div className="font-medium">{caseItem.title}</div>
                                                <div className="text-sm text-muted-foreground">
                                                    {caseItem.caseCode} · {caseItem.clientName}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <Badge variant={getStatusMeta(caseItem.status).badgeVariant}>
                                                {getStatusMeta(caseItem.status).label}
                                            </Badge>
                                            <div className="text-sm w-16">{caseItem.progress}%</div>
                                            <div className="text-sm text-muted-foreground w-32">
                                                ¥{Number(caseItem.contractValue).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}

                    {initialCases.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
                                <Briefcase className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium text-foreground">暂无案件</h3>
                            <p className="text-muted-foreground mt-1">没有找到匹配的案件，请尝试调整筛选条件。</p>
                        </div>
                    ) : null}
                </div>
            ),
        },
    ]

    return (
        <>
            <CreateCaseWizard
                open={showWizard}
                onOpenChange={setShowWizard}
            />

            <SectionWorkspace title={title || "案件管理"} catalog={catalog} className="h-full" />
        </>
    )
}
