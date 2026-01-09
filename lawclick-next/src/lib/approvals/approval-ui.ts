import type { ApprovalType } from "@prisma/client"
import { Calendar, FileCheck, FileText, MoreHorizontal, Receipt, ShoppingCart } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { UiTone } from "@/lib/ui/tone"

export type BadgeVariant = "default" | "secondary" | "success" | "warning" | "info" | "destructive" | "outline"

export const APPROVAL_TYPE_META: Record<ApprovalType, { label: string; icon: LucideIcon; tone: UiTone }> = {
    LEAVE: { label: "请假申请", icon: Calendar, tone: "info" },
    EXPENSE: { label: "报销申请", icon: Receipt, tone: "warning" },
    PURCHASE: { label: "采购申请", icon: ShoppingCart, tone: "default" },
    CONTRACT: { label: "合同审批", icon: FileText, tone: "secondary" },
    INVOICE: { label: "发票申请", icon: FileCheck, tone: "success" },
    OTHER: { label: "其他审批", icon: MoreHorizontal, tone: "secondary" },
}

export const APPROVAL_STATUS_META: Record<string, { label: string; badgeVariant: BadgeVariant }> = {
    DRAFT: { label: "草稿", badgeVariant: "secondary" },
    PENDING: { label: "待审批", badgeVariant: "warning" },
    APPROVED: { label: "已批准", badgeVariant: "success" },
    REJECTED: { label: "已驳回", badgeVariant: "destructive" },
    CANCELLED: { label: "已撤回", badgeVariant: "secondary" },
}

export function safeCurrency(amount?: unknown) {
    if (amount === null || amount === undefined) return ""
    const num = typeof amount === "number" ? amount : Number(amount)
    if (!Number.isFinite(num)) return ""
    return `¥${num.toLocaleString()}`
}

