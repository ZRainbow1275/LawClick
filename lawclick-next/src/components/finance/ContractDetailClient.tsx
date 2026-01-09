"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, FileText, Link2, Trash2, Unlink2 } from "lucide-react"
import type { Case, Contact, Contract, ContractStatus, Document, User } from "@/lib/prisma-browser"

import { deleteContract, linkContractDocument, unlinkContractDocument, updateContractStatus } from "@/actions/contract-actions"
import { getDocumentDirectory } from "@/actions/document-directory"
import { LegoDeck } from "@/components/layout/LegoDeck"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/AlertDialog"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { Separator } from "@/components/ui/Separator"
import { Textarea } from "@/components/ui/Textarea"
import { usePermission } from "@/hooks/use-permission"
import { CONTRACT_STATUS_META, CONTRACT_STATUS_OPTIONS } from "@/lib/finance/status-meta"

type ContractDetail = Contract & {
    case: Pick<Case, "id" | "title" | "caseCode"> | null
    client: Pick<Contact, "id" | "name" | "type" | "email" | "phone"> | null
    document: Pick<Document, "id" | "title" | "fileType" | "fileUrl"> | null
    creator: Pick<User, "id" | "name"> | null
}

type DocumentDirectoryRow = Extract<Awaited<ReturnType<typeof getDocumentDirectory>>, { success: true }>["data"][number]

function safeMoney(value: unknown) {
    const num = typeof value === "number" ? value : Number(value)
    if (!Number.isFinite(num) || num <= 0) return "-"
    return `￥${num.toLocaleString("zh-CN")}`
}

function safeDate(value: Date | string | null | undefined) {
    if (!value) return "-"
    const d = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(d.getTime())) return "-"
    return d.toLocaleDateString("zh-CN")
}

function safeDateTime(value: Date | string | null | undefined) {
    if (!value) return "-"
    const d = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(d.getTime())) return "-"
    return d.toLocaleString("zh-CN")
}

function ContractInfoBlock(props: { contract: ContractDetail }) {
    const { contract } = props

    const basicFieldsCatalog: SectionCatalogItem[] = [
        {
            id: "contract_no",
            title: "合同编号",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
            content: (
                <div className="rounded-md border bg-card/50 px-3 py-2 h-full">
                    <div className="text-xs text-muted-foreground">合同编号</div>
                    <div className="font-mono">{contract.contractNo}</div>
                </div>
            ),
        },
        {
            id: "amount",
            title: "金额",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
            content: (
                <div className="rounded-md border bg-card/50 px-3 py-2 h-full">
                    <div className="text-xs text-muted-foreground">金额</div>
                    <div className="font-semibold">{safeMoney(contract.amount)}</div>
                </div>
            ),
        },
        {
            id: "signed_at",
            title: "签署日期",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
            content: (
                <div className="rounded-md border bg-card/50 px-3 py-2 h-full">
                    <div className="text-xs text-muted-foreground">签署日期</div>
                    <div>{safeDate(contract.signedAt)}</div>
                </div>
            ),
        },
        {
            id: "date_range",
            title: "起止日期",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
            content: (
                <div className="rounded-md border bg-card/50 px-3 py-2 h-full">
                    <div className="text-xs text-muted-foreground">起止日期</div>
                    <div>
                        {safeDate(contract.startDate)} ~ {safeDate(contract.endDate)}
                    </div>
                </div>
            ),
        },
    ]

    const relationCatalog: SectionCatalogItem[] = [
        {
            id: "case",
            title: "关联案件",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
            content: (
                <div className="rounded-md border bg-card/50 px-3 py-2 h-full">
                    <div className="text-xs text-muted-foreground">关联案件</div>
                    <div className="truncate">
                        {contract.case ? (
                            <Link href={`/cases/${contract.case.id}`} className="hover:underline text-primary">
                                {contract.case.caseCode ? `${contract.case.caseCode} · ` : ""}
                                {contract.case.title}
                            </Link>
                        ) : (
                            "-"
                        )}
                    </div>
                </div>
            ),
        },
        {
            id: "client",
            title: "客户",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
            content: (
                <div className="rounded-md border bg-card/50 px-3 py-2 h-full">
                    <div className="text-xs text-muted-foreground">客户</div>
                    <div className="truncate">
                        {contract.client ? (
                            <Link href={`/crm/customers/${contract.client.id}`} className="hover:underline text-primary">
                                {contract.client.name}
                            </Link>
                        ) : (
                            "-"
                        )}
                    </div>
                    {contract.client?.email || contract.client?.phone ? (
                        <div className="text-xs text-muted-foreground mt-1 truncate">
                            {[contract.client.email, contract.client.phone].filter(Boolean).join(" · ")}
                        </div>
                    ) : null}
                </div>
            ),
        },
    ]

    return (
        <Card className="h-full">
            <CardHeader className="pb-3">
                <CardTitle className="text-base">合同信息</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 space-y-3 overflow-auto text-sm">
                <LegoDeck
                    title="基础字段（可拖拽）"
                    sectionId="contract_info_basic_fields"
                    entityId={contract.id}
                    rowHeight={24}
                    margin={[12, 12]}
                    catalog={basicFieldsCatalog}
                />

                <Separator />

                <LegoDeck
                    title="关联字段（可拖拽）"
                    sectionId="contract_info_relation_fields"
                    entityId={contract.id}
                    rowHeight={24}
                    margin={[12, 12]}
                    catalog={relationCatalog}
                />

                <Separator />

                <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">备注</div>
                    <Textarea value={contract.notes || ""} readOnly rows={4} className="bg-muted/20" />
                </div>

                <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                    <span>创建于 {safeDateTime(contract.createdAt)}</span>
                    <span>更新于 {safeDateTime(contract.updatedAt)}</span>
                </div>
            </CardContent>
        </Card>
    )
}

function ContractDocumentLinkBlock(props: { contract: ContractDetail; canEdit: boolean }) {
    const { contract, canEdit } = props
    const router = useRouter()

    const [linkOpen, setLinkOpen] = useState(false)
    const [linkQuery, setLinkQuery] = useState("")
    const [linkLoading, setLinkLoading] = useState(false)
    const [linkResults, setLinkResults] = useState<DocumentDirectoryRow[]>([])
    const [linkPickedId, setLinkPickedId] = useState<string | null>(null)

    useEffect(() => {
        if (!linkOpen) return
        const q = linkQuery.trim()
        const t = setTimeout(async () => {
            setLinkLoading(true)
            try {
                const input = {
                    caseId: contract.caseId ?? undefined,
                    query: q.length >= 2 ? q : undefined,
                    take: 20,
                    categories: ["contract"],
                } satisfies Parameters<typeof getDocumentDirectory>[0]

                const res = await getDocumentDirectory(input)
                if (!res.success) {
                    setLinkResults([])
                    return
                }
                if (res.data.length === 0) {
                    const fallback = await getDocumentDirectory({ ...input, categories: undefined })
                    if (fallback.success) {
                        setLinkResults(fallback.data)
                        return
                    }
                }
                setLinkResults(res.data)
            } catch {
                setLinkResults([])
            } finally {
                setLinkLoading(false)
            }
        }, 250)
        return () => clearTimeout(t)
    }, [contract.caseId, linkOpen, linkQuery])

    const handleUnlink = async () => {
        if (!canEdit) return
        if (!contract.document) return
        try {
            const res = await unlinkContractDocument(contract.id)
            if (!res.success) {
                toast.error("取消关联失败", { description: res.error })
                return
            }
            toast.success("已取消关联合同文档")
            router.refresh()
        } catch (error) {
            toast.error("取消关联失败", { description: error instanceof Error ? error.message : "取消关联失败" })
        }
    }

    const handleLink = async () => {
        if (!canEdit) return
        if (!linkPickedId) return
        try {
            const res = await linkContractDocument(contract.id, linkPickedId)
            if (!res.success) {
                toast.error("关联失败", { description: res.error })
                return
            }
            toast.success("已关联合同文档")
            setLinkOpen(false)
            setLinkQuery("")
            setLinkPickedId(null)
            setLinkResults([])
            router.refresh()
        } catch (error) {
            toast.error("关联失败", { description: error instanceof Error ? error.message : "关联失败" })
        }
    }

    return (
        <Card className="h-full">
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                    <span>关联合同文档</span>
                    {contract.document ? <Badge variant="secondary">已关联</Badge> : <Badge variant="outline">未关联</Badge>}
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 space-y-3 overflow-auto">
                {contract.document ? (
                    <div className="rounded-md border bg-card/50 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <div className="font-medium truncate">{contract.document.title}</div>
                                <div className="text-xs text-muted-foreground truncate">{contract.document.fileType || "-"}</div>
                            </div>
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        </div>
                        <div className="flex items-center gap-2">
                            <Button asChild variant="outline" size="sm" className="w-full">
                                <Link href={`/documents/${contract.document.id}`}>查看文档</Link>
                            </Button>
                            {canEdit ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0"
                                    onClick={() => void handleUnlink()}
                                    title="取消关联"
                                >
                                    <Unlink2 className="h-4 w-4" />
                                </Button>
                            ) : null}
                        </div>
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground">
                        暂无关联合同文档。建议将合同扫描件/电子版上传到「文档中心」后再关联。
                    </div>
                )}

                {canEdit ? (
                    <Dialog
                        open={linkOpen}
                        onOpenChange={(v) => {
                            setLinkOpen(v)
                            if (v) {
                                setLinkQuery("")
                                setLinkPickedId(null)
                                setLinkResults([])
                            }
                        }}
                    >
                        <DialogTrigger asChild>
                            <Button variant="outline" className="w-full">
                                <Link2 className="h-4 w-4 mr-2" />
                                关联文档
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[720px]">
                            <DialogHeader>
                                <DialogTitle>关联合同文档</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3">
                                <div className="space-y-2">
                                    <div className="text-sm text-muted-foreground">
                                        默认优先展示该合同所属案件下「合同」分类文档；若无结果将回退展示全部文档。
                                    </div>
                                    <Input
                                        value={linkQuery}
                                        onChange={(e) => setLinkQuery(e.target.value)}
                                        placeholder="搜索文档标题 / 备注..."
                                    />
                                </div>
                                <div className="rounded-md border bg-card/50">
                                    <div className="px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
                                        <span>{linkLoading ? "加载中..." : `结果：${linkResults.length} 条`}</span>
                                        <span className="font-mono">{contract.case?.caseCode || contract.caseId || "-"}</span>
                                    </div>
                                    <Separator />
                                    <div className="max-h-[320px] overflow-auto">
                                        {linkResults.length === 0 ? (
                                            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                                                暂无匹配文档
                                            </div>
                                        ) : (
                                            linkResults.map((d) => (
                                                <button
                                                    key={d.id}
                                                    type="button"
                                                    className="w-full text-left px-3 py-2 hover:bg-accent flex items-start gap-2"
                                                    onClick={() => setLinkPickedId(d.id)}
                                                >
                                                    <div className="mt-0.5">
                                                        <input type="radio" checked={linkPickedId === d.id} readOnly />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-medium truncate">{d.title}</div>
                                                        <div className="text-xs text-muted-foreground truncate">
                                                            {d.case.caseCode ? `${d.case.caseCode} · ` : ""}
                                                            {d.case.title} · 更新于 {safeDateTime(d.updatedAt)}
                                                        </div>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setLinkOpen(false)}>
                                    取消
                                </Button>
                                <Button onClick={() => void handleLink()} disabled={!linkPickedId}>
                                    确认关联
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                ) : null}
            </CardContent>
        </Card>
    )
}

function ContractDangerZoneBlock(props: { contractId: string; contractNo: string; caseId: string | null; canEdit: boolean }) {
    const { contractId, contractNo, caseId, canEdit } = props

    const [deleteConfirmNo, setDeleteConfirmNo] = useState("")
    const [deleting, setDeleting] = useState(false)

    const handleDelete = async () => {
        if (!canEdit) return
        if (deleteConfirmNo.trim() !== contractNo) return
        setDeleting(true)
        try {
            const res = await deleteContract(contractId)
            if (!res.success) {
                toast.error("删除失败", { description: res.error })
                return
            }
            toast.success("合同已删除")
            window.location.assign(caseId ? `/cases/${caseId}` : "/admin/finance")
        } catch (error) {
            toast.error("删除失败", { description: error instanceof Error ? error.message : "删除失败" })
        } finally {
            setDeleting(false)
        }
    }

    return (
        <Card className="h-full">
            <CardHeader className="pb-3">
                <CardTitle className="text-base">危险操作</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 space-y-3 overflow-auto">
                <div className="text-sm text-muted-foreground">
                    将把该合同标记为已删除，并从默认列表中隐藏。管理员可在「后台管理 → 回收站」恢复。
                </div>

                {canEdit ? (
                    <AlertDialog
                        onOpenChange={(open) => {
                            if (open) setDeleteConfirmNo("")
                        }}
                    >
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" className="w-full" disabled={deleting}>
                                <Trash2 className="h-4 w-4 mr-2" />
                                删除合同
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>确认删除合同？</AlertDialogTitle>
                                <AlertDialogDescription>
                                    将把该合同标记为已删除，并从默认列表中隐藏。管理员可在「后台管理 → 回收站」恢复。
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="space-y-2">
                                <div className="text-sm text-muted-foreground">
                                    请输入合同编号 <span className="font-mono">{contractNo}</span> 以确认删除
                                </div>
                                <Input value={deleteConfirmNo} onChange={(e) => setDeleteConfirmNo(e.target.value)} />
                            </div>
                            <AlertDialogFooter>
                                <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
                                <AlertDialogAction
                                    disabled={deleting || deleteConfirmNo.trim() !== contractNo}
                                    onClick={(e) => {
                                        e.preventDefault()
                                        void handleDelete()
                                    }}
                                >
                                    {deleting ? "删除中..." : "删除"}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                ) : (
                    <div className="text-sm text-muted-foreground">无权限 执行删除操作</div>
                )}
            </CardContent>
        </Card>
    )
}

export function ContractDetailClient(props: { contract: ContractDetail }) {
    const router = useRouter()
    const { can } = usePermission()
    const canEdit = can("billing:edit")

    const [status, setStatus] = useState<ContractStatus>(props.contract.status)
    const [savingStatus, setSavingStatus] = useState(false)

    useEffect(() => {
        setStatus(props.contract.status)
    }, [props.contract.status])

    const statusLabel = useMemo(() => CONTRACT_STATUS_META[status]?.label || status, [status])

    const handleUpdateStatus = async (next: ContractStatus) => {
        if (!canEdit) return
        setStatus(next)
        setSavingStatus(true)
        try {
            const res = await updateContractStatus(props.contract.id, next)
            if (!res.success) {
                toast.error("更新失败", { description: res.error })
                setStatus(props.contract.status)
                return
            }
            toast.success("已更新状态")
            router.refresh()
        } catch (error) {
            toast.error("更新失败", { description: error instanceof Error ? error.message : "更新失败" })
            setStatus(props.contract.status)
        } finally {
            setSavingStatus(false)
        }
    }

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_contract_header",
            title: "导航与状态",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 3, minW: 8, minH: 3 },
            content: (
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <Button asChild variant="ghost" size="sm" className="gap-2">
                            <Link href="/admin/finance">
                                <ArrowLeft className="h-4 w-4" />
                                返回财务中心
                            </Link>
                        </Button>
                        <div className="min-w-0">
                            <div className="text-xs text-muted-foreground">合同详情</div>
                            <div className="text-lg font-semibold truncate">
                                <span className="font-mono">{props.contract.contractNo}</span>
                                <span className="mx-2 text-muted-foreground">··</span>
                                {props.contract.title}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline">{statusLabel}</Badge>
                        {canEdit ? (
                            <Select
                                value={status}
                                onValueChange={(v) => void handleUpdateStatus(v as ContractStatus)}
                                disabled={savingStatus}
                            >
                                <SelectTrigger className="w-[150px]">
                                    <SelectValue placeholder="更新状态" />
                                </SelectTrigger>
                                <SelectContent>
                                    {CONTRACT_STATUS_OPTIONS.map((value) => (
                                        <SelectItem key={value} value={value}>
                                            {CONTRACT_STATUS_META[value].label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : null}
                    </div>
                </div>
            ),
        },
        {
            id: "b_contract_info",
            title: "合同信息",
            chrome: "none",
            defaultSize: { w: 8, h: 14, minW: 6, minH: 10 },
            content: <ContractInfoBlock contract={props.contract} />,
        },
        {
            id: "b_contract_document",
            title: "关联合同文档",
            chrome: "none",
            defaultSize: { w: 4, h: 12, minW: 4, minH: 8 },
            content: <ContractDocumentLinkBlock contract={props.contract} canEdit={canEdit} />,
        },
        {
            id: "b_contract_danger",
            title: "危险操作",
            chrome: "none",
            defaultSize: { w: 4, h: 10, minW: 4, minH: 8 },
            content: (
                <ContractDangerZoneBlock
                    contractId={props.contract.id}
                    contractNo={props.contract.contractNo}
                    caseId={props.contract.caseId}
                    canEdit={canEdit}
                />
            ),
        },
    ]

    return <SectionWorkspace title="合同工作台" sectionId="contract_detail" entityId={props.contract.id} catalog={catalog} />
}
