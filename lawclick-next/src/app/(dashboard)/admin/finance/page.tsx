import { getContracts } from "@/actions/contract-actions"
import { getExpenses, getInvoiceStats, getInvoices } from "@/actions/finance-actions"
import { FinanceCenterClient } from "@/components/admin/FinanceCenterClient"

export const dynamic = "force-dynamic"

export default async function FinancePage() {
    const [invoicesResult, statsResult, expensesResult, contractsResult] = await Promise.all([
        getInvoices(),
        getInvoiceStats(),
        getExpenses(),
        getContracts(),
    ])

    const invoices = invoicesResult.success ? invoicesResult.data : []
    const stats = statsResult.success ? statsResult.data : null
    const expenses = expensesResult.success ? expensesResult.data : []
    const contracts = contractsResult.success ? contractsResult.data : []

    return <FinanceCenterClient invoices={invoices} expenses={expenses} contracts={contracts} stats={stats} />
}
