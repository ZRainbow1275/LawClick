"use client"

import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
    Briefcase,
    Calendar,
    CheckSquare,
    Clock,
    CreditCard,
    Download,
    FileText,
    History,
    Loader2,
    Plus,
    Settings,
    Users,
} from "lucide-react"
import { toast } from "sonner"
import type { StageProgressInfo } from "@/actions/stage-management"
import type { TimeLogSummary } from "@/actions/timelogs-crud"
import { createEvent } from "@/actions/event-actions"
import { CaseBillingTab } from "@/components/cases/CaseBillingTab"
import { CasePartiesTab } from "@/components/cases/CasePartiesTab"
import { CaseTaskKanban } from "@/components/cases/CaseTaskKanban"
import { CaseTimeLogsTab } from "@/components/cases/CaseTimeLogsTab"
import { CaseTimelineTab } from "@/components/cases/CaseTimelineTab"
import { NewDraftDialog } from "@/components/cases/NewDraftDialog"
import { StageDocumentChecklist } from "@/components/cases/StageDocumentChecklist"
import { SimilarCasesBlock } from "@/components/cases/SimilarCasesBlock"
import { CaseSettingsTab } from "@/components/cases/CaseSettingsTab"
import { SectionWorkspace } from "@/components/layout/SectionWorkspace"
import { TimerWidget } from "@/components/timelog/TimerWidget"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { Textarea } from "@/components/ui/Textarea"
import type { CaseDetailViewModel, CaseDocument, CaseEvent, CaseUser } from "@/components/cases/case-detail-types"
import { uploadDocumentWithPresignedUrl } from "@/lib/document-upload-client"

type CaseTabsPanelProps = {
    caseItem: CaseDetailViewModel
    currentUser?: CaseUser | null
    activeTab: string
    onTabChange: (tabId: string) => void
    sidebarContentById: Map<string, ReactNode>
    stageProgress: StageProgressInfo | null
    documents: CaseDocument[]
    events: CaseEvent[]
    setEvents: Dispatch<SetStateAction<CaseEvent[]>>
    timeSummary: TimeLogSummary | null
    timeSummaryError: string | null
    timeSummaryRefreshing: boolean
    onRefreshTimeSummary: () => void
    loadCaseDocuments: () => Promise<void>
    loadStageProgress: () => Promise<void>
}

function formatFileTypeLabel(fileType: string | null) {
    if (!fileType) return "UNKNOWN"
    const normalized = fileType.includes("/") ? fileType.split("/").pop() || fileType : fileType
    return normalized.toUpperCase()
}

function toDateTimeLocalValue(date: Date) {
    const pad = (n: number) => n.toString().padStart(2, "0")
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function CaseDetailTabsPanel(props: CaseTabsPanelProps) {
    const {
        caseItem,
        currentUser,
        activeTab,
        onTabChange,
        sidebarContentById,
        stageProgress,
        documents,
        events,
        setEvents,
        timeSummary,
        timeSummaryError,
        timeSummaryRefreshing,
        onRefreshTimeSummary,
        loadCaseDocuments,
        loadStageProgress,
    } = props

    const router = useRouter()
    const [uploadOpen, setUploadOpen] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [eventOpen, setEventOpen] = useState(false)
    const [eventSubmitting, setEventSubmitting] = useState(false)

    const handleCreateEvent = async (formData: FormData) => {
        setEventSubmitting(true)
        try {
            const title = typeof formData.get("title") === "string" ? String(formData.get("title")) : ""
            const startTime = typeof formData.get("startTime") === "string" ? String(formData.get("startTime")) : ""
            const endTime = typeof formData.get("endTime") === "string" ? String(formData.get("endTime")) : ""
            const location = typeof formData.get("location") === "string" ? String(formData.get("location")) : ""
            const description = typeof formData.get("description") === "string" ? String(formData.get("description")) : ""
            const participantIds = formData
                .getAll("participantIds")
                .filter((v): v is string => typeof v === "string" && v.trim().length > 0)

            const res = await createEvent({
                title,
                startTime,
                endTime,
                caseId: caseItem.id,
                location: location.trim() ? location : undefined,
                description: description.trim() ? description : undefined,
                participantIds,
            })
            if (!res.success) {
                toast.error("创建日程失败", { description: res.error })
                return
            }
            toast.success("已创建日程")
            setEvents((prev) => {
                const merged: CaseEvent[] = [
                    ...prev,
                    { id: res.data.id, title: res.data.title, startTime: res.data.startTime, endTime: res.data.endTime },
                ]
                const byId = new Map<string, CaseEvent>()
                for (const item of merged) byId.set(item.id, item)
                return Array.from(byId.values()).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
            })
            setEventOpen(false)
            router.refresh()
        } catch {
            toast.error("创建日程失败")
        } finally {
            setEventSubmitting(false)
        }
    }

    const handleCaseDocUpload = async (formData: FormData) => {
        setUploading(true)
        try {
            const fileValue = formData.get("file")
            const file = fileValue instanceof File ? fileValue : null
            if (!file) {
                toast.error("上传失败", { description: "缺少文件" })
                return
            }

            const res = await uploadDocumentWithPresignedUrl({
                file,
                caseId: typeof formData.get("caseId") === "string" ? String(formData.get("caseId")) : null,
                title: typeof formData.get("title") === "string" ? String(formData.get("title")) : null,
                category: typeof formData.get("category") === "string" ? String(formData.get("category")) : null,
                notes: typeof formData.get("notes") === "string" ? String(formData.get("notes")) : null,
            })
            if (!res.success) {
                toast.error("上传失败", { description: res.error })
                return
            }

            if (res.usedFallback) toast.info("直传失败，已使用服务器中转上传")
            toast.success("上传成功")
            setUploadOpen(false)
            await loadCaseDocuments()
            router.refresh()
        } catch {
            toast.error("上传失败")
        } finally {
            setUploading(false)
        }
    }

    const handleDocDownload = (doc: CaseDocument) => {
        if (!doc?.fileUrl) {
            toast.error("该文档尚未上传文件")
            return
        }
        window.open(`/api/documents/${doc.id}/file?download=1`, "_blank", "noopener,noreferrer")
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-1 border-b" role="tablist" aria-label="案件详情标签页">
                {[
                    { id: "overview", label: "概览", icon: Briefcase },
                    { id: "parties", label: "当事人", icon: Users },
                    { id: "tasks", label: "任务", icon: CheckSquare },
                    { id: "documents", label: "文档", icon: FileText },
                    { id: "timelog", label: "工时", icon: Clock },
                    { id: "events", label: "日程", icon: Calendar },
                    { id: "timeline", label: "时间线", icon: History },
                    { id: "billing", label: "账务", icon: CreditCard },
                    { id: "settings", label: "设置", icon: Settings },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === tab.id
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                        onClick={() => onTabChange(tab.id)}
                    >
                        <tab.icon className="h-4 w-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="min-h-[400px]">
                {activeTab === "overview" ? (
                    <SectionWorkspace
                        sectionId="case_tab_overview"
                        entityId={caseItem.id}
                        headerVariant="compact"
                        catalog={[
                            {
                                id: "b_overview",
                                title: "概览",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 12, h: 10, minW: 6, minH: 6 },
                                content: (
                                    <div className="space-y-6">
                                        <Card>
                                            <CardHeader>
                                                <CardTitle className="text-base">案件描述</CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <p className="text-muted-foreground leading-relaxed">
                                                    {caseItem.description || "暂无描述"}
                                                </p>
                                            </CardContent>
                                        </Card>

                                        <SectionWorkspace
                                            sectionId="case_overview_cards"
                                            entityId={caseItem.id}
                                            headerVariant="compact"
                                            rowHeight={22}
                                            margin={[12, 12]}
                                            catalog={[
                                                {
                                                    id: "c_tasks_total",
                                                    title: "关联任务",
                                                    pinned: true,
                                                    chrome: "none",
                                                    defaultSize: { w: 6, h: 5, minW: 4, minH: 4 },
                                                    content: (
                                                        <Card>
                                                            <CardContent className="p-4 flex items-center gap-4">
                                                                <div className="h-10 w-10 rounded-lg bg-info/10 flex items-center justify-center text-info">
                                                                    <CheckSquare className="h-5 w-5" />
                                                                </div>
                                                                <div>
                                                                    <div className="text-2xl font-bold">{caseItem.tasksTotal}</div>
                                                                    <div className="text-xs text-muted-foreground">关联任务</div>
                                                                </div>
                                                            </CardContent>
                                                        </Card>
                                                    ),
                                                },
                                                {
                                                    id: "c_documents_total",
                                                    title: "案件文档",
                                                    chrome: "none",
                                                    defaultSize: { w: 6, h: 5, minW: 4, minH: 4 },
                                                    content: (
                                                        <Card>
                                                            <CardContent className="p-4 flex items-center gap-4">
                                                                <div className="h-10 w-10 rounded-lg bg-secondary/20 flex items-center justify-center text-foreground">
                                                                    <FileText className="h-5 w-5" />
                                                                </div>
                                                                <div>
                                                                    <div className="text-2xl font-bold">{documents.length}</div>
                                                                    <div className="text-xs text-muted-foreground">案件文档</div>
                                                                </div>
                                                            </CardContent>
                                                        </Card>
                                                    ),
                                                },
                                                {
                                                    id: "c_events_total",
                                                    title: "相关日程",
                                                    chrome: "none",
                                                    defaultSize: { w: 6, h: 5, minW: 4, minH: 4 },
                                                    content: (
                                                        <Card>
                                                            <CardContent className="p-4 flex items-center gap-4">
                                                                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                                    <Calendar className="h-5 w-5" />
                                                                </div>
                                                                <div>
                                                                    <div className="text-2xl font-bold">{events.length}</div>
                                                                    <div className="text-xs text-muted-foreground">相关日程</div>
                                                                </div>
                                                            </CardContent>
                                                        </Card>
                                                    ),
                                                },
                                                {
                                                    id: "c_timelogs_total",
                                                    title: "工时记录",
                                                    chrome: "none",
                                                    defaultSize: { w: 6, h: 5, minW: 4, minH: 4 },
                                                    content: (
                                                        <Card>
                                                            <CardContent className="p-4 flex items-center gap-4">
                                                                <div className="h-10 w-10 rounded-lg bg-primary-50 flex items-center justify-center text-primary-600">
                                                                    <Clock className="h-5 w-5" />
                                                                </div>
                                                                <div>
                                                                    <div className="text-2xl font-bold">{timeSummary ? timeSummary.count : "—"}</div>
                                                                    <div className="text-xs text-muted-foreground">工时记录</div>
                                                                    {timeSummaryError ? (
                                                                        <div className="text-[11px] text-destructive">{timeSummaryError}</div>
                                                                    ) : null}
                                                                </div>
                                                            </CardContent>
                                                        </Card>
                                                    ),
                                                },
                                            ]}
                                        />
                                    </div>
                                ),
                            },
                            {
                                id: "b_similar_cases",
                                title: "相似案件",
                                chrome: "none",
                                defaultSize: { w: 6, h: 12, minW: 4, minH: 6 },
                                content: <SimilarCasesBlock caseId={caseItem.id} />,
                            },
                        ]}
                    />
                ) : null}

                {activeTab === "parties" ? (
                    <SectionWorkspace
                        sectionId="case_tab_parties"
                        entityId={caseItem.id}
                        headerVariant="compact"
                        catalog={[
                            {
                                id: "b_parties",
                                title: "当事人",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 8, h: 18, minW: 6, minH: 12 },
                                content: <CasePartiesTab caseId={caseItem.id} />,
                            },
                            {
                                id: "b_parties_team",
                                title: "团队成员",
                                chrome: "none",
                                defaultSize: { w: 4, h: 18, minW: 4, minH: 12 },
                                content: sidebarContentById.get("b_case_team") ?? null,
                            },
                        ]}
                    />
                ) : null}

                {activeTab === "tasks" ? (
                    <SectionWorkspace
                        sectionId="case_tab_tasks"
                        entityId={caseItem.id}
                        headerVariant="compact"
                        catalog={[
                            {
                                id: "b_task_board",
                                title: "任务看板",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 8, h: 18, minW: 6, minH: 12 },
                                content: <CaseTaskKanban caseId={caseItem.id} lawyers={caseItem.members?.map((m) => m.user) ?? []} />,
                            },
                            {
                                id: "b_task_timer",
                                title: "计时器",
                                chrome: "none",
                                defaultSize: { w: 4, h: 10, minW: 4, minH: 8 },
                                content: (
                                    <TimerWidget
                                        cases={[
                                            {
                                                id: caseItem.id,
                                                title: caseItem.title,
                                                caseCode: caseItem.caseNumber || caseItem.caseCode || "",
                                            },
                                        ]}
                                        onTimerChanged={() => {
                                            router.refresh()
                                        }}
                                    />
                                ),
                            },
                        ]}
                    />
                ) : null}

                {activeTab === "documents" ? (
                    <SectionWorkspace
                        sectionId="case_tab_documents"
                        entityId={caseItem.id}
                        headerVariant="compact"
                        catalog={[
                            {
                                id: "b_documents",
                                title: "案件文档",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 8, h: 18, minW: 6, minH: 12 },
                                content: (
                                    <Card>
                                        <CardHeader className="flex flex-row items-center justify-between">
                                            <CardTitle className="text-base">案件文档</CardTitle>
                                            <div className="flex items-center gap-2">
                                                <NewDraftDialog
                                                    caseId={caseItem.id}
                                                    onDraftCreated={() => {
                                                        router.refresh()
                                                    }}
                                                />
                                                <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                                                    <DialogTrigger asChild>
                                                        <Button size="sm" variant="outline">
                                                            <Plus className="h-4 w-4 mr-1" /> 上传文档
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent>
                                                        <DialogHeader>
                                                            <DialogTitle>上传案件文档</DialogTitle>
                                                        </DialogHeader>
                                                        <form action={handleCaseDocUpload} className="space-y-4">
                                                            <input type="hidden" name="caseId" value={caseItem.id} />
                                                            <div className="grid gap-2">
                                                                <Label htmlFor="file">选择文件</Label>
                                                                <Input id="file" name="file" type="file" required />
                                                            </div>
                                                            <div className="grid gap-2">
                                                                <Label htmlFor="title"> 文档标题</Label>
                                                                <Input id="title" name="title" placeholder="例如：起诉状副本" />
                                                            </div>
                                                            <div className="grid gap-2">
                                                                <Label htmlFor="category">文档分类</Label>
                                                                <Select name="category">
                                                                    <SelectTrigger>
                                                                        <SelectValue placeholder="选择分类" />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="litigation">诉讼文书</SelectItem>
                                                                        <SelectItem value="evidence">证据材料</SelectItem>
                                                                        <SelectItem value="contract">合同文书</SelectItem>
                                                                        <SelectItem value="procedure">程序文书</SelectItem>
                                                                        <SelectItem value="draft">草稿</SelectItem>
                                                                        <SelectItem value="other">其他</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                            <div className="grid gap-2">
                                                                <Label htmlFor="notes"> 备注</Label>
                                                                <Textarea id="notes" name="notes" placeholder="添加文档备注..." rows={2} />
                                                            </div>
                                                            <DialogFooter>
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    onClick={() => setUploadOpen(false)}
                                                                >
                                                                    取消
                                                                </Button>
                                                                <Button type="submit" disabled={uploading}>
                                                                    {uploading ? "上传中..." : "确认上传"}
                                                                </Button>
                                                            </DialogFooter>
                                                        </form>
                                                    </DialogContent>
                                                </Dialog>
                                            </div>
                                        </CardHeader>
                                        <CardContent>
                                            {stageProgress?.currentStage &&
                                            ["LITIGATION", "ARBITRATION", "NON_LITIGATION"].includes(caseItem.serviceType) ? (
                                                <div className="mb-6">
                                                    <StageDocumentChecklist
                                                        caseId={caseItem.id}
                                                        serviceType={caseItem.serviceType as "LITIGATION" | "ARBITRATION" | "NON_LITIGATION"}
                                                        currentStage={stageProgress.currentStage}
                                                        documents={documents}
                                                        onDocumentUpdated={async () => {
                                                            await loadCaseDocuments()
                                                            router.refresh()
                                                            await loadStageProgress()
                                                        }}
                                                    />
                                                </div>
                                            ) : null}
                                            <div className="space-y-2">
                                                {documents.map((doc) => (
                                                    <div
                                                        key={doc.id}
                                                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <FileText className="h-5 w-5 text-info" />
                                                            <div>
                                                                <Link
                                                                    href={`/documents/${doc.id}`}
                                                                    className="font-medium text-foreground hover:underline"
                                                                >
                                                                    {doc.title}
                                                                </Link>
                                                                <div className="text-xs text-muted-foreground">
                                                                    {doc.fileUrl
                                                                        ? `${formatFileTypeLabel(doc.fileType)} • ${(doc.fileSize / 1024).toFixed(1)} KB`
                                                                        : "未上传文件"}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <Button size="icon" variant="ghost" onClick={() => handleDocDownload(doc)}>
                                                            <Download className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                ))}
                                                {documents.length === 0 ? (
                                                    <div className="text-center py-8 text-muted-foreground">暂无文档</div>
                                                ) : null}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ),
                            },
                            {
                                id: "b_documents_stats",
                                title: "文档统计",
                                chrome: "none",
                                defaultSize: { w: 4, h: 12, minW: 4, minH: 8 },
                                content: (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-base">文档统计</CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-3">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-muted-foreground">总文档</span>
                                                <span className="font-semibold">{documents.length}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-muted-foreground">必备文档</span>
                                                <span className="font-semibold">{documents.filter((d) => d.isRequired).length}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-muted-foreground">已完成</span>
                                                <span className="font-semibold">{documents.filter((d) => d.isCompleted).length}</span>
                                            </div>
                                            <div className="pt-2 text-xs text-muted-foreground">
                                                可在上方列表上传、归档与管理版本；布局支持拖拽记忆与恢复默认。
                                            </div>
                                        </CardContent>
                                    </Card>
                                ),
                            },
                        ]}
                    />
                ) : null}

                {activeTab === "timelog" ? (
                    <SectionWorkspace
                        sectionId="case_tab_timelog"
                        entityId={caseItem.id}
                        headerVariant="compact"
                        catalog={[
                            {
                                id: "b_timelog",
                                title: "工时记录",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 8, h: 18, minW: 6, minH: 12 },
                                content: <CaseTimeLogsTab caseId={caseItem.id} />,
                            },
                            {
                                id: "b_timelog_timer",
                                title: "计时器",
                                chrome: "none",
                                defaultSize: { w: 4, h: 10, minW: 4, minH: 8 },
                                content: (
                                    <TimerWidget
                                        cases={[
                                            {
                                                id: caseItem.id,
                                                title: caseItem.title,
                                                caseCode: caseItem.caseNumber || caseItem.caseCode || "",
                                            },
                                        ]}
                                        onTimerChanged={() => {
                                            router.refresh()
                                        }}
                                    />
                                ),
                            },
                        ]}
                    />
                ) : null}

                {activeTab === "events" ? (
                    <SectionWorkspace
                        sectionId="case_tab_events"
                        entityId={caseItem.id}
                        headerVariant="compact"
                        catalog={[
                            {
                                id: "b_events",
                                title: "相关日程",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 8, h: 18, minW: 6, minH: 12 },
                                content: (
                                    <Card>
                                        <CardHeader className="flex flex-row items-center justify-between">
                                            <CardTitle className="text-base">相关日程</CardTitle>
                                            <Dialog open={eventOpen} onOpenChange={setEventOpen}>
                                                <DialogTrigger asChild>
                                                    <Button size="sm" variant="outline" data-testid="case-detail-add-event">
                                                        <Plus className="h-4 w-4 mr-1" /> 新建日程
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent className="sm:max-w-[560px]">
                                                    <DialogHeader>
                                                        <DialogTitle>新建日程</DialogTitle>
                                                    </DialogHeader>
                                                    <form action={handleCreateEvent} className="space-y-4">
                                                        <div className="grid gap-2">
                                                            <Label htmlFor="event-title">标题</Label>
                                                            <Input
                                                                id="event-title"
                                                                name="title"
                                                                placeholder="例如：与客户会议"
                                                                required
                                                                maxLength={200}
                                                            />
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="grid gap-2">
                                                                <Label htmlFor="event-start">开始时间</Label>
                                                                <Input
                                                                    id="event-start"
                                                                    name="startTime"
                                                                    type="datetime-local"
                                                                    required
                                                                    defaultValue={toDateTimeLocalValue(new Date())}
                                                                />
                                                            </div>
                                                            <div className="grid gap-2">
                                                                <Label htmlFor="event-end">结束时间</Label>
                                                                <Input
                                                                    id="event-end"
                                                                    name="endTime"
                                                                    type="datetime-local"
                                                                    required
                                                                    defaultValue={toDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000))}
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="grid gap-2">
                                                            <Label htmlFor="event-location">地点</Label>
                                                            <Input
                                                                id="event-location"
                                                                name="location"
                                                                placeholder="会议地点或线上会议链接"
                                                                maxLength={200}
                                                            />
                                                        </div>
                                                        <div className="grid gap-2">
                                                            <Label htmlFor="event-description">描述</Label>
                                                            <Textarea id="event-description" name="description" placeholder="日程详情..." rows={3} />
                                                        </div>
                                                        {caseItem.members?.length ? (
                                                            <div className="grid gap-2">
                                                                <Label>邀请参与人（案件成员）</Label>
                                                                <div className="max-h-40 overflow-auto rounded-lg border p-2 space-y-2">
                                                                    {caseItem.members
                                                                        .filter((m) => m.user.id !== currentUser?.id)
                                                                        .map((m) => (
                                                                            <label
                                                                                key={m.user.id}
                                                                                className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-muted/40"
                                                                            >
                                                                                <input
                                                                                    type="checkbox"
                                                                                    name="participantIds"
                                                                                    value={m.user.id}
                                                                                    className="h-4 w-4"
                                                                                />
                                                                                <span className="truncate">{m.user.name || m.user.email}</span>
                                                                            </label>
                                                                        ))}
                                                                </div>
                                                            </div>
                                                        ) : null}
                                                        <DialogFooter>
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                onClick={() => setEventOpen(false)}
                                                                disabled={eventSubmitting}
                                                            >
                                                                取消
                                                            </Button>
                                                            <Button type="submit" disabled={eventSubmitting}>
                                                                {eventSubmitting ? (
                                                                    <>
                                                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> 创建中...
                                                                    </>
                                                                ) : (
                                                                    "创建日程"
                                                                )}
                                                            </Button>
                                                        </DialogFooter>
                                                    </form>
                                                </DialogContent>
                                            </Dialog>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-2">
                                                {events.map((event) => (
                                                    <div
                                                        key={event.id}
                                                        className="flex items-center gap-4 p-3 rounded-lg border bg-muted/30"
                                                    >
                                                        <div className="text-center min-w-[50px]">
                                                            <div className="text-xs text-destructive font-bold">
                                                                {new Date(event.startTime).toLocaleString("default", { month: "short" })}
                                                            </div>
                                                            <div className="text-xl font-bold text-foreground">{new Date(event.startTime).getDate()}</div>
                                                        </div>
                                                        <div>
                                                            <div className="font-medium">{event.title}</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {new Date(event.startTime).toLocaleTimeString()} -{" "}
                                                                {new Date(event.endTime).toLocaleTimeString()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                {events.length === 0 ? (
                                                    <div className="text-center py-8 text-muted-foreground">暂无日程</div>
                                                ) : null}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ),
                            },
                            {
                                id: "b_events_team",
                                title: "团队成员",
                                chrome: "none",
                                defaultSize: { w: 4, h: 18, minW: 4, minH: 12 },
                                content: sidebarContentById.get("b_case_team") ?? null,
                            },
                        ]}
                    />
                ) : null}

                {activeTab === "timeline" ? (
                    <SectionWorkspace
                        sectionId="case_tab_timeline"
                        entityId={caseItem.id}
                        headerVariant="compact"
                        catalog={[
                            {
                                id: "b_timeline",
                                title: "时间线",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 8, h: 18, minW: 6, minH: 12 },
                                content: <CaseTimelineTab caseId={caseItem.id} />,
                            },
                            {
                                id: "b_timeline_stage",
                                title: "案件阶段",
                                chrome: "none",
                                defaultSize: { w: 4, h: 18, minW: 4, minH: 12 },
                                content:
                                    sidebarContentById.get("b_case_stage") ??
                                    sidebarContentById.get("b_case_customer") ??
                                    null,
                            },
                        ]}
                    />
                ) : null}

                {activeTab === "billing" ? (
                    <SectionWorkspace
                        sectionId="case_tab_billing"
                        entityId={caseItem.id}
                        headerVariant="compact"
                        catalog={[
                            {
                                id: "b_billing",
                                title: "账务与发票",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 8, h: 18, minW: 6, minH: 12 },
                                content: <CaseBillingTab caseId={caseItem.id} />,
                            },
                            {
                                id: "b_billing_time_summary",
                                title: "工时汇总",
                                chrome: "none",
                                defaultSize: { w: 4, h: 12, minW: 4, minH: 8 },
                                content: (
                                    <Card>
                                        <CardHeader className="flex flex-row items-center justify-between">
                                            <CardTitle className="text-base">工时汇总</CardTitle>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={onRefreshTimeSummary}
                                                disabled={timeSummaryRefreshing}
                                            >
                                                {timeSummaryRefreshing ? "刷新中..." : "刷新"}
                                            </Button>
                                        </CardHeader>
                                        <CardContent className="space-y-3">
                                            {timeSummary ? (
                                                <>
                                                    <div className="flex items-center justify-between text-sm">
                                                        <span className="text-muted-foreground">记录数</span>
                                                        <span className="font-semibold">{timeSummary.count}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between text-sm">
                                                        <span className="text-muted-foreground">总工时</span>
                                                        <span className="font-semibold">{timeSummary.totalHours.toFixed(2)}h</span>
                                                    </div>
                                                    <div className="flex items-center justify-between text-sm">
                                                        <span className="text-muted-foreground">可计费</span>
                                                        <span className="font-semibold">{timeSummary.billableHours.toFixed(2)}h</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="text-sm text-muted-foreground">暂无工时汇总数据</div>
                                            )}
                                            {timeSummaryError ? (
                                                <div className="text-sm text-destructive">加载失败：{timeSummaryError}</div>
                                            ) : null}
                                        </CardContent>
                                    </Card>
                                ),
                            },
                        ]}
                    />
                ) : null}

                {activeTab === "settings" ? <CaseSettingsTab caseItem={caseItem} /> : null}
            </div>
        </div>
    )
}
