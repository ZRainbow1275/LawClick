"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { ArrowLeft, CheckCircle2, Clock, XCircle } from "lucide-react"
import type { ApprovalType } from "@/lib/prisma-browser"

import { approveRequest, cancelRequest, rejectRequest } from "@/actions/approval-actions"
import { LegoDeck } from "@/components/layout/LegoDeck"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Textarea } from "@/components/ui/Textarea"
import { usePermission } from "@/hooks/use-permission"
import { APPROVAL_STATUS_META, APPROVAL_TYPE_META, safeCurrency } from "@/lib/approvals/approval-ui"
import { getToneSoftClassName } from "@/lib/ui/tone"

type ApprovalDetail = {
    id: string
    title: string
    type: ApprovalType
    status: string
    amount: unknown | null
    description: string | null
    metadata: unknown | null
    createdAt: Date
    submittedAt: Date | null
    resolvedAt: Date | null
    approvalNote: string | null
    requesterId: string
    approverId: string | null
    caseId: string | null
    clientId: string | null
    requester?: { id: string; name: string | null; avatarUrl: string | null; department?: string | null } | null
    approver?: { id: string; name: string | null; avatarUrl: string | null } | null
    case?: { id: string; title: string; caseCode: string | null } | null
    client?: { id: string; name: string; type: string } | null
}

function safeJsonString(value: unknown) {
    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}

function getSessionUserId(sessionUser: unknown) {
    if (!sessionUser || typeof sessionUser !== "object") return null
    const id = (sessionUser as { id?: unknown }).id
    return typeof id === "string" && id.trim() ? id.trim() : null
}

export function ApprovalDetailClient(props: { approval: ApprovalDetail }) {
    const { approval } = props
    const router = useRouter()
    const { data: session } = useSession()
    const { can } = usePermission()

    const currentUserId = getSessionUserId(session?.user as unknown)

    const canApprove = can("approval:approve")
    const canCreate = can("approval:create")
    const canCancel =
        canCreate &&
        !!currentUserId &&
        approval.requesterId === currentUserId &&
        (approval.status === "DRAFT" || approval.status === "PENDING")

    const typeMeta = APPROVAL_TYPE_META[approval.type] || APPROVAL_TYPE_META.OTHER
    const statusMeta = APPROVAL_STATUS_META[approval.status] || { label: approval.status, badgeVariant: "secondary" as const }
    const TypeIcon = typeMeta.icon

    const [note, setNote] = React.useState("")
    const [busy, setBusy] = React.useState(false)

    const refresh = React.useCallback(() => {
        router.refresh()
    }, [router])

    const handleApprove = async () => {
        if (!canApprove) {
            toast.error("无权限", { description: "缺少 approval:approve" })
            return
        }
        setBusy(true)
        try {
            const res = await approveRequest(approval.id, note.trim() || undefined)
            if (!res.success) {
                toast.error("审批失败", { description: res.error })
                return
            }
            toast.success("已批准")
            refresh()
        } catch {
            toast.error("审批失败")
        } finally {
            setBusy(false)
        }
    }

    const handleReject = async () => {
        if (!canApprove) {
            toast.error("无权限", { description: "缺少 approval:approve" })
            return
        }
        setBusy(true)
        try {
            const res = await rejectRequest(approval.id, note.trim() || undefined)
            if (!res.success) {
                toast.error("驳回失败", { description: res.error })
                return
            }
            toast.success("已驳回")
            refresh()
        } catch {
            toast.error("驳回失败")
        } finally {
            setBusy(false)
        }
    }

    const handleCancel = async () => {
        if (!canCancel) {
            toast.error("无权限")
            return
        }
        setBusy(true)
        try {
            const res = await cancelRequest(approval.id)
            if (!res.success) {
                toast.error("撤回失败", { description: res.error })
                return
            }
            toast.success("已撤回")
            refresh()
        } catch {
            toast.error("撤回失败")
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <Button variant="outline" asChild className="gap-2">
                    <Link href="/admin/approvals">
                        <ArrowLeft className="h-4 w-4" />
                        返回审批中心
                    </Link>
                </Button>
                <Badge variant={statusMeta.badgeVariant}>{statusMeta.label}</Badge>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                            <div className={`p-2 rounded-lg border ${getToneSoftClassName(typeMeta.tone)}`}>
                                <TypeIcon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <div className="text-lg font-semibold truncate">{approval.title}</div>
                                <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
                                    <span>{typeMeta.label}</span>
                                    {approval.amount ? (
                                        <span className="font-medium text-foreground">{safeCurrency(approval.amount)}</span>
                                    ) : null}
                                    {approval.case ? (
                                        <Link href={`/cases/${approval.case.id}`} className="text-primary hover:underline">
                                            {approval.case.caseCode || "案件"} · {approval.case.title}
                                        </Link>
                                    ) : null}
                                    {approval.client ? <span>客户：{approval.client.name}</span> : null}
                                </div>
                            </div>
                        </div>
                    </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3">
                    <LegoDeck
                        title="详情分区（可拖拽/可记忆/可恢复）"
                        sectionId="approval_detail_blocks"
                        rowHeight={22}
                        margin={[12, 12]}
                        catalog={[
                            {
                                id: "b_approval_requester",
                                title: "申请人",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 6, h: 4, minW: 3, minH: 3 },
                                content: (
                                    <div className="flex items-center justify-between rounded-md border bg-card/50 px-3 py-2">
                                        <span className="text-muted-foreground">申请人</span>
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Avatar className="h-6 w-6">
                                                <AvatarImage src={approval.requester?.avatarUrl || undefined} />
                                                <AvatarFallback>{approval.requester?.name?.[0] || "?"}</AvatarFallback>
                                            </Avatar>
                                            <span className="truncate">
                                                {approval.requester?.name || approval.requesterId.slice(0, 8)}
                                            </span>
                                        </div>
                                    </div>
                                ),
                            },
                            {
                                id: "b_approval_approver",
                                title: "审批人",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 6, h: 4, minW: 3, minH: 3 },
                                content: (
                                    <div className="flex items-center justify-between rounded-md border bg-card/50 px-3 py-2">
                                        <span className="text-muted-foreground">审批人</span>
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Avatar className="h-6 w-6">
                                                <AvatarImage src={approval.approver?.avatarUrl || undefined} />
                                                <AvatarFallback>{approval.approver?.name?.[0] || "?"}</AvatarFallback>
                                            </Avatar>
                                            <span className="truncate">
                                                {approval.approver?.name ||
                                                    (approval.approverId ? approval.approverId.slice(0, 8) : "未指定")}
                                            </span>
                                        </div>
                                    </div>
                                ),
                            },
                            {
                                id: "b_approval_created_at",
                                title: "创建时间",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 6, h: 4, minW: 3, minH: 3 },
                                content: (
                                    <div className="flex items-center justify-between rounded-md border bg-card/50 px-3 py-2">
                                        <span className="text-muted-foreground">创建时间</span>
                                        <span className="flex items-center gap-2">
                                            <Clock className="h-3 w-3" />
                                            {new Date(approval.createdAt).toLocaleString("zh-CN")}
                                        </span>
                                    </div>
                                ),
                            },
                            {
                                id: "b_approval_submitted_at",
                                title: "提交时间",
                                pinned: false,
                                chrome: "none",
                                defaultSize: { w: 6, h: 4, minW: 3, minH: 3 },
                                content: (
                                    <div className="flex items-center justify-between rounded-md border bg-card/50 px-3 py-2">
                                        <span className="text-muted-foreground">提交时间</span>
                                        <span>
                                            {approval.submittedAt
                                                ? new Date(approval.submittedAt).toLocaleString("zh-CN")
                                                : "-"}
                                        </span>
                                    </div>
                                ),
                            },
                            {
                                id: "b_approval_resolved_at",
                                title: "处理时间",
                                pinned: false,
                                chrome: "none",
                                defaultSize: { w: 6, h: 4, minW: 3, minH: 3 },
                                content: (
                                    <div className="flex items-center justify-between rounded-md border bg-card/50 px-3 py-2">
                                        <span className="text-muted-foreground">处理时间</span>
                                        <span>
                                            {approval.resolvedAt
                                                ? new Date(approval.resolvedAt).toLocaleString("zh-CN")
                                                : "-"}
                                        </span>
                                    </div>
                                ),
                            },
                            {
                                id: "b_approval_id",
                                title: "审批单号",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 6, h: 4, minW: 3, minH: 3 },
                                content: (
                                    <div className="flex items-center justify-between rounded-md border bg-card/50 px-3 py-2">
                                        <span className="text-muted-foreground">审批单号</span>
                                        <span className="font-mono text-xs truncate max-w-[240px]">{approval.id}</span>
                                    </div>
                                ),
                            },
                            {
                                id: "b_approval_description",
                                title: "说明",
                                pinned: false,
                                chrome: "none",
                                defaultSize: { w: 12, h: 7, minW: 6, minH: 5 },
                                content: (
                                    <div className="rounded-md border bg-card/50 p-3 h-full">
                                        <div className="text-xs text-muted-foreground">说明</div>
                                        <div className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                                            {approval.description || "暂无说明"}
                                        </div>
                                    </div>
                                ),
                            },
                            {
                                id: "b_approval_metadata",
                                title: "表单数据（metadata）",
                                pinned: false,
                                chrome: "none",
                                defaultSize: { w: 12, h: 10, minW: 6, minH: 6 },
                                content: (
                                    <div className="rounded-md border bg-card/50 p-3 h-full">
                                        <div className="text-xs text-muted-foreground">表单数据（metadata）</div>
                                        {approval.metadata ? (
                                            <pre className="mt-2 max-h-[420px] overflow-auto text-xs text-muted-foreground whitespace-pre-wrap">
                                                {safeJsonString(approval.metadata)}
                                            </pre>
                                        ) : (
                                            <div className="mt-2 text-sm text-muted-foreground">暂无数据</div>
                                        )}
                                    </div>
                                ),
                            },
                            {
                                id: "b_approval_note",
                                title: "审批意见",
                                pinned: false,
                                chrome: "none",
                                defaultSize: { w: 12, h: 7, minW: 6, minH: 5 },
                                content: (
                                    <div className="rounded-md border bg-card/50 p-3 h-full">
                                        <div className="text-xs text-muted-foreground">审批意见</div>
                                        <div className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                                            {approval.approvalNote || "暂无意见"}
                                        </div>
                                    </div>
                                ),
                            },
                            {
                                id: "b_approval_actions",
                                title: "操作",
                                pinned: true,
                                chrome: "none",
                                defaultSize: { w: 12, h: 10, minW: 6, minH: 7 },
                                content: (
                                    <div className="rounded-md border bg-card/50 p-3 space-y-2 h-full">
                                        <div className="text-sm font-medium">操作</div>
                                        {approval.status === "PENDING" && canApprove ? (
                                            <>
                                                <Textarea
                                                    value={note}
                                                    onChange={(e) => setNote(e.target.value)}
                                                    placeholder="审批意见（可选，最多10000字）"
                                                    rows={3}
                                                    disabled={busy}
                                                />
                                                <div className="flex gap-2">
                                                    <Button
                                                        className="flex-1 bg-success text-success-foreground hover:bg-success/90"
                                                        onClick={handleApprove}
                                                        disabled={busy}
                                                    >
                                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                                        批准
                                                    </Button>
                                                    <Button
                                                        variant="destructive"
                                                        className="flex-1"
                                                        onClick={handleReject}
                                                        disabled={busy}
                                                    >
                                                        <XCircle className="h-4 w-4 mr-2" />
                                                        驳回
                                                    </Button>
                                                </div>
                                            </>
                                        ) : null}
                                        {canCancel ? (
                                            <Button variant="outline" onClick={handleCancel} disabled={busy} className="w-full">
                                                撤回申请
                                            </Button>
                                        ) : null}
                                        {!canApprove && !canCancel ? (
                                            <div className="text-sm text-muted-foreground">当前账号无可执行操作。</div>
                                        ) : null}
                                    </div>
                                ),
                            },
                        ]}
                    />
                </CardContent>
            </Card>
        </div>
    )
}
