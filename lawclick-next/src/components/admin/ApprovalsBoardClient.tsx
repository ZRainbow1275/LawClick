"use client"

import { useCallback, useMemo, useState, type ComponentProps } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import {
    Calendar,
    CheckCircle2,
    Clock,
    FileCheck,
    FileText,
    MoreHorizontal,
    Receipt,
    RefreshCw,
    ShoppingCart,
    XCircle,
} from "lucide-react"
import type { ApprovalType } from "@/lib/prisma-browser"
import type { LucideIcon } from "lucide-react"

import {
    approveRequest,
    cancelRequest,
    createApprovalRequest,
    getAvailableApprovers,
    rejectRequest,
    type ApprovalListItem,
} from "@/actions/approval-actions"
import { getCases } from "@/actions/cases"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent } from "@/components/ui/Card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs"
import { LegoDeck } from "@/components/layout/LegoDeck"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Textarea } from "@/components/ui/Textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar"    
import { usePermission } from "@/hooks/use-permission"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { getToneSoftClassName, type UiTone } from "@/lib/ui/tone"

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>

const APPROVAL_TYPE_CONFIG: Record<ApprovalType, { label: string; icon: LucideIcon; tone: UiTone }> = {
    LEAVE: { label: "请假申请", icon: Calendar, tone: "info" },
    EXPENSE: { label: "报销申请", icon: Receipt, tone: "warning" },
    PURCHASE: { label: "采购申请", icon: ShoppingCart, tone: "default" },
    CONTRACT: { label: "合同审批", icon: FileText, tone: "secondary" },
    INVOICE: { label: "发票申请", icon: FileCheck, tone: "success" },
    OTHER: { label: "其他审批", icon: MoreHorizontal, tone: "secondary" },
}

const STATUS_CONFIG: Record<string, { label: string; badgeVariant: BadgeVariant }> = {
    DRAFT: { label: "草稿", badgeVariant: "secondary" },
    PENDING: { label: "待审批", badgeVariant: "warning" },
    APPROVED: { label: "已批准", badgeVariant: "success" },
    REJECTED: { label: "已驳回", badgeVariant: "destructive" },
    CANCELLED: { label: "已撤回", badgeVariant: "secondary" },
}

function safeCurrency(amount?: unknown) {
    if (amount === null || amount === undefined) return ""
    const num = typeof amount === "number" ? amount : Number(amount)
    if (!Number.isFinite(num)) return ""
    return `￥${num.toLocaleString()}`
}

type CaseSearchItem = Awaited<ReturnType<typeof getCases>>[number]

export function ApprovalsBoardClient({
    initialPending,
    initialApproved,
    initialMine,
}: {
    initialPending: ApprovalListItem[]
    initialApproved: ApprovalListItem[]
    initialMine: ApprovalListItem[]
}) {
    const router = useRouter()
    const { data: session } = useSession()
    const currentUserId = (() => {
        const user = session?.user as unknown
        if (!user || typeof user !== "object") return undefined
        const id = (user as { id?: unknown }).id
        return typeof id === "string" ? id : undefined
    })()
    const { can } = usePermission()

    const canApprove = can("approval:approve")
    const canCreate = can("approval:create")

    const pending = initialPending
    const approved = initialApproved
    const mine = initialMine

    const refresh = useCallback(() => router.refresh(), [router])

    const myPendingCount = useMemo(() => mine.filter((a) => a.status === "PENDING").length, [mine])

    const statsDeck = [
        {
            id: "b_approvals_stat_pending",
            title: "待审批",
            chrome: "none",
            defaultSize: { w: 3, h: 4, minW: 3, minH: 3 },
            content: (
                <Card className="h-full">
                    <CardContent className="h-full p-4 flex items-center gap-4">
                        <div className="p-3 rounded-full bg-warning/10">
                            <Clock className="h-6 w-6 text-warning" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{pending.length}</p>
                            <p className="text-sm text-muted-foreground">待审批</p>
                        </div>
                    </CardContent>
                </Card>
            ),
        },
        {
            id: "b_approvals_stat_handled",
            title: "已处理",
            chrome: "none",
            defaultSize: { w: 3, h: 4, minW: 3, minH: 3 },
            content: (
                <Card className="h-full">
                    <CardContent className="h-full p-4 flex items-center gap-4">
                        <div className="p-3 rounded-full bg-success/10">
                            <CheckCircle2 className="h-6 w-6 text-success" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{approved.length}</p>
                            <p className="text-sm text-muted-foreground">已处理</p>
                        </div>
                    </CardContent>
                </Card>
            ),
        },
        {
            id: "b_approvals_stat_mine",
            title: "我发起的",
            chrome: "none",
            defaultSize: { w: 3, h: 4, minW: 3, minH: 3 },
            content: (
                <Card className="h-full">
                    <CardContent className="h-full p-4 flex items-center gap-4">
                        <div className="p-3 rounded-full bg-info/10">
                            <FileText className="h-6 w-6 text-info" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{mine.length}</p>
                            <p className="text-sm text-muted-foreground">我发起的</p>
                        </div>
                    </CardContent>
                </Card>
            ),
        },
        {
            id: "b_approvals_stat_mine_pending",
            title: "审批中",
            chrome: "none",
            defaultSize: { w: 3, h: 4, minW: 3, minH: 3 },
            content: (
                <Card className="h-full">
                    <CardContent className="h-full p-4 flex items-center gap-4">
                        <div className="p-3 rounded-full bg-primary/10">
                            <RefreshCw className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{myPendingCount}</p>
                            <p className="text-sm text-muted-foreground">审批中</p>
                        </div>
                    </CardContent>
                </Card>
            ),
        },
    ] satisfies SectionCatalogItem[]

    // 创建审批 Dialog
    const [createOpen, setCreateOpen] = useState(false)
    const [creating, setCreating] = useState(false)
    const [approvers, setApprovers] = useState<{ id: string; name: string | null; department?: string | null }[]>([])
    const [caseQuery, setCaseQuery] = useState("")
    const [caseResults, setCaseResults] = useState<CaseSearchItem[]>([])
    const [pickedCase, setPickedCase] = useState<{ id: string; title: string; caseCode?: string | null } | null>(null)

    const [draft, setDraft] = useState<{
        type: ApprovalType
        title: string
        description: string
        amount: string
        approverId: string
        submit: boolean
        extra: string
    }>({
        type: "LEAVE",
        title: "",
        description: "",
        amount: "",
        approverId: "",
        submit: true,
        extra: "",
    })

    const openCreate = async () => {
        if (!canCreate) {
            toast.error("无权限", { description: "缺少 approval:create" })
            return
        }
        setCreateOpen(true)
        try {
            const res = await getAvailableApprovers()
            if (res.success) setApprovers(res.data)
        } catch {
            // ignore
        }
    }

    const searchCases = async (q: string) => {
        const query = q.trim()
        setCaseQuery(q)
        if (query.length < 2) {
            setCaseResults([])
            return
        }
        try {
            const rows = await getCases(query, "all", "all")
            setCaseResults((rows || []).slice(0, 10))
        } catch {
            setCaseResults([])
        }
    }

    const renderApprovalCard = useCallback((approval: ApprovalListItem) => {
        const typeConfig = APPROVAL_TYPE_CONFIG[approval.type] || APPROVAL_TYPE_CONFIG.OTHER
        const statusConfig = STATUS_CONFIG[approval.status] || STATUS_CONFIG.PENDING
        const TypeIcon = typeConfig.icon

        const canCancel = !!currentUserId && approval.requesterId === currentUserId && (approval.status === "DRAFT" || approval.status === "PENDING")

        return (
            <Card className="hover:shadow-md transition-shadow h-full">
                <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className={`p-2 rounded-lg border ${getToneSoftClassName(typeConfig.tone)}`}>
                                <TypeIcon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="font-medium truncate">{approval.title}</h3>
                                <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
                                    <span>{typeConfig.label}</span>
                                    {approval.amount ? <span className="font-medium text-foreground">{safeCurrency(approval.amount)}</span> : null}
                                    {approval.case ? (
                                        <Link href={`/cases/${approval.case.id}`} className="text-primary hover:underline">
                                            {approval.case.caseCode || "案件"} · {approval.case.title}
                                        </Link>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">      
                            <Button size="icon" variant="outline" asChild title="查看详情">
                                <Link href={`/admin/approvals/${approval.id}`}>
                                    <FileText className="h-4 w-4" />
                                </Link>
                            </Button>
                            <Badge variant={statusConfig.badgeVariant}>{statusConfig.label}</Badge>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t">
                        <div className="flex items-center gap-2 min-w-0">
                            <Avatar className="h-6 w-6">
                                <AvatarImage src={approval.requester?.avatarUrl || undefined} />
                                <AvatarFallback>{approval.requester?.name?.[0] || "?"}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm text-muted-foreground truncate">{approval.requester?.name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {new Date(approval.createdAt).toLocaleDateString("zh-CN")}
                        </div>
                    </div>

                    {approval.status === "PENDING" && canApprove ? (
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                className="flex-1 bg-success text-success-foreground hover:bg-success/90"
                                onClick={async () => {
                                    const res = await approveRequest(approval.id)
                                    if (!res.success) {
                                        toast.error("审批失败", { description: res.error })
                                        return
                                    }
                                    toast.success("已批准")
                                    refresh()
                                }}
                            >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                批准
                            </Button>
                            <Button
                                size="sm"
                                variant="destructive"
                                className="flex-1"
                                onClick={async () => {
                                    const res = await rejectRequest(approval.id)
                                    if (!res.success) {
                                        toast.error("驳回失败", { description: res.error })
                                        return
                                    }
                                    toast.success("已驳回")
                                    refresh()
                                }}
                            >
                                <XCircle className="h-4 w-4 mr-1" />
                                驳回
                            </Button>
                        </div>
                    ) : null}

                    {canCancel ? (
                        <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={async () => {
                                const res = await cancelRequest(approval.id)
                                if (!res.success) {
                                    toast.error("撤回失败", { description: res.error })
                                    return
                                }
                                toast.success("已撤回")
                                refresh()
                            }}
                        >
                            撤回申请
                        </Button>
                    ) : null}
                </CardContent>
            </Card>
        )
    }, [canApprove, currentUserId, refresh])

    const pendingCardsDeck: SectionCatalogItem[] = useMemo(
        () =>
            pending.map((approval) => ({
                id: `approval_${approval.id}`,
                title: approval.title || "审批",
                pinned: true,
                chrome: "none",
                defaultSize: { w: 4, h: 11, minW: 3, minH: 8 },
                content: renderApprovalCard(approval),
            })),
        [pending, renderApprovalCard]
    )

    const approvedCardsDeck: SectionCatalogItem[] = useMemo(
        () =>
            approved.map((approval) => ({
                id: `approval_${approval.id}`,
                title: approval.title || "审批",
                pinned: true,
                chrome: "none",
                defaultSize: { w: 4, h: 11, minW: 3, minH: 8 },
                content: renderApprovalCard(approval),
            })),
        [approved, renderApprovalCard]
    )

    const mineCardsDeck: SectionCatalogItem[] = useMemo(
        () =>
            mine.map((approval) => ({
                id: `approval_${approval.id}`,
                title: approval.title || "审批",
                pinned: true,
                chrome: "none",
                defaultSize: { w: 4, h: 11, minW: 3, minH: 8 },
                content: renderApprovalCard(approval),
            })),
        [mine, renderApprovalCard]
    )

    return (
        <SectionWorkspace
            title="审批中心"
            sectionId="admin_approvals"
            className="h-full"
            catalog={[
                {
                    id: "b_approvals_header",
                    title: "概览",
                    pinned: true,
                    chrome: "none",
                    defaultSize: { w: 12, h: 4, minW: 8, minH: 3 },
                    content: (
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h1 className="text-2xl font-bold">审批中心</h1>
                                <p className="text-muted-foreground">行政审批与案件关联审批（真实落库）</p>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => refresh()} className="gap-2">
                                    <RefreshCw className="h-4 w-4" />
                                    刷新
                                </Button>
                                <Button onClick={openCreate} disabled={!canCreate}>
                                    新建申请
                                </Button>
                            </div>
                        </div>
                    ),
                },
                {
                    id: "b_approvals_stats",
                    title: "统计",
                    chrome: "none",
                    defaultSize: { w: 12, h: 6, minW: 8, minH: 5 },
                    content: (
                        <LegoDeck
                            title="统计卡片（可拖拽）"
                            sectionId="admin_approvals_stats_cards"
                            rowHeight={28}
                            margin={[12, 12]}
                            catalog={statsDeck}
                        />
                    ),
                },
                {
                    id: "b_approvals_main",
                    title: "审批列表",
                    pinned: true,
                    chrome: "none",
                    defaultSize: { w: 12, h: 18, minW: 8, minH: 12 },
                    content: (
                        <>
            <Tabs defaultValue="pending" className="space-y-4" onValueChange={() => {}}>
                <TabsList>
                    <TabsTrigger value="pending" className="gap-2">
                        待审批 <Badge variant="secondary">{pending.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="approved">已处理</TabsTrigger>
                    <TabsTrigger value="mine">我发起的</TabsTrigger>
                </TabsList>

                <TabsContent value="pending" className="space-y-4">
                    {pending.length > 0 ? (
                        <LegoDeck
                            title="待审批卡片（可拖拽）"
                            sectionId="admin_approvals_pending_cards"
                            rowHeight={28}
                            margin={[12, 12]}
                            catalog={pendingCardsDeck}
                        />
                    ) : (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <CheckCircle2 className="h-12 w-12 text-success mb-4" />
                                <p className="text-lg font-medium">暂无待审批事项</p>
                                <p className="text-muted-foreground">所有审批已处理完毕</p>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="approved" className="space-y-4">
                    {approved.length > 0 ? (
                        <LegoDeck
                            title="已处理卡片（可拖拽）"
                            sectionId="admin_approvals_approved_cards"
                            rowHeight={28}
                            margin={[12, 12]}
                            catalog={approvedCardsDeck}
                        />
                    ) : (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                                <p className="text-lg font-medium">暂无已处理记录</p>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="mine" className="space-y-4">
                    {mine.length > 0 ? (
                        <LegoDeck
                            title="我发起的（可拖拽）"
                            sectionId="admin_approvals_mine_cards"
                            rowHeight={28}
                            margin={[12, 12]}
                            catalog={mineCardsDeck}
                        />
                    ) : (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                                <p className="text-lg font-medium">暂无发起的申请</p>
                                <p className="text-muted-foreground">点击右上角“新建申请”开始</p>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>
            </Tabs>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-[760px]">
                    <DialogHeader>
                        <DialogTitle>新建审批申请</DialogTitle>
                    </DialogHeader>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>类型</Label>
                            <Select value={draft.type} onValueChange={(v) => setDraft((p) => ({ ...p, type: v as ApprovalType }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="选择审批类型" />
                                </SelectTrigger>
                                <SelectContent>
                                    {(Object.keys(APPROVAL_TYPE_CONFIG) as ApprovalType[]).map((k) => (
                                        <SelectItem key={k} value={k}>
                                            {APPROVAL_TYPE_CONFIG[k]?.label || k}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>审批人</Label>
                            <Select
                                value={draft.approverId || "__none__"}
                                onValueChange={(v) => setDraft((p) => ({ ...p, approverId: v === "__none__" ? "" : v }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="选择审批人（可选）" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">不指定（可被有权限者处理）</SelectItem>
                                    {approvers.map((a) => (
                                        <SelectItem key={a.id} value={a.id}>
                                            {a.name || a.id.slice(0, 6)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2 md:col-span-2">
                            <Label>标题</Label>
                            <Input value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} placeholder="例如：请假申请 / 报销申请..." />
                        </div>

                        <div className="space-y-2 md:col-span-2">
                            <Label>说明</Label>
                            <Textarea value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} rows={3} placeholder="补充说明..." />
                        </div>

                        <div className="space-y-2">
                            <Label>金额（可选）</Label>
                            <Input value={draft.amount} onChange={(e) => setDraft((p) => ({ ...p, amount: e.target.value }))} placeholder="例如：860" />
                        </div>

                        <div className="space-y-2">
                            <Label>关联案件（可选）</Label>
                            {pickedCase ? (
                                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                                    <div className="text-sm">
                                        {pickedCase.caseCode ? `${pickedCase.caseCode} · ` : ""}
                                        {pickedCase.title}
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={() => setPickedCase(null)}>
                                        清除
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <Input value={caseQuery} onChange={(e) => searchCases(e.target.value)} placeholder="搜索案件（按标题/案号/客户）" />
                                    {caseResults.length > 0 ? (
                                        <div className="max-h-40 overflow-auto rounded-md border bg-card/50 p-2 space-y-1">
                                            {caseResults.map((c) => (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    className="w-full text-left text-sm px-2 py-1 rounded hover:bg-accent"
                                                    onClick={() => {
                                                        setPickedCase({ id: c.id, title: c.title, caseCode: c.caseCode })
                                                        setCaseResults([])
                                                        setCaseQuery("")
                                                    }}
                                                >
                                                    {c.caseCode ? `${c.caseCode} · ` : ""}
                                                    {c.title}
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            )}
                        </div>

                        <div className="space-y-2 md:col-span-2">
                            <Label>补充信息（可选）</Label>
                            <Textarea value={draft.extra} onChange={(e) => setDraft((p) => ({ ...p, extra: e.target.value }))} rows={2} placeholder="例如：出差地点、请假原因、采购明细等" />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                            取消
                        </Button>
                        <Button
                            disabled={creating || !draft.title.trim()}
                            onClick={async () => {
                                setCreating(true)
                                try {
                                    const amount = draft.amount.trim() ? Number(draft.amount.trim()) : undefined
                                    if (draft.amount.trim() && Number.isNaN(amount)) {
                                        toast.error("金额格式不正确")
                                        return
                                    }

                                    const res = await createApprovalRequest({
                                        type: draft.type,
                                        title: draft.title.trim(),
                                        description: draft.description.trim() || undefined,
                                        amount,
                                        approverId: draft.approverId || undefined,
                                        caseId: pickedCase?.id,
                                        metadata: draft.extra.trim() ? { extra: draft.extra.trim() } : {},
                                        submit: true,
                                    })
                                    if (!res.success) {
                                        toast.error("创建失败", { description: res.error })
                                        return
                                    }
                                    toast.success("已提交审批")
                                    setCreateOpen(false)
                                    setPickedCase(null)
                                    setDraft({
                                        type: "LEAVE",
                                        title: "",
                                        description: "",
                                        amount: "",
                                        approverId: "",
                                        submit: true,
                                        extra: "",
                                    })
                                    refresh()
                                } catch {
                                    toast.error("创建失败")
                                } finally {
                                    setCreating(false)
                                }
                            }}
                        >
                            {creating ? "提交中..." : "提交"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
                        </>
                    ),
                },
            ]}
        />
    )
}
