"use client"

import * as React from "react"
import { toast } from "sonner"
import { TaskStatus, TenantSignalKind } from "@/lib/prisma-browser"

import {
    getAccessibleTaskKanbanItemById,
    getAccessibleTaskKanbanStatusCounts,
    getAccessibleTaskKanbanStatusPage,
    type KanbanStatusCounts,
} from "@/actions/tasks-crud"
import { useTenantSignal } from "@/lib/realtime/use-tenant-signal"
import { EMPTY_TASK_CAPABILITIES, type TaskCapabilities } from "@/lib/capabilities/types"
import { KANBAN_COLUMN_TAKE_DEFAULT, KANBAN_COLUMN_TAKE_MAX } from "@/lib/query-limits"
import {
    EMPTY_COUNTS,
    FULL_TASK_CAPABILITIES,
    getOptionalStringField,
    mergeUniqueTasks,
    type TaskItem,
} from "@/components/tasks/kanban/task-kanban-helpers"
import { createPagingState, type KanbanPagingState, type RemoteUpdateHint } from "@/components/tasks/kanban/task-kanban-paging"

type RemoteCountsState = {
    counts: KanbanStatusCounts
    total: number
    capabilities: TaskCapabilities
}

type TaskKanbanRemoteControllerArgs = {
    dataMode: "static" | "remote"
    refreshKey?: number

    caseId?: string
    projectId?: string
    orderedBoard: boolean
    enabledStatuses: TaskStatus[]
    assigneeId?: string
    search?: string
    take?: number

    detailOpen: boolean

    applyLocalUpdate: (updater: TaskItem[] | ((prev: TaskItem[]) => TaskItem[])) => void
    setAddingTo: (status: TaskStatus | null) => void
    setNewTitle: (title: string) => void

    onMetaChangeRef: React.MutableRefObject<
        ((meta: { total: number; counts: KanbanStatusCounts }) => void) | undefined
    >
    onCapabilitiesChangeRef: React.MutableRefObject<((capabilities: TaskCapabilities) => void) | undefined>
}

export function useTaskKanbanRemoteController(args: TaskKanbanRemoteControllerArgs) {
    const {
        dataMode,
        refreshKey,
        caseId,
        projectId,
        orderedBoard,
        enabledStatuses,
        assigneeId,
        search,
        take,
        detailOpen,
        applyLocalUpdate,
        setAddingTo,
        setNewTitle,
        onMetaChangeRef,
        onCapabilitiesChangeRef,
    } = args

    const enabledStatusSet = React.useMemo(() => new Set(enabledStatuses), [enabledStatuses])
    const remoteTake = React.useMemo(() => {
        const base = Math.max(10, Math.min(KANBAN_COLUMN_TAKE_MAX, take ?? KANBAN_COLUMN_TAKE_DEFAULT))
        return orderedBoard ? Math.max(base, KANBAN_COLUMN_TAKE_MAX) : base
    }, [orderedBoard, take])

    const [capabilities, setCapabilities] = React.useState<TaskCapabilities>(() =>
        dataMode === "static" ? FULL_TASK_CAPABILITIES : EMPTY_TASK_CAPABILITIES
    )
    const [remoteCounts, setRemoteCounts] = React.useState<KanbanStatusCounts>(EMPTY_COUNTS)
    const remoteCountsRef = React.useRef(remoteCounts)
    const [paging, setPaging] = React.useState<Record<TaskStatus, KanbanPagingState>>(() =>
        createPagingState({ take: remoteTake, enabledStatuses })
    )
    const [remoteInitialized, setRemoteInitialized] = React.useState(false)
    const [remoteUpdateHint, setRemoteUpdateHint] = React.useState<RemoteUpdateHint | null>(null)

    React.useEffect(() => {
        remoteCountsRef.current = remoteCounts
    }, [remoteCounts])

    React.useEffect(() => {
        if (dataMode === "static") {
            setCapabilities(FULL_TASK_CAPABILITIES)
            onCapabilitiesChangeRef.current?.(FULL_TASK_CAPABILITIES)
            return
        }
        setCapabilities(EMPTY_TASK_CAPABILITIES)
        onCapabilitiesChangeRef.current?.(EMPTY_TASK_CAPABILITIES)
    }, [dataMode, onCapabilitiesChangeRef])

    const remoteLoadIdRef = React.useRef(0)
    const pollCountsInFlightRef = React.useRef(false)
    const forceUpdateHintRef = React.useRef<{ action: string | null; atMs: number } | null>(null)
    const deltaSyncLastMsRef = React.useRef<Map<string, number>>(new Map())
    const pendingSignalDuringDetailOpenRef = React.useRef(false)

    const dismissRemoteUpdateHint = React.useCallback(() => {
        forceUpdateHintRef.current = null
        setRemoteUpdateHint(null)
    }, [])

    const reloadRemote = React.useCallback(async () => {
        if (dataMode !== "remote") return

        const loadId = ++remoteLoadIdRef.current
        setAddingTo(null)
        setNewTitle("")
        setCapabilities(EMPTY_TASK_CAPABILITIES)
        onCapabilitiesChangeRef.current?.(EMPTY_TASK_CAPABILITIES)
        setRemoteInitialized(false)
        setRemoteUpdateHint(null)
        forceUpdateHintRef.current = null
        applyLocalUpdate([])
        setRemoteCounts(EMPTY_COUNTS)
        setPaging(() => {
            const base = createPagingState({ take: remoteTake, enabledStatuses })
            for (const status of enabledStatuses) {
                base[status] = { ...base[status], loading: true, loaded: false }
            }
            return base
        })

        const countsRes = await getAccessibleTaskKanbanStatusCounts({
            caseId,
            projectId,
            assigneeId,
            search,
            status: enabledStatuses,
        })
        if (remoteLoadIdRef.current !== loadId) return

        if (!countsRes.success) {
            toast.error("加载看板统计失败", { description: countsRes.error || "请稍后重试" })
            setPaging((prev) => {
                const next = { ...prev }
                for (const status of enabledStatuses) {
                    next[status] = { ...next[status], loading: false, loaded: true, hasMore: false }
                }
                return next
            })
            return
        }

        const nextCaps = countsRes.capabilities ?? FULL_TASK_CAPABILITIES
        setCapabilities(nextCaps)
        onCapabilitiesChangeRef.current?.(nextCaps)
        setRemoteCounts(countsRes.counts)
        setRemoteInitialized(true)
        onMetaChangeRef.current?.({ total: countsRes.total, counts: countsRes.counts })

        const results = await Promise.all(
            enabledStatuses.map((status) =>
                getAccessibleTaskKanbanStatusPage({
                    status,
                    caseId,
                    projectId,
                    assigneeId,
                    search,
                    page: 0,
                    take: remoteTake,
                })
            )
        )
        if (remoteLoadIdRef.current !== loadId) return

        const merged = results.filter((r) => r.success).flatMap((r) => r.data) as TaskItem[]
        applyLocalUpdate(merged)

        setPaging((prev) => {
            const next = { ...prev }
            enabledStatuses.forEach((status, idx) => {
                const res = results[idx]
                if (!res || !res.success) {
                    next[status] = { ...next[status], cursor: null, loading: false, loaded: true, hasMore: false }
                    return
                }
                next[status] = {
                    ...next[status],
                    page: res.page,
                    take: res.take,
                    cursor: orderedBoard ? res.nextCursor : null,
                    hasMore: res.hasMore,
                    loading: false,
                    loaded: true,
                }
            })
            return next
        })

        if (results.some((r) => !r.success)) {
            toast.error("部分看板列加载失败", { description: "请稍后重试或刷新页面。" })
        }
    }, [
        dataMode,
        applyLocalUpdate,
        caseId,
        projectId,
        orderedBoard,
        enabledStatuses,
        assigneeId,
        search,
        remoteTake,
        setAddingTo,
        setNewTitle,
        onCapabilitiesChangeRef,
        onMetaChangeRef,
    ])

    React.useEffect(() => {
        if (dataMode !== "remote") return
        void reloadRemote()
    }, [dataMode, reloadRemote, refreshKey])

    const pollRemoteCounts = React.useCallback(async () => {
        if (dataMode !== "remote") return
        if (!remoteInitialized) return
        if (detailOpen) return
        if (pollCountsInFlightRef.current) return

        pollCountsInFlightRef.current = true
        try {
            const countsRes = await getAccessibleTaskKanbanStatusCounts({
                caseId,
                projectId,
                assigneeId,
                search,
                status: enabledStatuses,
            })

            if (!countsRes.success) return

            const current = remoteCountsRef.current
            const differs = enabledStatuses.some(
                (status) => (current[status] ?? 0) !== (countsRes.counts[status] ?? 0)
            )

            if (differs) {
                forceUpdateHintRef.current = null
                setRemoteUpdateHint({
                    total: countsRes.total,
                    counts: countsRes.counts,
                    reason: "counts",
                    action: null,
                })
                return
            }

            const forced = forceUpdateHintRef.current
            if (forced && Date.now() - forced.atMs < 30_000) {
                setRemoteUpdateHint({
                    total: countsRes.total,
                    counts: countsRes.counts,
                    reason: "signal",
                    action: forced.action,
                })
                return
            }

            setRemoteUpdateHint(null)
        } finally {
            pollCountsInFlightRef.current = false
        }
    }, [caseId, dataMode, detailOpen, enabledStatuses, assigneeId, search, projectId, remoteInitialized])

    const syncTaskDeltaById = React.useCallback(
        async (taskId: string) => {
            const trimmed = taskId.trim()
            if (!trimmed) return
            const nowMs = Date.now()
            const lastMs = deltaSyncLastMsRef.current.get(trimmed) ?? 0
            if (nowMs - lastMs < 1500) return
            deltaSyncLastMsRef.current.set(trimmed, nowMs)

            const res = await getAccessibleTaskKanbanItemById({
                taskId: trimmed,
                caseId,
                projectId,
                assigneeId,
                search,
                status: enabledStatuses,
            })

            if (!res.success) return

            if (res.data) {
                const normalized: TaskItem = {
                    ...res.data,
                    case: res.data.case ?? undefined,
                    project: res.data.project ?? undefined,
                }
                applyLocalUpdate((prev) => mergeUniqueTasks(prev, [normalized]))
                return
            }

            applyLocalUpdate((prev) => prev.filter((t) => t.id !== trimmed))
        },
        [applyLocalUpdate, caseId, enabledStatuses, assigneeId, search, projectId]
    )

    const lastSignalTriggerMsRef = React.useRef(0)
    const { state: tenantSignalState } = useTenantSignal({
        enabled: dataMode === "remote" && remoteInitialized,
        kind: TenantSignalKind.TASKS_CHANGED,
        onSignal: (event) => {
            const nowMs = Date.now()
            if (nowMs - lastSignalTriggerMsRef.current < 800) return

            const signalCaseId = getOptionalStringField(event.payload, "caseId")
            const signalProjectId = getOptionalStringField(event.payload, "projectId")
            const signalTaskId = getOptionalStringField(event.payload, "taskId")
            const action = getOptionalStringField(event.payload, "action")

            if (caseId) {
                if (!signalCaseId || signalCaseId !== caseId) return
            } else if (projectId) {
                if (!signalProjectId || signalProjectId !== projectId) return
            }

            lastSignalTriggerMsRef.current = nowMs
            forceUpdateHintRef.current = { action, atMs: nowMs }

            if (!detailOpen && signalTaskId && action) {
                if (action === "deleted") {
                    applyLocalUpdate((prev) => prev.filter((t) => t.id !== signalTaskId))
                } else if (action === "created" || action === "updated" || action === "moved") {
                    void syncTaskDeltaById(signalTaskId)
                }
            }

            if (detailOpen) {
                pendingSignalDuringDetailOpenRef.current = true
                return
            }

            void pollRemoteCounts()
        },
    })

    React.useEffect(() => {
        if (dataMode !== "remote") return
        if (!remoteInitialized) return
        if (detailOpen) return
        if (!pendingSignalDuringDetailOpenRef.current) return
        pendingSignalDuringDetailOpenRef.current = false
        void pollRemoteCounts()
    }, [dataMode, detailOpen, pollRemoteCounts, remoteInitialized])

    React.useEffect(() => {
        if (dataMode !== "remote") return
        if (!remoteInitialized) return
        if (detailOpen) return

        const intervalId = window.setInterval(() => {
            void pollRemoteCounts()
        }, tenantSignalState === "open" ? 60_000 : 20_000)

        return () => window.clearInterval(intervalId)
    }, [dataMode, pollRemoteCounts, remoteInitialized, tenantSignalState, detailOpen])

    const lastRealtimeOpenPollMsRef = React.useRef(0)
    React.useEffect(() => {
        if (dataMode !== "remote") return
        if (!remoteInitialized) return
        if (tenantSignalState !== "open") return
        if (detailOpen) return

        const nowMs = Date.now()
        if (nowMs - lastRealtimeOpenPollMsRef.current < 5000) return
        lastRealtimeOpenPollMsRef.current = nowMs
        void pollRemoteCounts()
    }, [dataMode, pollRemoteCounts, remoteInitialized, tenantSignalState, detailOpen])

    const loadMoreStatus = React.useCallback(
        async (status: TaskStatus) => {
            if (dataMode !== "remote") return
            if (!enabledStatusSet.has(status)) return

            let nextPage: number | null = null
            let cursor: { order: number; id: string } | null = null
            setPaging((prev) => {
                const current = prev[status]
                if (!current || current.loading || !current.loaded || !current.hasMore) return prev
                nextPage = current.page + 1
                cursor = orderedBoard ? current.cursor : null
                return { ...prev, [status]: { ...current, loading: true } }
            })
            if (nextPage === null) return
            if (orderedBoard && !cursor) {
                toast.error("加载更多失败", { description: "看板分页游标缺失，请刷新后重试" })
                setPaging((prev) => ({ ...prev, [status]: { ...prev[status], loading: false } }))
                return
            }

            const res = await getAccessibleTaskKanbanStatusPage({
                status,
                caseId,
                projectId,
                assigneeId,
                search,
                ...(orderedBoard && cursor ? { cursor } : {}),
                page: nextPage,
                take: paging[status]?.take ?? remoteTake,
            })

            if (!res.success) {
                toast.error("加载更多失败", { description: res.error || "请稍后重试" })
                setPaging((prev) => ({ ...prev, [status]: { ...prev[status], loading: false } }))
                return
            }

            applyLocalUpdate((prev) => mergeUniqueTasks(prev, res.data as unknown as TaskItem[]))
            setPaging((prev) => ({
                ...prev,
                [status]: {
                    ...prev[status],
                    page: res.page,
                    take: res.take,
                    cursor: orderedBoard ? res.nextCursor : null,
                    hasMore: res.hasMore,
                    loading: false,
                    loaded: true,
                },
            }))
        },
        [
            dataMode,
            enabledStatusSet,
            caseId,
            projectId,
            assigneeId,
            search,
            orderedBoard,
            paging,
            remoteTake,
            applyLocalUpdate,
        ]
    )

    const remoteCountsState: RemoteCountsState = React.useMemo(() => {
        const total = remoteCounts.TODO + remoteCounts.IN_PROGRESS + remoteCounts.REVIEW + remoteCounts.DONE
        return { counts: remoteCounts, total, capabilities }
    }, [capabilities, remoteCounts])

    return {
        capabilities: remoteCountsState.capabilities,
        remoteCounts: remoteCountsState.counts,
        setRemoteCounts,
        remoteCountsRef,
        remoteInitialized,
        paging,
        setPaging,
        remoteUpdateHint,
        setRemoteUpdateHint,
        dismissRemoteUpdateHint,
        enabledStatusSet,
        loadMoreStatus,
        reloadRemote,
        tenantSignalState,
        remoteTake,
    }
}
