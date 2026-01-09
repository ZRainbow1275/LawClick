import type { CaseStatus } from "@prisma/client"

import type { UiBadgeVariant } from "@/lib/ui/badge-variant"

export type CaseStatusMeta = {
    label: string
    badgeVariant: UiBadgeVariant
}

export const CASE_STATUS_META = {
    LEAD: { label: "线索", badgeVariant: "secondary" },
    INTAKE: { label: "立案审查", badgeVariant: "warning" },
    ACTIVE: { label: "在办", badgeVariant: "info" },
    SUSPENDED: { label: "中止", badgeVariant: "secondary" },
    CLOSED: { label: "结案", badgeVariant: "success" },
    ARCHIVED: { label: "归档", badgeVariant: "outline" },
} as const satisfies Record<CaseStatus, CaseStatusMeta>

export function getCaseStatusMeta(status: CaseStatus | string): CaseStatusMeta {
    const key = typeof status === "string" ? status.trim() : status
    if (key && Object.prototype.hasOwnProperty.call(CASE_STATUS_META, key)) {
        return CASE_STATUS_META[key as CaseStatus]
    }
    const fallbackLabel = typeof status === "string" && status.trim() ? status.trim() : "未知"
    return { label: fallbackLabel, badgeVariant: "secondary" }
}

