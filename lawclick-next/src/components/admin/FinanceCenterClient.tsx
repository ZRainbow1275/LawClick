"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type { ContractStatus, InvoiceStatus, PaymentMethod } from "@/lib/prisma-browser"
import {
    AlertCircle,
    Clock,
    DollarSign,
    FileText,
    Receipt,
    ShieldCheck,
} from "lucide-react"

import { deleteContract, updateContractStatus } from "@/actions/contract-actions"
import type { getContracts } from "@/actions/contract-actions"
import { getPayments, updateInvoiceStatus } from "@/actions/finance-actions"
import type { getExpenses, getInvoiceStats, getInvoices } from "@/actions/finance-actions"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent } from "@/components/ui/Card"
import {
    CONTRACT_STATUS_META,
    CONTRACT_STATUS_OPTIONS,
    INVOICE_STATUS_META,
    INVOICE_STATUS_OPTIONS,
    resolveContractStatusMeta,
    resolveInvoiceStatusMeta,
} from "@/lib/finance/status-meta"
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
import { Input } from "@/components/ui/Input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs"  
import { usePermission } from "@/hooks/use-permission"
import { CreateContractDialog } from "@/components/finance/CreateContractDialog"
import { CreateExpenseDialog } from "@/components/finance/CreateExpenseDialog"  
import { CreateInvoiceDialog } from "@/components/finance/CreateInvoiceDialog"
import { RecordPaymentDialog } from "@/components/finance/RecordPaymentDialog"
import { LegoDeck } from "@/components/layout/LegoDeck"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"

function sumPayments(payments: Array<{ amount: unknown }> | undefined) {        
    if (!payments) return 0
    return payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
}

function DeleteContractDialogButton(props: { contractId: string; contractNo: string; disabled?: boolean }) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [confirmNo, setConfirmNo] = useState("")
    const [deleting, setDeleting] = useState(false)

    const handleDelete = async () => {
        if (confirmNo.trim() !== props.contractNo) return
        setDeleting(true)
        try {
            const res = await deleteContract(props.contractId)
            if (!res.success) {
                toast.error("删除失败", { description: res.error })
                return
            }
            toast.success("合同已删除")
            setOpen(false)
            setConfirmNo("")
            router.refresh()
        } catch (error) {
            toast.error("删除失败", { description: error instanceof Error ? error.message : "删除失败" })
        } finally {
            setDeleting(false)
        }
    }

    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next)
                if (next) setConfirmNo("")
            }}
        >
            <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="mt-2 w-full" disabled={props.disabled || deleting}>
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
                        请输入合同编号 <span className="font-mono">{props.contractNo}</span> 以确认删除
                    </div>
                    <Input value={confirmNo} onChange={(e) => setConfirmNo(e.target.value)} />
                </div>

                <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault()
                            void handleDelete()
                        }}
                        disabled={deleting || confirmNo.trim() !== props.contractNo}
                    >
                        {deleting ? "删除中..." : "确认删除"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

type InvoiceListItem = Extract<Awaited<ReturnType<typeof getInvoices>>, { success: true }>["data"][number]
type ExpenseListItem = Extract<Awaited<ReturnType<typeof getExpenses>>, { success: true }>["data"][number]
type ContractListItem = Extract<Awaited<ReturnType<typeof getContracts>>, { success: true }>["data"][number]
type InvoiceStats = Extract<Awaited<ReturnType<typeof getInvoiceStats>>, { success: true }>["data"]

type PaymentListItem = Extract<Awaited<ReturnType<typeof getPayments>>, { success: true }>["data"][number]

type FinanceTab = "invoices" | "payments" | "expenses" | "contracts"

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
    BANK: "银行转账",
    CASH: "现金",
    CHECK: "支票",
    ONLINE: "在线支付",
    OTHER: "其他",
}

export function FinanceCenterClient({
    invoices,
    expenses,
    contracts,
    stats,
}: {
    invoices: InvoiceListItem[]
    expenses: ExpenseListItem[]
    contracts: ContractListItem[]
    stats: InvoiceStats | null
}) {
    const router = useRouter()
    const { can } = usePermission()
    const canEdit = can("billing:edit")

    const [tab, setTab] = useState<FinanceTab>("invoices")

    const [updatingInvoiceId, setUpdatingInvoiceId] = useState<string | null>(null)
    const [optimisticInvoiceStatus, setOptimisticInvoiceStatus] = useState<Record<string, string>>({})

    const [payments, setPayments] = useState<PaymentListItem[]>([])
    const [paymentsLoading, setPaymentsLoading] = useState(false)
    const [paymentsError, setPaymentsError] = useState<string | null>(null)
    const [paymentsLoaded, setPaymentsLoaded] = useState(false)

    const [updatingContractId, setUpdatingContractId] = useState<string | null>(null)
    const [optimisticContractStatus, setOptimisticContractStatus] = useState<Record<string, string>>({})

    const refreshPayments = useCallback(async () => {
        setPaymentsLoading(true)
        setPaymentsError(null)
        try {
            const res = await getPayments()
            if (!res.success) {
                setPayments([])
                setPaymentsError(res.error || "加载收款记录失败")
                return
            }
            setPayments(res.data)
            setPaymentsLoaded(true)
        } catch (error) {
            setPayments([])
            setPaymentsError(error instanceof Error ? error.message : "加载收款记录失败")
        } finally {
            setPaymentsLoading(false)
        }
    }, [])

    useEffect(() => {
        if (tab !== "payments" || paymentsLoaded) return
        void refreshPayments()
    }, [paymentsLoaded, refreshPayments, tab])

    const totalAmount = useMemo(() => Number(stats?.totalAmount || 0), [stats])
    const pendingAmount = useMemo(() => Number(stats?.pendingAmount || 0), [stats])
    const paidAmount = useMemo(() => Number(stats?.paidAmount || 0), [stats])
    const overdueAmount = useMemo(() => Number(stats?.overdueAmount || 0), [stats])

    return (
        <SectionWorkspace
            title="财务中心"
            sectionId="admin_finance"
            className="h-full"
            catalog={[
                {
                    id: "b_finance_header",
                    title: "概览",
                    pinned: true,
                    chrome: "none",
                    defaultSize: { w: 12, h: 4, minW: 8, minH: 3 },
                    content: (
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h1 className="text-2xl font-bold">财务中心</h1>
                                <p className="text-muted-foreground">发票管理、收款跟进、费用台账与合同台账</p>
                            </div>
                            <div className="flex gap-2 flex-wrap justify-end">
                                <CreateExpenseDialog triggerVariant="outline" />
                                <CreateInvoiceDialog />
                                <CreateContractDialog
                                    triggerVariant="outline"
                                    triggerLabel="创建合同"
                                />
                            </div>
                        </div>
                    ),
                },
                {
                    id: "b_finance_stats",
                    title: "统计",
                    chrome: "none",
                    defaultSize: { w: 12, h: 6, minW: 8, minH: 5 },
                    content: stats ? (
                        <LegoDeck
                            title="统计卡片（可拖拽）"
                            sectionId="admin_finance_stats_cards"
                            rowHeight={28}
                            margin={[12, 12]}
                            catalog={[
                                {
                                    id: "b_finance_stat_total",
                                    title: "总应收",
                                    chrome: "none",
                                    defaultSize: { w: 3, h: 4, minW: 3, minH: 3 },
                                    content: (
                                        <Card className="h-full">
                                            <CardContent className="h-full p-6">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-sm text-muted-foreground">总应收</p>
                                                        <p className="text-2xl font-bold">
                                                            ￥{Number(totalAmount).toLocaleString()}
                                                        </p>
                                                    </div>
                                                    <div className="p-3 rounded-full bg-primary/10">
                                                        <DollarSign className="h-6 w-6 text-primary" />
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ),
                                },
                                {
                                    id: "b_finance_stat_pending",
                                    title: "待收款",
                                    chrome: "none",
                                    defaultSize: { w: 3, h: 4, minW: 3, minH: 3 },
                                    content: (
                                        <Card className="h-full">
                                            <CardContent className="h-full p-6">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-sm text-muted-foreground">待收款</p>
                                                        <p className="text-2xl font-bold text-warning">
                                                            ￥{Number(pendingAmount).toLocaleString()}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground mt-1">{stats.pendingCount} 张发票</p>
                                                    </div>
                                                    <div className="p-3 rounded-full bg-warning/10">
                                                        <Clock className="h-6 w-6 text-warning" />
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ),
                                },
                                {
                                    id: "b_finance_stat_paid",
                                    title: "已收款",
                                    chrome: "none",
                                    defaultSize: { w: 3, h: 4, minW: 3, minH: 3 },
                                    content: (
                                        <Card className="h-full">
                                            <CardContent className="h-full p-6">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-sm text-muted-foreground">已收款</p>
                                                        <p className="text-2xl font-bold text-success">
                                                            ￥{Number(paidAmount).toLocaleString()}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground mt-1">{stats.paidCount} 张发票</p>
                                                    </div>
                                                    <div className="p-3 rounded-full bg-success/10">
                                                        <ShieldCheck className="h-6 w-6 text-success" />
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ),
                                },
                                {
                                    id: "b_finance_stat_overdue",
                                    title: "逾期",
                                    chrome: "none",
                                    defaultSize: { w: 3, h: 4, minW: 3, minH: 3 },
                                    content: (
                                        <Card className="h-full">
                                            <CardContent className="h-full p-6">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-sm text-muted-foreground">逾期</p>
                                                        <p className="text-2xl font-bold text-destructive">
                                                            ￥{Number(overdueAmount).toLocaleString()}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground mt-1">{stats.overdueCount} 张发票</p>
                                                    </div>
                                                    <div className="p-3 rounded-full bg-destructive/10">
                                                        <AlertCircle className="h-6 w-6 text-destructive" />
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ),
                                },
                            ] satisfies SectionCatalogItem[]}
                        />
            ) : (
                        <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                            统计数据暂无或加载失败。发票、收款、费用等功能不受影响。
                        </div>
                    ),
                },
                {
                    id: "b_finance_main",
                    title: "发票/收款/费用/合同",
                    pinned: true,
                    chrome: "none",
                    defaultSize: { w: 12, h: 18, minW: 8, minH: 12 },
                    content: (
                        <Tabs value={tab} onValueChange={(value) => setTab(value as FinanceTab)} className="space-y-4">
                <TabsList>
                    <TabsTrigger value="invoices" className="gap-2">
                        发票 <Badge variant="secondary">{invoices.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="payments" className="gap-2">
                        收款 <Badge variant="secondary">{paymentsLoaded ? payments.length : "…"}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="expenses" className="gap-2">
                        费用 <Badge variant="secondary">{expenses.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="contracts" className="gap-2">
                        合同 <Badge variant="secondary">{contracts.length}</Badge>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="invoices" className="space-y-3">
                    {invoices.length > 0 ? (
                        invoices.map((invoice) => {
                            const status = resolveInvoiceStatusMeta(invoice.status)
                            const paid = sumPayments(invoice.payments)

                            return (
                                <Card key={invoice.id} className="hover:shadow-md transition-shadow">
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-medium truncate">{invoice.invoiceNo}</p>
                                                    <Badge variant={status.badgeVariant}>{status.label}</Badge>
                                                </div>
                                                <p className="text-sm text-muted-foreground mt-1 truncate">
                                                    {invoice.case ? (
                                                        <Link href={`/cases/${invoice.case.id}`} className="hover:underline text-primary">
                                                            {invoice.case.caseCode || "案件"} · {invoice.case.title}
                                                        </Link>
                                                    ) : invoice.client ? (
                                                        <Link href={`/crm/customers/${invoice.client.id}`} className="hover:underline text-primary">
                                                            {invoice.client.name}
                                                        </Link>
                                                    ) : (
                                                        "未关联"
                                                    )}
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-lg font-bold">￥{Number(invoice.totalAmount).toLocaleString()}</p>
                                                {paid > 0 && paid < Number(invoice.totalAmount) ? (
                                                    <p className="text-xs text-success">已收 ￥{paid.toLocaleString()}</p>
                                                ) : null}
                                                {invoice.dueDate ? (
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        截止 {new Date(invoice.dueDate).toLocaleDateString("zh-CN")}
                                                    </p>
                                                ) : null}
                                            </div>
                                        </div>

                                        <div className="flex gap-2 mt-3">
                                            {canEdit ? (
                                                <>
                                                    <RecordPaymentDialog invoiceId={invoice.id} />
                                                    <select
                                                        value={optimisticInvoiceStatus[invoice.id] ?? invoice.status}
                                                        className="h-9 rounded-md border bg-background px-2 text-sm"
                                                        disabled={updatingInvoiceId === invoice.id || paid > 0}
                                                        onChange={async (e) => {
                                                            const next = e.target.value
                                                            setOptimisticInvoiceStatus((prev) => ({ ...prev, [invoice.id]: next }))
                                                            setUpdatingInvoiceId(invoice.id)
                                                            try {
                                                                const res = await updateInvoiceStatus(invoice.id, next as InvoiceStatus)
                                                                if (!res.success) {
                                                                    toast.error("更新失败", { description: res.error })
                                                                    setOptimisticInvoiceStatus((prev) => {
                                                                        const copy = { ...prev }
                                                                        delete copy[invoice.id]
                                                                        return copy
                                                                    })
                                                                    return
                                                                }
                                                                toast.success("已更新状态")
                                                                router.refresh()
                                                            } finally {
                                                                setUpdatingInvoiceId(null)
                                                            }
                                                        }}
                                                    >
                                                        {INVOICE_STATUS_OPTIONS.map((k) => (
                                                            <option
                                                                key={k}
                                                                value={k}
                                                                disabled={paid === 0 && (k === "PAID" || k === "PARTIAL")}
                                                            >
                                                                {INVOICE_STATUS_META[k].label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </>
                                            ) : null}
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })
                    ) : (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                                <p className="text-lg font-medium">暂无发票</p>
                                <p className="text-muted-foreground">点击右上角“创建发票”开始</p>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="payments" className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-sm text-muted-foreground">按收款日期倒序展示（跨发票汇总）。</div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                setPaymentsLoaded(false)
                                void refreshPayments()
                            }}
                            disabled={paymentsLoading}
                        >
                            刷新
                        </Button>
                    </div>

                    {paymentsError ? (
                        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                            加载失败：{paymentsError}
                        </div>
                    ) : null}

                    {paymentsLoading ? (
                        <Card>
                            <CardContent className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                                加载中...
                            </CardContent>
                        </Card>
                    ) : payments.length > 0 ? (
                        payments.map((p) => (
                            <Card key={p.id} className="hover:shadow-md transition-shadow">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium truncate">{p.invoice.invoiceNo}</p>
                                                <Badge variant="outline">
                                                    {PAYMENT_METHOD_LABELS[p.method] || p.method}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-muted-foreground mt-1 truncate">
                                                {p.invoice.case ? (
                                                    <Link
                                                        href={`/cases/${p.invoice.case.id}`}
                                                        className="hover:underline text-primary"
                                                    >
                                                        {p.invoice.case.caseCode || "案件"} · {p.invoice.case.title}
                                                    </Link>
                                                ) : p.invoice.client ? (
                                                    <Link
                                                        href={`/crm/customers/${p.invoice.client.id}`}
                                                        className="hover:underline text-primary"
                                                    >
                                                        {p.invoice.client.name}
                                                    </Link>
                                                ) : (
                                                    "未关联"
                                                )}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                收款日期 {new Date(p.receivedAt).toLocaleDateString("zh-CN")}
                                                {p.reference ? ` • 参考号 ${p.reference}` : ""}
                                            </p>
                                            {p.note ? (
                                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                    备注：{p.note}
                                                </p>
                                            ) : null}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-lg font-bold">￥{Number(p.amount).toLocaleString()}</p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                发票金额 ￥{Number(p.invoice.totalAmount).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    ) : (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <Receipt className="h-12 w-12 text-muted-foreground mb-4" />
                                <p className="text-lg font-medium">暂无收款记录</p>
                                <p className="text-muted-foreground">可在“发票”页签中点击“记录收款”添加</p>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="expenses" className="space-y-3">
                    {expenses.length > 0 ? (
                        expenses.map((expense) => (
                            <Card key={expense.id} className="hover:shadow-md transition-shadow">
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className="p-2 rounded-lg bg-primary/10">
                                                <Receipt className="h-5 w-5 text-primary-600" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-medium truncate">{expense.category}</p>
                                                <p className="text-sm text-muted-foreground truncate">
                                                    {expense.user?.name || "未知"} ·{" "}
                                                    {expense.case ? (
                                                        <Link href={`/cases/${expense.case.id}`} className="hover:underline text-primary">
                                                            {expense.case.title}
                                                        </Link>
                                                    ) : (
                                                        "无关联案件"
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-lg font-bold">￥{Number(expense.amount).toLocaleString()}</p>
                                            <Badge variant="outline">{expense.status}</Badge>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 mt-3">
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    ) : (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <Receipt className="h-12 w-12 text-muted-foreground mb-4" />
                                <p className="text-lg font-medium">暂无费用记录</p>
                                <p className="text-muted-foreground">点击右上角“记录费用”开始</p>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                <TabsContent value="contracts" className="space-y-3">
                    {contracts.length > 0 ? (
                        contracts.map((c) => {
                            const status = resolveContractStatusMeta(c.status)
                            return (
                                <Card key={c.id} className="hover:shadow-md transition-shadow">
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <Link href={`/contracts/${c.id}`} className="font-medium truncate hover:underline text-primary">
                                                        {c.contractNo}
                                                    </Link>
                                                    <Badge variant={status.badgeVariant}>{status.label}</Badge>
                                                </div>
                                                <p className="text-sm mt-1 truncate">{c.title}</p>
                                                <p className="text-xs text-muted-foreground mt-1 truncate">
                                                    {c.case ? (
                                                        <Link href={`/cases/${c.case.id}`} className="hover:underline text-primary">
                                                            {c.case.caseCode || "案件"} · {c.case.title}
                                                        </Link>
                                                    ) : c.client ? (
                                                        <Link href={`/crm/customers/${c.client.id}`} className="hover:underline text-primary">
                                                            {c.client.name}
                                                        </Link>
                                                    ) : (
                                                        "未关联"
                                                    )}
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-lg font-bold">{c.amount ? `￥${Number(c.amount).toLocaleString()}` : "-"}</p>
                                                {canEdit ? (
                                                    <>
                                                        <select
                                                            value={optimisticContractStatus[c.id] ?? c.status}
                                                            className="mt-2 h-9 rounded-md border bg-background px-2 text-sm"
                                                            disabled={updatingContractId === c.id}
                                                            onChange={async (e) => {
                                                                const next = e.target.value
                                                                setOptimisticContractStatus((prev) => ({ ...prev, [c.id]: next }))
                                                                setUpdatingContractId(c.id)
                                                                try {
                                                                    const res = await updateContractStatus(c.id, next as ContractStatus)
                                                                    if (!res.success) {
                                                                        toast.error("更新失败", { description: res.error })
                                                                        setOptimisticContractStatus((prev) => {
                                                                            const copy = { ...prev }
                                                                            delete copy[c.id]
                                                                            return copy
                                                                        })
                                                                        return
                                                                    }
                                                                    toast.success("已更新状态")
                                                                    router.refresh()
                                                                } finally {
                                                                    setUpdatingContractId(null)
                                                                }
                                                            }}
                                                        >
                                                            {CONTRACT_STATUS_OPTIONS.map((k) => (
                                                                <option key={k} value={k}>
                                                                    {CONTRACT_STATUS_META[k].label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <DeleteContractDialogButton
                                                            contractId={c.id}
                                                            contractNo={c.contractNo}
                                                            disabled={updatingContractId === c.id}
                                                        />
                                                    </>
                                                ) : null}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )
                        })
                    ) : (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12">
                                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                                <p className="text-lg font-medium">暂无合同</p>
                                <p className="text-muted-foreground">点击右上角“创建合同”开始</p>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>
            </Tabs>
                    ),
                },
            ]}
        />
    )
}
