"use client"

import type { KanbanStatusCounts, ReorderTaskUpdate } from "@/actions/tasks-crud"
import type { TaskCapabilities } from "@/lib/capabilities/types"
import { TaskPriority, TaskStatus } from "@/lib/prisma-browser"

export interface TaskItem {
    id: string
    title: string
    description: string | null
    status: TaskStatus
    priority: TaskPriority
    dueDate: Date | null
    stage: string | null
    swimlane: string | null
    taskType: string | null
    estimatedHours: number | null
    order: number
    assignee: { id: string; name: string | null; email: string } | null
    document: { id: string; title: string; documentType: string | null } | null
    case?: { id: string; title: string; caseCode: string | null }
    project?: { id: string; title: string; projectCode: string }
}

export const COLUMNS: Array<{ id: TaskStatus; title: string; color: string }> = [
    { id: "TODO", title: "待办", color: "bg-muted/20 border-border" },
    { id: "IN_PROGRESS", title: "进行中", color: "bg-info/10 border-info/20" },
    { id: "REVIEW", title: "待审核", color: "bg-warning/10 border-warning/20" },
    { id: "DONE", title: "已完成", color: "bg-success/10 border-success/20" },
]

export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
    P0_URGENT: { label: "紧急", color: "bg-destructive text-destructive-foreground" },
    P1_HIGH: { label: "高", color: "bg-primary text-primary-foreground" },
    P2_MEDIUM: { label: "中", color: "bg-warning text-warning-foreground" },
    P3_LOW: { label: "低", color: "bg-secondary text-secondary-foreground" },
}

export const PRIORITY_ORDER: Record<TaskPriority, number> = {
    P0_URGENT: 0,
    P1_HIGH: 1,
    P2_MEDIUM: 2,
    P3_LOW: 3,
}

export const EMPTY_COUNTS: KanbanStatusCounts = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 0 }
export const FULL_TASK_CAPABILITIES: TaskCapabilities = { canView: true, canCreate: true, canEdit: true, canDelete: true }

export function applyUpdatesToTasks(current: TaskItem[], updates: ReorderTaskUpdate[]): TaskItem[] {
    const map = new Map(updates.map((u) => [u.taskId, u]))
    return current.map((t) => {
        const u = map.get(t.id)
        if (!u) return t
        return {
            ...t,
            order: u.order,
            status: u.status ?? t.status,
            swimlane: u.swimlane !== undefined ? u.swimlane : t.swimlane,
            stage: u.stage !== undefined ? u.stage : t.stage,
        }
    })
}

export function mergeUniqueTasks(current: TaskItem[], incoming: TaskItem[]): TaskItem[] {
    const map = new Map<string, TaskItem>()
    for (const item of current) map.set(item.id, item)
    for (const item of incoming) map.set(item.id, item)
    return Array.from(map.values())
}

export function applyCountDelta(counts: KanbanStatusCounts, status: TaskStatus, delta: number): KanbanStatusCounts {
    const next = { ...counts }
    next[status] = Math.max(0, (next[status] ?? 0) + delta)
    return next
}

export function getOptionalStringField(value: unknown, key: string): string | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    const raw = (value as Record<string, unknown>)[key]
    return typeof raw === "string" ? raw : null
}

export function formatTenantSignalActionLabel(action: string | null | undefined): string | null {
    if (!action) return null
    if (action === "created") return "新增任务"
    if (action === "bulk_created") return "批量新增任务"
    if (action === "deleted") return "删除任务"
    if (action === "moved") return "移动任务"
    if (action === "reordered") return "调整排序"
    if (action === "updated") return "修改任务"
    return null
}
