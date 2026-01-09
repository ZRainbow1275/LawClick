import type { ContractStatus, InvoiceStatus } from "@prisma/client"

export type StatusBadgeVariant = "default" | "secondary" | "success" | "warning" | "info" | "destructive" | "outline"

export const INVOICE_STATUS_OPTIONS = ["DRAFT", "PENDING", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"] as const
export const CONTRACT_STATUS_OPTIONS = ["DRAFT", "SIGNED", "ACTIVE", "EXPIRED", "CANCELLED"] as const

export const INVOICE_STATUS_META = {
    DRAFT: { label: "草稿", badgeVariant: "secondary" },
    PENDING: { label: "待付款", badgeVariant: "warning" },
    PAID: { label: "已付款", badgeVariant: "success" },
    PARTIAL: { label: "部分付款", badgeVariant: "info" },
    OVERDUE: { label: "逾期", badgeVariant: "destructive" },
    CANCELLED: { label: "已取消", badgeVariant: "secondary" },
} as const satisfies Record<InvoiceStatus, { label: string; badgeVariant: StatusBadgeVariant }>

export const CONTRACT_STATUS_META = {
    DRAFT: { label: "草稿", badgeVariant: "secondary" },
    SIGNED: { label: "已签署", badgeVariant: "info" },
    ACTIVE: { label: "生效中", badgeVariant: "success" },
    EXPIRED: { label: "已到期", badgeVariant: "warning" },
    CANCELLED: { label: "已作废", badgeVariant: "secondary" },
} as const satisfies Record<ContractStatus, { label: string; badgeVariant: StatusBadgeVariant }>

export function resolveInvoiceStatusMeta(status: string | null | undefined) {
    const raw = (status || "").trim()
    if (!raw) return INVOICE_STATUS_META.DRAFT
    const key = raw.toUpperCase()
    const record = INVOICE_STATUS_META as Record<string, { label: string; badgeVariant: StatusBadgeVariant }>
    return record[key] ?? { label: raw, badgeVariant: "secondary" }
}

export function resolveContractStatusMeta(status: string | null | undefined) {
    const raw = (status || "").trim()
    if (!raw) return CONTRACT_STATUS_META.DRAFT
    const key = raw.toUpperCase()
    const record = CONTRACT_STATUS_META as Record<string, { label: string; badgeVariant: StatusBadgeVariant }>
    return record[key] ?? { label: raw, badgeVariant: "secondary" }
}
