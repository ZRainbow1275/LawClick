"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
    ArrowLeft,
    Clock,
    Download,
    Loader2,
    MessageCircle,
    MoreHorizontal,
    Scale,
    User,
} from "lucide-react"
import { toast } from "sonner"
import { CaseDetailTabsPanel } from "@/components/cases/CaseDetailTabsPanel"
import { CaseStageTimeline } from "@/components/cases/CaseStageTimeline"
import { CaseTeamCard } from "@/components/cases/CaseTeamCard"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Progress } from "@/components/ui/Progress"
import { Separator } from "@/components/ui/Separator"
import { getCaseStageProgress, getStageDocuments, initializeStageDocuments, initializeStageTasks, type StageProgressInfo } from "@/actions/stage-management"
import { getCaseTimeSummary, type TimeLogSummary } from "@/actions/timelogs-crud"
import { useFloatStore } from "@/store/float-store"
import type { CaseDetailViewModel, CaseDocument, CaseEvent, CaseUser } from "@/components/cases/case-detail-types"

interface CaseDetailProps {
    caseItem: CaseDetailViewModel
    currentUser?: CaseUser | null
}

export function CaseDetailClient({ caseItem, currentUser }: CaseDetailProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const { openWindow } = useFloatStore()

    const [activeTab, setActiveTab] = useState("overview")
    const [documents, setDocuments] = useState<CaseDocument[]>(caseItem.documents)
    const [events, setEvents] = useState<CaseEvent[]>(caseItem.events)

    const [stageProgress, setStageProgress] = useState<StageProgressInfo | null>(null)
    const [loadingStage, setLoadingStage] = useState(true)
    const [timeSummary, setTimeSummary] = useState<TimeLogSummary | null>(null)
    const [timeSummaryError, setTimeSummaryError] = useState<string | null>(null)
    const [timeSummaryRefreshing, setTimeSummaryRefreshing] = useState(false)
    const [initializingDocs, setInitializingDocs] = useState(false)

    const tabParam = searchParams.get("tab")

    useEffect(() => {
        setDocuments(caseItem.documents)
        setEvents(caseItem.events)
    }, [caseItem.id, caseItem.documents, caseItem.events])

    const buildTabHref = useCallback(
        (tab: string) => {
            const params = new URLSearchParams(searchParams.toString())
            params.set("tab", tab)
            const qs = params.toString()
            return qs ? `${pathname}?${qs}` : pathname
        },
        [pathname, searchParams]
    )

    const handleTabChange = useCallback(
        (tab: string) => {
            setActiveTab(tab)
            router.replace(buildTabHref(tab), { scroll: false })
        },
        [buildTabHref, router]
    )

    useEffect(() => {
        if (!tabParam) return
        const allowedTabs = new Set([
            "overview",
            "parties",
            "tasks",
            "documents",
            "timelog",
            "events",
            "timeline",
            "billing",
            "settings",
        ])
        if (allowedTabs.has(tabParam)) setActiveTab(tabParam)
    }, [tabParam])

    const loadStageProgress = useCallback(async () => {
        setLoadingStage(true)
        const progress = await getCaseStageProgress(caseItem.id)
        setStageProgress(progress)
        setLoadingStage(false)
    }, [caseItem.id])

    const loadTimeSummary = useCallback(async () => {
        setTimeSummaryRefreshing(true)
        try {
            const res = await getCaseTimeSummary(caseItem.id)
            setTimeSummary(res.data)
            setTimeSummaryError(res.success ? null : res.error || "获取工时汇总失败")
        } catch {
            setTimeSummary(null)
            setTimeSummaryError("获取工时汇总失败")
        } finally {
            setTimeSummaryRefreshing(false)
        }
    }, [caseItem.id])

    const loadCaseDocuments = useCallback(async () => {
        const res = await getStageDocuments(caseItem.id)
        if (!res.success) {
            toast.error("加载案件文书失败", { description: res.error })
            return
        }
        setDocuments(res.data)
    }, [caseItem.id])

    useEffect(() => {
        const supportedTypes = ["LITIGATION", "ARBITRATION", "NON_LITIGATION"]
        if (supportedTypes.includes(caseItem.serviceType)) {
            void loadStageProgress()
            return
        }
        setLoadingStage(false)
    }, [caseItem.serviceType, loadStageProgress])

    useEffect(() => {
        if (!["overview", "timelog", "billing"].includes(activeTab)) return
        void loadTimeSummary()
    }, [activeTab, loadTimeSummary])

    useEffect(() => {
        if (activeTab !== "documents") return
        void loadCaseDocuments()
    }, [activeTab, loadCaseDocuments])

    const handleInitializeDocs = useCallback(async () => {
        setInitializingDocs(true)
        try {
            const resDocs = await initializeStageDocuments(caseItem.id)
            if (!resDocs.success) {
                toast.error("初始化失败", { description: resDocs.error || "阶段文书初始化失败" })
                return
            }

            const resTasks = await initializeStageTasks(caseItem.id)
            if (!resTasks.success) {
                toast.error("初始化失败", { description: resTasks.error || "阶段任务初始化失败" })
                return
            }

            toast.success("已初始化阶段模板")
            router.refresh()
            await loadStageProgress()
        } catch {
            toast.error("初始化失败")
        } finally {
            setInitializingDocs(false)
        }
    }, [caseItem.id, loadStageProgress, router])

    const handleStageAdvanced = useCallback(async () => {
        await loadStageProgress()
        router.refresh()
    }, [loadStageProgress, router])

    const sidebarCatalog: SectionCatalogItem[] = useMemo(() => {
        const items: SectionCatalogItem[] = [
            {
                id: "b_case_team",
                title: "团队成员",
                pinned: true,
                chrome: "none",
                defaultSize: { w: 12, h: 12, minW: 6, minH: 8 },
                content: (
                    <CaseTeamCard
                        caseId={caseItem.id}
                        owner={caseItem.owner}
                        members={caseItem.members}
                        currentUserId={currentUser?.id}
                    />
                ),
            },
            {
                id: "b_case_customer",
                title: "客户信息",
                chrome: "none",
                defaultSize: { w: 12, h: 9, minW: 6, minH: 6 },
                content: (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">客户信息</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center">
                                    <User className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div>
                                    <div className="font-medium">{caseItem.clientName}</div>
                                    <div className="text-xs text-muted-foreground">ID: {caseItem.id.slice(0, 8)}</div>
                                </div>
                            </div>
                            <Separator />
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">联系电话</span>
                                    <span className={caseItem.client?.phone ? "text-info" : "text-muted-foreground"}>
                                        {caseItem.client?.phone || "未填写"}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">邮箱</span>
                                    <span className={caseItem.client?.email ? "text-foreground" : "text-muted-foreground"}>
                                        {caseItem.client?.email || "未填写"}
                                    </span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ),
            },
        ]

        const supportsStages = ["LITIGATION", "ARBITRATION", "NON_LITIGATION"].includes(caseItem.serviceType)
        if (supportsStages) {
            items.push({
                id: "b_case_stage",
                title: "案件阶段",
                chrome: "none",
                defaultSize: { w: 12, h: 16, minW: 6, minH: 10 },
                content: loadingStage ? (
                    <Card>
                        <CardContent className="p-6 flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </CardContent>
                    </Card>
                ) : stageProgress ? (
                    <CaseStageTimeline caseId={caseItem.id} stageProgress={stageProgress} onStageAdvanced={handleStageAdvanced} />
                ) : (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Scale className="h-4 w-4 text-primary" />
                                案件阶段管理
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground mb-4">初始化阶段文书和任务模板</p>
                            <Button onClick={handleInitializeDocs} disabled={initializingDocs} className="w-full">
                                {initializingDocs ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        初始化中...
                                    </>
                                ) : (
                                    "初始化阶段模板"
                                )}
                            </Button>
                        </CardContent>
                    </Card>
                ),
            })
        }

        return items
    }, [
        caseItem.client?.email,
        caseItem.client?.phone,
        caseItem.clientName,
        caseItem.id,
        caseItem.members,
        caseItem.owner,
        caseItem.serviceType,
        currentUser?.id,
        handleInitializeDocs,
        handleStageAdvanced,
        initializingDocs,
        loadingStage,
        stageProgress,
    ])

    const sidebarContentById = useMemo(() => new Map(sidebarCatalog.map((item) => [item.id, item.content])), [sidebarCatalog])

    if (!caseItem) {
        return <div className="p-8 text-center">案件不存在</div>
    }

    const copyCaseLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href)
            toast.success("已复制案件链接")
        } catch {
            toast.error("复制失败", { description: "请检查浏览器权限或手动复制地址栏链接" })
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link href="/cases" className="hover:text-foreground flex items-center gap-1">
                    <ArrowLeft className="h-4 w-4" /> 返回案件列表
                </Link>
                <span>/</span>
                <span className="text-foreground font-medium">{caseItem.caseNumber}</span>
            </div>

            <Card className="border-none bg-card shadow-sm">
                <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row justify-between gap-6">
                        <div className="flex-1 space-y-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h1 className="text-2xl font-bold text-foreground">{caseItem.title}</h1>
                                    <div className="flex items-center gap-3 mt-2">
                                        <Badge variant="outline" className="text-muted-foreground">
                                            {caseItem.caseType}
                                        </Badge>
                                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                            <User className="h-4 w-4" />
                                            {caseItem.clientName}
                                        </div>
                                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                            <Clock className="h-4 w-4" />
                                            更新于 {new Date(caseItem.updatedAt).toLocaleDateString("zh-CN")}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() =>
                                            openWindow(
                                                `chat-case-${caseItem.id}`,
                                                "CHAT",
                                                `案件群聊 · ${caseItem.caseNumber || caseItem.caseCode || ""}`,
                                                { caseId: caseItem.id, scope: "CASE" }
                                            )
                                        }
                                    >
                                        <MessageCircle className="h-4 w-4 mr-2" /> 聊天
                                    </Button>
                                    <Button variant="outline" onClick={() => handleTabChange("settings")}>
                                        编辑
                                    </Button>
                                    <Button variant="outline" size="icon" aria-label="更多操作" title="更多操作" onClick={() => void copyCaseLink()}>
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        onClick={() => window.print()}
                                        variant="outline"
                                        size="icon"
                                        aria-label="打印"
                                        title="打印"
                                    >
                                        <Download className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="flex-1 max-w-md">
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-muted-foreground">案件进度</span>
                                        <span className="font-medium">{caseItem.progress}%</span>
                                    </div>
                                    <Progress value={caseItem.progress} className="h-2" />
                                </div>
                                <div className="h-8 w-[1px] bg-border"></div>
                                <div>
                                    <div className="text-sm text-muted-foreground">标的额</div>
                                    <div className="font-bold text-foreground">¥ {Number(caseItem.contractValue).toLocaleString()}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <SectionWorkspace
                title="案件工作台（可拖拽/可记忆/可恢复）"
                sectionId="case_detail_layout"
                entityId={caseItem.id}
                headerVariant="compact"
                catalog={[
                    {
                        id: "b_case_main_panel",
                        title: "案件详情",
                        pinned: true,
                        chrome: "none",
                        defaultSize: { w: 8, h: 28, minW: 6, minH: 18 },
                        content: (
                            <CaseDetailTabsPanel
                                caseItem={caseItem}
                                currentUser={currentUser}
                                activeTab={activeTab}
                                onTabChange={handleTabChange}
                                sidebarContentById={sidebarContentById}
                                stageProgress={stageProgress}
                                documents={documents}
                                events={events}
                                setEvents={setEvents}
                                timeSummary={timeSummary}
                                timeSummaryError={timeSummaryError}
                                timeSummaryRefreshing={timeSummaryRefreshing}
                                onRefreshTimeSummary={() => void loadTimeSummary()}
                                loadCaseDocuments={loadCaseDocuments}
                                loadStageProgress={loadStageProgress}
                            />
                        ),
                    },
                    {
                        id: "b_case_sidebar_panel",
                        title: "侧边栏",
                        pinned: true,
                        chrome: "none",
                        defaultSize: { w: 4, h: 28, minW: 4, minH: 18 },
                        content: (
                            <SectionWorkspace
                                sectionId="case_sidebar"
                                entityId={caseItem.id}
                                headerVariant="compact"
                                catalog={sidebarCatalog}
                                className="h-full"
                            />
                        ),
                    },
                ]}
                className="h-full"
            />
        </div>
    )
}
