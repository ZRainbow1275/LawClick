"use client"

import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { LayoutGrid, List, Search } from "lucide-react"

import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { useUiPreferences } from "@/components/layout/UiPreferencesProvider"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { ScrollArea } from "@/components/ui/ScrollArea"
import { cn } from "@/lib/utils"

type IntakeCaseListItem = {
    id: string
    caseCode: string
    title: string
    clientName: string
    status: string
    progress: number
    updatedAt: Date
}

type ViewMode = "split" | "list"

const STATUS_LABELS: Record<string, string> = {
    LEAD: "线索",
    INTAKE: "立案审查",
    ACTIVE: "在办",
    SUSPENDED: "中止",
    CLOSED: "结案",
    ARCHIVED: "归档",
}

function buildNextUrl(input: { pathname: string; searchParams: URLSearchParams }) {
    const qs = input.searchParams.toString()
    return qs ? `${input.pathname}?${qs}` : input.pathname
}

export function IntakeCasesWorkspaceClient(props: {
    initialCases: IntakeCaseListItem[]
    selectedCaseId: string | null
    viewMode: ViewMode
    detailPanel: React.ReactNode
}) {
    const { initialCases, selectedCaseId, viewMode, detailPanel } = props

    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const { persistCasesPatch, casesSaving } = useUiPreferences()

    const basePath = pathname || "/cases/intake"

    const [searchTerm, setSearchTerm] = useState(searchParams.get("q") || "")

    // Debounce search into URL (server-side filtering)
    useEffect(() => {
        const t = setTimeout(() => {
            const params = new URLSearchParams(searchParams.toString())
            const q = searchTerm.trim()
            if (q) params.set("q", q)
            else params.delete("q")

            const nextUrl = buildNextUrl({ pathname: basePath, searchParams: params })
            const currentUrl = buildNextUrl({ pathname: basePath, searchParams: new URLSearchParams(searchParams.toString()) })

            if (nextUrl !== currentUrl) router.replace(nextUrl, { scroll: false })
        }, 300)
        return () => clearTimeout(t)
    }, [searchTerm, searchParams, router, basePath])

    const casesForList = useMemo(() => initialCases, [initialCases])

    const selectCase = React.useCallback(
        (id: string) => {
            if (viewMode !== "split") {
                router.push(`/cases/${id}`)
                return
            }

            const params = new URLSearchParams(searchParams.toString())
            params.set("view", "split")
            params.set("caseId", id)
            router.replace(buildNextUrl({ pathname: basePath, searchParams: params }), { scroll: false })
        },
        [basePath, router, searchParams, viewMode]
    )

    const layoutCatalog: SectionCatalogItem[] = useMemo(() => {
        const items: SectionCatalogItem[] = [
            {
                id: "b_intake_case_list",
                title: "案件列表",
                pinned: true,
                chrome: "none",
                defaultSize:
                    viewMode === "split"
                        ? { w: 4, h: 18, minW: 3, minH: 10 }
                        : { w: 12, h: 18, minW: 6, minH: 10 },
                content: (
                    <Card className="bg-card shadow-sm h-full flex flex-col">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center justify-between">
                                <span>案件列表</span>
                                {selectedCaseId && viewMode === "split" ? (
                                    <Badge variant="outline" className="text-xs">
                                        已选中
                                    </Badge>
                                ) : null}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 flex-1 min-h-0">
                            <ScrollArea className="h-full">
                                <div className="p-3 space-y-2">
                                    {casesForList.length === 0 ? (
                                        <div className="text-sm text-muted-foreground py-8 text-center">
                                            暂无案件
                                        </div>
                                    ) : (
                                        casesForList.map((c) => {
                                            const active = viewMode === "split" && selectedCaseId === c.id
                                            return (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    onClick={() => selectCase(c.id)}
                                                    className={cn(
                                                        "w-full text-left rounded-lg border px-3 py-2 transition-colors",
                                                        active
                                                            ? "border-primary/30 bg-primary/10"
                                                            : "bg-card hover:bg-muted hover:border-border"
                                                    )}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <div className="text-xs text-muted-foreground">
                                                                {c.caseCode}
                                                            </div>
                                                            <div className="text-sm font-medium truncate">
                                                                {c.title}
                                                            </div>
                                                            <div className="text-xs text-muted-foreground truncate mt-0.5">
                                                                客户：{c.clientName}
                                                            </div>
                                                        </div>
                                                        <Badge variant="outline" className="text-[10px] shrink-0">
                                                            {STATUS_LABELS[c.status] || c.status}
                                                        </Badge>
                                                    </div>
                                                    <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                                                        <span>进度 {c.progress}%</span>
                                                        <span>
                                                            {new Date(c.updatedAt).toLocaleString("zh-CN", {
                                                                month: "2-digit",
                                                                day: "2-digit",
                                                            })}
                                                        </span>
                                                    </div>
                                                </button>
                                            )
                                        })
                                    )}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                ),
            },
        ]

        if (viewMode === "split") {
            items.push({
                id: "b_intake_case_preview",
                title: "预览",
                pinned: true,
                chrome: "none",
                defaultSize: { w: 8, h: 18, minW: 5, minH: 10 },
                content: (
                    <div className="h-full min-h-0">
                        {detailPanel && selectedCaseId ? (
                            detailPanel
                        ) : (
                            <div className="h-full rounded-lg border bg-muted/20 flex items-center justify-center text-sm text-muted-foreground">
                                请选择左侧案件以预览
                            </div>
                        )}
                    </div>
                ),
            })
        }

        return items
    }, [casesForList, detailPanel, selectedCaseId, viewMode, selectCase])

    const setViewMode = (mode: ViewMode) => {
        persistCasesPatch({ intakeViewMode: mode })

        const params = new URLSearchParams(searchParams.toString())
        params.set("view", mode)
        if (mode !== "split") params.delete("caseId")

        router.replace(buildNextUrl({ pathname: basePath, searchParams: params }), { scroll: false })
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">立案侦查</h1>
                    <div className="text-sm text-muted-foreground">待立案 / 冲突审查中的案件（支持分屏预览）</div>
                </div>

                <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                        {casesForList.length} 个案件
                    </Badge>
                    <div className="flex rounded-md border bg-card">
                        <Button
                            variant={viewMode === "split" ? "default" : "ghost"}
                            size="sm"
                            className={cn("rounded-none rounded-l-md")}
                            onClick={() => setViewMode("split")}
                            disabled={casesSaving}
                            title="分屏：左侧列表 + 右侧预览（跨设备记忆）"
                        >
                            <LayoutGrid className="h-4 w-4 mr-1" />
                            分屏
                        </Button>
                        <Button
                            variant={viewMode === "list" ? "default" : "ghost"}
                            size="sm"
                            className={cn("rounded-none rounded-r-md")}
                            onClick={() => setViewMode("list")}
                            disabled={casesSaving}
                            title="列表：点击进入完整案件详情页"
                        >
                            <List className="h-4 w-4 mr-1" />
                            列表
                        </Button>
                    </div>
                </div>
            </div>

            <div className="relative max-w-md">
                <Search className="h-4 w-4 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
                <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="搜索案件标题 / 编号 / 客户..."
                    className="pl-8"
                />
            </div>

            <SectionWorkspace
                title="列表/预览（可拖拽）"
                sectionId="cases_intake_layout"
                catalog={layoutCatalog}
                rowHeight={32}
                margin={[12, 12]}
                headerVariant="compact"
            />
        </div>
    )
}
