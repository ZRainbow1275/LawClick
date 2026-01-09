"use client"

import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { Clock, FileCheck, Receipt, RefreshCw, User } from "lucide-react"

import { getApprovalsByCase, cancelRequest } from "@/actions/approval-actions"
import { getCaseBilling, getCaseBillingDetails, type BillingDetail, type BillingSummary } from "@/actions/billing-actions"
import { getContracts } from "@/actions/contract-actions"
import { getExpenses, getInvoices } from "@/actions/finance-actions"
import { CreateApprovalDialog } from "@/components/approvals/CreateApprovalDialog"
import { CreateContractDialog } from "@/components/finance/CreateContractDialog"
import { CreateExpenseDialog } from "@/components/finance/CreateExpenseDialog"
import { CreateInvoiceDialog } from "@/components/finance/CreateInvoiceDialog"
import { RecordPaymentDialog } from "@/components/finance/RecordPaymentDialog"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/Table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs"
import { usePermission } from "@/hooks/use-permission"
import { LegoDeck } from "@/components/layout/LegoDeck"
import type { SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { resolveContractStatusMeta, resolveInvoiceStatusMeta } from "@/lib/finance/status-meta"

interface CaseBillingTabProps {
    caseId: string
}

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>

type PaymentLike = { amount: unknown }

type InvoiceItem = {
    id: string
    invoiceNo: string
    totalAmount: unknown
    status: string
    dueDate: Date | string | null
    payments?: PaymentLike[] | null
}

type ExpenseItem = {
    id: string
    expenseDate?: Date | string | null
    category?: string | null
    description?: string | null
    amount: unknown
    status: string
    user?: { name?: string | null } | null
}

type ApprovalItem = {
    id: string
    type: string
    title: string
    amount?: unknown | null
    status: string
    requesterId?: string | null
    requester?: { name?: string | null } | null
    approver?: { name?: string | null } | null
}

type ContractItem = {
    id: string
    contractNo: string
    title: string
    amount?: unknown | null
    status: string
    signedAt?: Date | string | null
}


const EXPENSE_STATUS_CONFIG: Record<string, { label: string; badgeVariant: BadgeVariant }> = {
    PENDING: { label: "待审批", badgeVariant: "warning" },
    APPROVED: { label: "已批准", badgeVariant: "success" },
    REJECTED: { label: "已驳回", badgeVariant: "destructive" },
    REIMBURSED: { label: "已报销", badgeVariant: "info" },
}

const APPROVAL_STATUS_CONFIG: Record<string, { label: string; badgeVariant: BadgeVariant }> = {
    DRAFT: { label: "草稿", badgeVariant: "secondary" },
    PENDING: { label: "待审批", badgeVariant: "warning" },
    APPROVED: { label: "已批准", badgeVariant: "success" },
    REJECTED: { label: "已驳回", badgeVariant: "destructive" },
    CANCELLED: { label: "已撤回", badgeVariant: "secondary" },
}


const APPROVAL_TYPE_LABEL: Record<string, string> = {
    LEAVE: "请假",
    EXPENSE: "报销",
    PURCHASE: "采购",
    CONTRACT: "合同",
    INVOICE: "发票",
    OTHER: "其他",
}

function toNumber(value: unknown) {
    const num = typeof value === "number" ? value : Number(value)
    return Number.isFinite(num) ? num : 0
}

function sumPayments(payments: PaymentLike[] | null | undefined) {
    return (payments ?? []).reduce((sum, p) => sum + toNumber(p.amount), 0)
}

export function CaseBillingTab({ caseId }: CaseBillingTabProps) {
    const router = useRouter()
    const { data: session } = useSession()
    const currentUserId = (() => {
        const user = session?.user as unknown
        if (!user || typeof user !== "object") return undefined
        const id = (user as { id?: unknown }).id
        return typeof id === "string" ? id : undefined
    })()
    const { can } = usePermission()

    const [summary, setSummary] = useState<BillingSummary | null>(null)
    const [details, setDetails] = useState<BillingDetail[]>([])
    const [invoices, setInvoices] = useState<InvoiceItem[]>([])
    const [expenses, setExpenses] = useState<ExpenseItem[]>([])
    const [approvals, setApprovals] = useState<ApprovalItem[]>([])
    const [contracts, setContracts] = useState<ContractItem[]>([])
    const [loading, setLoading] = useState(true)

    const formatCurrency = (value: unknown) => {
        return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(toNumber(value))
    }

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [summaryResult, detailsResult, invoicesResult, expensesResult, approvalsResult, contractsResult] =
                await Promise.all([
                    getCaseBilling(caseId),
                    getCaseBillingDetails(caseId),
                    getInvoices({ caseId }),
                    getExpenses({ caseId }),
                    getApprovalsByCase(caseId),
                    getContracts({ caseId }),
                ])

            setSummary(summaryResult.success ? summaryResult.data : null)
            setDetails(detailsResult.success ? detailsResult.data : [])
            setInvoices(invoicesResult.success ? invoicesResult.data : [])
            setExpenses(expensesResult.success ? expensesResult.data : [])
            setApprovals(approvalsResult.success ? approvalsResult.data : [])
            setContracts(contractsResult.success ? contractsResult.data : [])
        } catch {
            toast.error("加载失败", { description: "请稍后重试" })
        } finally {
            setLoading(false)
        }
    }, [caseId])

    useEffect(() => {
        void loadData()
    }, [loadData])

    const canBillingCreate = can("billing:create")
    const canBillingEdit = can("billing:edit")
    const canApprovalCreate = can("approval:create")

    const invoiceTotals = useMemo(() => {
        const total = invoices.reduce((sum, inv) => sum + toNumber(inv.totalAmount), 0)
        const paid = invoices.reduce((sum, inv) => sum + sumPayments(inv.payments), 0)
        return { total, paid, outstanding: Math.max(0, total - paid) }
    }, [invoices])

    const expenseTotal = useMemo(() => expenses.reduce((sum, ex) => sum + toNumber(ex.amount), 0), [expenses])

    const statsDeck = [
        {
            id: "b_case_billing_total_hours",
            title: "总工时",
            chrome: "none",
            defaultSize: { w: 3, h: 4, minW: 3, minH: 3 },
            content: (
                <Card className="h-full">
                    <CardContent className="h-full pt-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                            <Clock className="h-4 w-4" />
                            总工时
                        </div>
                        <div className="text-2xl font-bold">
                            {summary?.totalHours || 0} <span className="text-sm font-normal">小时</span>
                        </div>
                    </CardContent>
                </Card>
            ),
        },
        {
            id: "b_case_billing_billable_hours",
            title: "可计费工时",
            chrome: "none",
            defaultSize: { w: 3, h: 4, minW: 3, minH: 3 },
            content: (
                <Card className="h-full">
                    <CardContent className="h-full pt-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                            <Clock className="h-4 w-4" />
                            可计费工时
                        </div>
                        <div className="text-2xl font-bold text-success">
                            {summary?.billableHours || 0}{" "}
                            <span className="text-sm font-normal">小时</span>
                        </div>
                    </CardContent>
                </Card>
            ),
        },
        {
            id: "b_case_billing_invoice_totals",
            title: "发票应收",
            chrome: "none",
            defaultSize: { w: 3, h: 4, minW: 3, minH: 3 },
            content: (
                <Card className="h-full">
                    <CardContent className="h-full pt-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                            <FileCheck className="h-4 w-4" />
                            发票应收
                        </div>
                        <div className="text-2xl font-bold">{formatCurrency(invoiceTotals.total)}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                            已收 {formatCurrency(invoiceTotals.paid)} · 待收 {formatCurrency(invoiceTotals.outstanding)}
                        </div>
                    </CardContent>
                </Card>
            ),
        },
        {
            id: "b_case_billing_expenses",
            title: "费用合计",
            chrome: "none",
            defaultSize: { w: 3, h: 4, minW: 3, minH: 3 },
            content: (
                <Card className="h-full">
                    <CardContent className="h-full pt-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                            <Receipt className="h-4 w-4" />
                            费用合计
                        </div>
                        <div className="text-2xl font-bold text-primary-600">{formatCurrency(expenseTotal)}</div>
                    </CardContent>
                </Card>
            ),
        },
    ] satisfies SectionCatalogItem[]

    if (loading) {
        return (
            <Card>
                <CardContent className="py-8 text-center text-muted-foreground">加载中...</CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">案件账务</CardTitle>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                        await loadData()
                        router.refresh()
                    }}
                >
                    <RefreshCw className="h-4 w-4" />
                </Button>
            </CardHeader>
            <CardContent className="space-y-6">
                <LegoDeck
                    title="统计卡片（可拖拽）"
                    sectionId="case_billing_stats_cards"
                    entityId={caseId}
                    rowHeight={28}
                    margin={[12, 12]}
                    catalog={statsDeck}
                />

                <Tabs defaultValue="timelog" className="w-full">
                    <TabsList className="flex flex-wrap">
                        <TabsTrigger value="timelog">工时</TabsTrigger>
                        <TabsTrigger value="invoice">发票</TabsTrigger>
                        <TabsTrigger value="expense">费用</TabsTrigger>
                        <TabsTrigger value="approval">审批</TabsTrigger>
                        <TabsTrigger value="contract">合同</TabsTrigger>
                    </TabsList>

                    <TabsContent value="timelog" className="space-y-4">
                        <Tabs defaultValue="byUser">
                            <TabsList>
                                <TabsTrigger value="byUser">按人员</TabsTrigger>
                                <TabsTrigger value="details">明细</TabsTrigger>
                            </TabsList>

                            <TabsContent value="byUser">
                                {summary?.byUser && summary.byUser.length > 0 ? (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>人员</TableHead>
                                                <TableHead className="text-right">工时</TableHead>
                                                <TableHead className="text-right">金额</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {summary.byUser.map((item) => (
                                                <TableRow key={item.userId}>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <User className="h-4 w-4 text-muted-foreground" />
                                                            {item.userName}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">{item.hours}h</TableCell>
                                                    <TableCell className="text-right font-medium">{formatCurrency(item.amount)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                ) : (
                                    <div className="text-center py-8 text-muted-foreground">暂无数据</div>
                                )}
                            </TabsContent>

                            <TabsContent value="details">
                                {details.length > 0 ? (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>日期</TableHead>
                                                <TableHead>描述</TableHead>
                                                <TableHead>人员</TableHead>
                                                <TableHead className="text-right">工时</TableHead>
                                                <TableHead className="text-right">金额</TableHead>
                                                <TableHead>计费</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {details.map((item) => (
                                                <TableRow key={item.id}>
                                                    <TableCell className="text-sm">{new Date(item.date).toLocaleDateString("zh-CN")}</TableCell>
                                                    <TableCell>{item.description}</TableCell>
                                                    <TableCell>{item.userName}</TableCell>
                                                    <TableCell className="text-right">{item.hours}h</TableCell>
                                                    <TableCell className="text-right">{item.isBillable ? formatCurrency(item.amount) : "-"}</TableCell>
                                                    <TableCell>
                                                        <Badge variant={item.isBillable ? "default" : "secondary"}>
                                                            {item.isBillable ? "可计费" : "不计费"}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                ) : (
                                    <div className="text-center py-8 text-muted-foreground">暂无工时记录</div>
                                )}
                            </TabsContent>
                        </Tabs>
                    </TabsContent>

                    <TabsContent value="invoice" className="space-y-4">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div className="text-sm text-muted-foreground">共 {invoices.length} 张</div>
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                                {canBillingCreate ? <CreateInvoiceDialog caseId={caseId} onSuccess={loadData} /> : null}
                            </div>
                        </div>

                        {invoices.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>发票号</TableHead>
                                        <TableHead className="text-right">应收</TableHead>
                                        <TableHead className="text-right">已收</TableHead>
                                        <TableHead className="text-right">待收</TableHead>
                                        <TableHead>状态</TableHead>
                                        <TableHead>截止</TableHead>
                                        <TableHead className="text-right">操作</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {invoices.map((inv) => {
                                        const paid = sumPayments(inv.payments)
                                        const total = toNumber(inv.totalAmount)
                                        const outstanding = Math.max(0, total - paid)
                                        const status = resolveInvoiceStatusMeta(inv.status)

                                        return (
                                            <TableRow key={inv.id}>
                                                <TableCell className="font-medium">{inv.invoiceNo}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(inv.totalAmount)}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(paid)}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(outstanding)}</TableCell>
                                                <TableCell>
                                                    <Badge variant={status.badgeVariant}>{status.label}</Badge>
                                                </TableCell>
                                                <TableCell className="text-sm">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("zh-CN") : "-"}</TableCell>
                                                <TableCell className="text-right">
                                                    {canBillingEdit && inv.status !== "CANCELLED" && outstanding > 0 ? (
                                                        <RecordPaymentDialog invoiceId={inv.id} onSuccess={loadData} />
                                                    ) : (
                                                        <span className="text-sm text-muted-foreground">-</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        ) : (
                            <Card>
                                <CardContent className="py-10 text-center text-muted-foreground">暂无发票</CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    <TabsContent value="expense" className="space-y-4">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div className="text-sm text-muted-foreground">
                                共 {expenses.length} 笔 · 合计 {formatCurrency(expenseTotal)}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                                {canBillingCreate ? <CreateExpenseDialog caseId={caseId} onSuccess={loadData} /> : null}
                            </div>
                        </div>

                        {expenses.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>日期</TableHead>
                                        <TableHead>类别</TableHead>
                                        <TableHead>说明</TableHead>
                                        <TableHead>记录人</TableHead>
                                        <TableHead className="text-right">金额</TableHead>
                                        <TableHead>状态</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {expenses.map((ex) => {
                                        const status = EXPENSE_STATUS_CONFIG[ex.status] || { label: ex.status, badgeVariant: "secondary" }
                                        return (
                                            <TableRow key={ex.id}>
                                                <TableCell className="text-sm">{ex.expenseDate ? new Date(ex.expenseDate).toLocaleDateString("zh-CN") : "-"}</TableCell>
                                                <TableCell className="font-medium">{ex.category}</TableCell>
                                                <TableCell className="text-sm text-muted-foreground">{ex.description || "-"}</TableCell>
                                                <TableCell className="text-sm">{ex.user?.name || "-"}</TableCell>
                                                <TableCell className="text-right font-medium">{formatCurrency(ex.amount)}</TableCell>
                                                <TableCell>
                                                    <Badge variant={status.badgeVariant}>{status.label}</Badge>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        ) : (
                            <Card>
                                <CardContent className="py-10 text-center text-muted-foreground">暂无费用记录</CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    <TabsContent value="approval" className="space-y-4">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div className="text-sm text-muted-foreground">共 {approvals.length} 条</div>
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                                {canApprovalCreate ? <CreateApprovalDialog caseId={caseId} onSuccess={loadData} /> : null}
                            </div>
                        </div>

                        {approvals.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>类型</TableHead>
                                        <TableHead>标题</TableHead>
                                        <TableHead className="text-right">金额</TableHead>
                                        <TableHead>状态</TableHead>
                                        <TableHead>申请人</TableHead>
                                        <TableHead>审批人</TableHead>
                                        <TableHead className="text-right">操作</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {approvals.map((a) => {
                                        const status = APPROVAL_STATUS_CONFIG[a.status] || { label: a.status, badgeVariant: "secondary" }
                                        const typeLabel = APPROVAL_TYPE_LABEL[a.type] || a.type
                                        const canWithdraw = Boolean(
                                            currentUserId &&
                                                a.requesterId === currentUserId &&
                                                (a.status === "PENDING" || a.status === "DRAFT")
                                        )

                                        return (
                                            <TableRow key={a.id}>
                                                <TableCell className="text-sm">{typeLabel}</TableCell>
                                                <TableCell className="font-medium max-w-[360px] truncate">{a.title}</TableCell>
                                                <TableCell className="text-right">{a.amount ? formatCurrency(a.amount) : "-"}</TableCell>
                                                <TableCell>
                                                    <Badge variant={status.badgeVariant}>{status.label}</Badge>
                                                </TableCell>
                                                <TableCell className="text-sm">{a.requester?.name || "-"}</TableCell>
                                                <TableCell className="text-sm">{a.approver?.name || "任一审批人"}</TableCell>
                                                <TableCell className="text-right">
                                                    {canWithdraw ? (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={async () => {
                                                                const ok = window.confirm("确认撤回该审批？")
                                                                if (!ok) return
                                                                try {
                                                                    const res = await cancelRequest(a.id)
                                                                    if (!res.success) {
                                                                        toast.error("撤回失败", { description: res.error })
                                                                        return
                                                                    }
                                                                    toast.success("已撤回")
                                                                    await loadData()
                                                                    router.refresh()
                                                                } catch {
                                                                    toast.error("撤回失败")
                                                                }
                                                            }}
                                                        >
                                                            撤回
                                                        </Button>
                                                    ) : (
                                                        <span className="text-sm text-muted-foreground">-</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        ) : (
                            <Card>
                                <CardContent className="py-10 text-center text-muted-foreground">暂无审批</CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    <TabsContent value="contract" className="space-y-4">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div className="text-sm text-muted-foreground">共 {contracts.length} 份</div>
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                                {canBillingCreate ? <CreateContractDialog caseId={caseId} onSuccess={loadData} /> : null}
                            </div>
                        </div>

                        {contracts.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>合同号</TableHead>
                                        <TableHead>标题</TableHead>
                                        <TableHead className="text-right">金额</TableHead>
                                        <TableHead>状态</TableHead>
                                        <TableHead>签署日期</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {contracts.map((c) => {
                                        const status = resolveContractStatusMeta(c.status)
                                        return (
                                            <TableRow key={c.id}>
                                                <TableCell className="font-medium">
                                                    <Link href={`/contracts/${c.id}`} className="hover:underline text-primary">
                                                        {c.contractNo}
                                                    </Link>
                                                </TableCell>
                                                <TableCell className="max-w-[420px] truncate">{c.title}</TableCell>
                                                <TableCell className="text-right">{c.amount ? formatCurrency(c.amount) : "-"}</TableCell>
                                                <TableCell>
                                                    <Badge variant={status.badgeVariant}>{status.label}</Badge>
                                                </TableCell>
                                                <TableCell className="text-sm">{c.signedAt ? new Date(c.signedAt).toLocaleDateString("zh-CN") : "-"}</TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        ) : (
                            <Card>
                                <CardContent className="py-10 text-center text-muted-foreground">暂无合同</CardContent>
                            </Card>
                        )}
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    )
}
