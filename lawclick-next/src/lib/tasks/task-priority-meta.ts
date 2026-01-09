import type { TaskPriority } from "@prisma/client"

export type TaskPriorityMeta = {
    label: string
    badgeClassName: string
}

const FALLBACK: TaskPriorityMeta = {
    label: "—",
    badgeClassName: "bg-muted/50 text-muted-foreground",
}

export const TASK_PRIORITY_META: Record<TaskPriority, TaskPriorityMeta> = {
    P0_URGENT: { label: "紧急", badgeClassName: "bg-destructive text-destructive-foreground" },
    P1_HIGH: { label: "高", badgeClassName: "bg-primary text-primary-foreground" },
    P2_MEDIUM: { label: "中", badgeClassName: "bg-warning text-warning-foreground" },
    P3_LOW: { label: "低", badgeClassName: "bg-secondary text-secondary-foreground" },
}

export function getTaskPriorityMeta(priority: unknown): TaskPriorityMeta {
    if (typeof priority === "string" && priority in TASK_PRIORITY_META) {
        return TASK_PRIORITY_META[priority as TaskPriority]
    }
    return FALLBACK
}

