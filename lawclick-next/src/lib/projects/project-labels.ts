import type { UiBadgeVariant } from "@/lib/ui/badge-variant"

export const PROJECT_STATUS_LABELS = {
    PLANNED: { label: "规划中", badgeVariant: "secondary" },
    ACTIVE: { label: "进行中", badgeVariant: "info" },
    ON_HOLD: { label: "暂停", badgeVariant: "warning" },
    COMPLETED: { label: "已完成", badgeVariant: "success" },
    ARCHIVED: { label: "归档", badgeVariant: "outline" },
} as const satisfies Record<string, { label: string; badgeVariant: UiBadgeVariant }>

export const PROJECT_TYPE_LABELS = {
    ADMIN: "行政",
    HR: "人事",
    MARKETING: "品牌市场",
    IT: "信息化/IT",
    BUSINESS: "业务项目",
    OTHER: "其他",
} as const satisfies Record<string, string>
