import type { CustomerGrade, CustomerStage } from "@prisma/client"

import type { BadgeVariant as UiBadgeVariant } from "@/lib/ui/badge-variant"

export type BadgeVariant = UiBadgeVariant

export type CustomerStageMeta = {
    label: string
    badgeVariant: BadgeVariant
}

export type CustomerGradeMeta = {
    label: string
    badgeVariant: BadgeVariant
    iconBgClassName: string
    iconClassName: string
}

export const CUSTOMER_STAGE_OPTIONS = [
    "POTENTIAL",
    "CONTACTED",
    "NEGOTIATING",
    "QUOTING",
    "SIGNED",
    "LONG_TERM",
    "LOST",
] as const satisfies CustomerStage[]

export const CUSTOMER_GRADE_OPTIONS = ["VIP", "NORMAL", "POTENTIAL"] as const satisfies CustomerGrade[]

export const CUSTOMER_STAGE_META = {
    POTENTIAL: { label: "潜在", badgeVariant: "secondary" },
    CONTACTED: { label: "已接触", badgeVariant: "info" },
    NEGOTIATING: { label: "沟通中", badgeVariant: "warning" },
    QUOTING: { label: "报价中", badgeVariant: "warning" },
    SIGNED: { label: "已签约", badgeVariant: "success" },
    LONG_TERM: { label: "长期客户", badgeVariant: "default" },
    LOST: { label: "已流失", badgeVariant: "destructive" },
} satisfies Record<CustomerStage, CustomerStageMeta>

export const CUSTOMER_GRADE_META = {
    VIP: { label: "VIP", badgeVariant: "warning", iconBgClassName: "bg-warning/10", iconClassName: "text-warning" },
    NORMAL: { label: "普通", badgeVariant: "info", iconBgClassName: "bg-info/10", iconClassName: "text-info" },
    POTENTIAL: { label: "潜在", badgeVariant: "secondary", iconBgClassName: "bg-muted/30", iconClassName: "text-muted-foreground" },
} satisfies Record<CustomerGrade, CustomerGradeMeta>

export function getCustomerStageMeta(stage: CustomerStage | string | null | undefined): CustomerStageMeta {
    if (!stage) return CUSTOMER_STAGE_META.POTENTIAL
    return CUSTOMER_STAGE_META[stage as CustomerStage] ?? CUSTOMER_STAGE_META.POTENTIAL
}

export function getCustomerGradeMeta(grade: CustomerGrade | string | null | undefined): CustomerGradeMeta {
    if (!grade) return CUSTOMER_GRADE_META.POTENTIAL
    return CUSTOMER_GRADE_META[grade as CustomerGrade] ?? CUSTOMER_GRADE_META.POTENTIAL
}
