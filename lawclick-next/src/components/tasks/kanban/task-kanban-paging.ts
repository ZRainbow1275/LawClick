"use client"

import type { KanbanStatusCounts } from "@/actions/tasks-crud"
import { KANBAN_COLUMN_TAKE_DEFAULT, KANBAN_COLUMN_TAKE_MAX } from "@/lib/query-limits"
import { TaskStatus } from "@/lib/prisma-browser"

export type KanbanPagingState = {
    page: number
    take: number
    cursor: { order: number; id: string } | null
    hasMore: boolean
    loading: boolean
    loaded: boolean
}

export type RemoteUpdateHint = {
    total: number
    counts: KanbanStatusCounts
    reason: "counts" | "signal"
    action?: string | null
}

export function createPagingState(args?: { take?: number; enabledStatuses?: TaskStatus[] }): Record<TaskStatus, KanbanPagingState> {
    const take = Math.max(10, Math.min(KANBAN_COLUMN_TAKE_MAX, args?.take ?? KANBAN_COLUMN_TAKE_DEFAULT))
    const enabled = new Set<TaskStatus>(args?.enabledStatuses ?? ["TODO", "IN_PROGRESS", "REVIEW", "DONE"])

    return {
        TODO: { page: 0, take, cursor: null, hasMore: enabled.has("TODO"), loading: false, loaded: !enabled.has("TODO") },
        IN_PROGRESS: { page: 0, take, cursor: null, hasMore: enabled.has("IN_PROGRESS"), loading: false, loaded: !enabled.has("IN_PROGRESS") },
        REVIEW: { page: 0, take, cursor: null, hasMore: enabled.has("REVIEW"), loading: false, loaded: !enabled.has("REVIEW") },
        DONE: { page: 0, take, cursor: null, hasMore: enabled.has("DONE"), loading: false, loaded: !enabled.has("DONE") },
    }
}
