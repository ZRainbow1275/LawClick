"use client"

import * as React from "react"
import { DragDropContext, type DropResult } from "@hello-pangea/dnd"
import { TaskStatus } from "@/lib/prisma-browser"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

import {
    createCaseTask,
    createProjectTask,
    moveTaskOnKanban,
    reorderTasks,
    type KanbanStatusCounts,
    type ReorderTaskUpdate,
} from "@/actions/tasks-crud"
import { LegoDeck } from "@/components/layout/LegoDeck"
import type { SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { useUiPreferences } from "@/components/layout/UiPreferencesProvider"
import { TaskDetailDialog } from "@/components/tasks/TaskDetailDialog"
import { TaskKanbanVirtualColumn } from "@/components/tasks/kanban/TaskKanbanVirtualColumn"
import {
    applyCountDelta,
    applyUpdatesToTasks,
    COLUMNS,
    formatTenantSignalActionLabel,
    mergeUniqueTasks,
    PRIORITY_ORDER,
    type TaskItem,
} from "@/components/tasks/kanban/task-kanban-helpers"
import { useTaskKanbanRemoteController } from "@/components/tasks/kanban/use-task-kanban-remote"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent } from "@/components/ui/Card"
import { Textarea } from "@/components/ui/Textarea"
import { computeOptimisticOrder } from "@/lib/task-ordering"
import { cn } from "@/lib/utils"
import type { TaskCapabilities } from "@/lib/capabilities/types"

interface TaskKanbanProps {
    initialTasks?: TaskItem[]
    caseId?: string
    projectId?: string
    assignees?: Array<{ id: string; name: string | null; email: string }>
    showCaseInfo?: boolean
    onTasksChange?: (tasks: TaskItem[]) => void
    query?: {
        status?: TaskStatus[]
        assigneeId?: string
        search?: string
    }
    dataMode?: "static" | "remote"
    refreshKey?: number
    onMetaChange?: (meta: { total: number; counts: KanbanStatusCounts }) => void
    onCapabilitiesChange?: (capabilities: TaskCapabilities) => void
}

export function TaskKanban({
    initialTasks,
    caseId,
    projectId,
    assignees,
    showCaseInfo,
    onTasksChange,
    query,
    dataMode = "static",
    refreshKey,
    onMetaChange,
    onCapabilitiesChange,
}: TaskKanbanProps) {
    const { app } = useUiPreferences()
    const density = app.density
    const onMetaChangeRef = React.useRef(onMetaChange)
    const onCapabilitiesChangeRef = React.useRef(onCapabilitiesChange)

    React.useEffect(() => {
        onMetaChangeRef.current = onMetaChange
    }, [onMetaChange])

    React.useEffect(() => {
        onCapabilitiesChangeRef.current = onCapabilitiesChange
    }, [onCapabilitiesChange])

    const [tasks, setTasks] = React.useState<TaskItem[]>(initialTasks ?? [])
    const [enabled, setEnabled] = React.useState(false)
    const [addingTo, setAddingTo] = React.useState<TaskStatus | null>(null)
    const [newTitle, setNewTitle] = React.useState("")
    const [creating, setCreating] = React.useState(false)
    const [detailOpen, setDetailOpen] = React.useState(false)
    const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null)

    React.useEffect(() => {
        if (dataMode !== "static") return
        setTasks(initialTasks ?? [])
    }, [dataMode, initialTasks])

    React.useEffect(() => {
        const raf = requestAnimationFrame(() => setEnabled(true))
        return () => cancelAnimationFrame(raf)
    }, [])

    const applyLocalUpdate = React.useCallback(
        (updater: TaskItem[] | ((prev: TaskItem[]) => TaskItem[])) => {
            setTasks((prev) => {
                const next = typeof updater === "function" ? updater(prev) : updater
                onTasksChange?.(next)
                return next
            })
        },
        [onTasksChange]
    )

    const orderedBoard = Boolean(caseId || projectId)

    const enabledStatuses = React.useMemo<TaskStatus[]>(() => {
        if (query?.status?.length) return query.status
        return ["TODO", "IN_PROGRESS", "REVIEW", "DONE"]
    }, [query?.status])

    const normalizedSearch = (query?.search || "").trim() || undefined
    const normalizedAssigneeId = query?.assigneeId || undefined

    const {
        capabilities,
        remoteCounts,
        setRemoteCounts,
        remoteInitialized,
        paging,
        remoteUpdateHint,
        dismissRemoteUpdateHint,
        enabledStatusSet,
        loadMoreStatus,
        reloadRemote,
        tenantSignalState,
    } = useTaskKanbanRemoteController({
        dataMode,
        refreshKey,
        caseId,
        projectId,
        orderedBoard,
        enabledStatuses,
        assigneeId: normalizedAssigneeId,
        search: normalizedSearch,
        detailOpen,
        applyLocalUpdate,
        setAddingTo,
        setNewTitle,
        onMetaChangeRef,
        onCapabilitiesChangeRef,
    })

    const grouped = React.useMemo(() => {
        const groups: Record<TaskStatus, TaskItem[]> = {
            TODO: [],
            IN_PROGRESS: [],
            REVIEW: [],
            DONE: [],
        }

        tasks.forEach((task) => {
            groups[task.status]?.push(task)
        })

        Object.keys(groups).forEach((key) => {
            const list = groups[key as TaskStatus]
            if (orderedBoard) {
                list.sort((a, b) => a.order - b.order)
                return
            }

            list.sort((a, b) => {
                const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY
                const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY
                if (aDue !== bDue) return aDue - bDue
                const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
                if (p !== 0) return p
                return a.order - b.order
            })
        })

        return groups
    }, [orderedBoard, tasks])

    const openTaskDetail = (taskId: string) => {
        setSelectedTaskId(taskId)
        setDetailOpen(true)
    }

    const selectedTask = React.useMemo(() => {
        if (!selectedTaskId) return null
        return tasks.find((t) => t.id === selectedTaskId) ?? null
    }, [selectedTaskId, tasks])

    const handleQuickAdd = async (status: TaskStatus) => {
        if (!caseId && !projectId) return
        if (!capabilities.canCreate) {
            toast.error("无创建任务权限", { description: "当前工作区不允许创建任务。" })
            return
        }

        const title = newTitle.trim()
        if (!title) return

        setCreating(true)
        const res = caseId
            ? await createCaseTask({ caseId, title, status })
            : await createProjectTask({ projectId: projectId!, title, status })

        if (!res.success) {
            toast.error("创建任务失败", { description: res.error })
            setCreating(false)
            return
        }

        const createdTask = res.task as unknown as TaskItem
        applyLocalUpdate((prev) => mergeUniqueTasks(prev, [createdTask]))

        if (dataMode === "remote" && enabledStatusSet.has(status)) {
            setRemoteCounts((prev) => {
                const next = applyCountDelta(prev, status, 1)
                const total = next.TODO + next.IN_PROGRESS + next.REVIEW + next.DONE
                onMetaChangeRef.current?.({ total, counts: next })
                return next
            })
        }

        setNewTitle("")
        setAddingTo(null)
        setCreating(false)
        toast.success("已创建任务")
    }

    const onDragEnd = async (result: DropResult) => {
        if (!capabilities.canEdit) {
            toast.error("当前为只读模式", { description: "缺少任务编辑权限，无法拖拽移动。" })
            return
        }

        const { source, destination, draggableId } = result
        if (!destination) return

        const sourceStatus = source.droppableId as TaskStatus
        const destStatus = destination.droppableId as TaskStatus
        if (sourceStatus === destStatus && source.index === destination.index) return
        if (!orderedBoard && sourceStatus === destStatus) return

        if (dataMode === "remote" && orderedBoard) {
            const sourceState = paging[sourceStatus]
            const destState = paging[destStatus]
            const sourceReady = sourceState && sourceState.loaded && !sourceState.loading
            const destReady = destState && destState.loaded && !destState.loading
            if (!sourceReady || !destReady) {
                toast.error("看板仍在加载中", { description: "请稍后重试，或等待相关列加载完成。" })
                return
            }
        }

        const sourceList = Array.from(grouped[sourceStatus])
        const destList = sourceStatus === destStatus ? sourceList : Array.from(grouped[destStatus])

        const moved = sourceList[source.index]
        if (!moved || moved.id !== draggableId) return

        const snapshot = tasks

        sourceList.splice(source.index, 1)
        destList.splice(destination.index, 0, { ...moved, status: destStatus })

        const before = destination.index > 0 ? destList[destination.index - 1] ?? null : null
        const after = destination.index < destList.length - 1 ? destList[destination.index + 1] ?? null : null

        const optimistic = tasks.map((t) => {
            if (t.id !== moved.id) return t
            if (!orderedBoard) return { ...t, status: destStatus }
            const optimisticOrder = computeOptimisticOrder(before?.order ?? null, after?.order ?? null)
            return { ...t, status: destStatus, order: optimisticOrder }
        })
        applyLocalUpdate(optimistic)

        const res = await moveTaskOnKanban({
            taskId: moved.id,
            toStatus: destStatus,
            toSwimlane: moved.swimlane,
            beforeTaskId: orderedBoard ? before?.id ?? null : null,
            afterTaskId: orderedBoard ? after?.id ?? null : null,
        })

        if (!res.success) {
            applyLocalUpdate(snapshot)
            toast.error("看板移动失败", { description: res.error })
            return
        }

        const persisted = applyUpdatesToTasks(optimistic, res.updates)
        applyLocalUpdate(persisted)

        const statusChanged = sourceStatus !== destStatus
        if (dataMode === "remote" && statusChanged) {
            setRemoteCounts((prev) => {
                let next = prev
                if (enabledStatusSet.has(sourceStatus)) next = applyCountDelta(next, sourceStatus, -1)
                if (enabledStatusSet.has(destStatus)) next = applyCountDelta(next, destStatus, 1)
                const total = next.TODO + next.IN_PROGRESS + next.REVIEW + next.DONE
                onMetaChangeRef.current?.({ total, counts: next })
                return next
            })
        }

        const revertUpdates: ReorderTaskUpdate[] = []
        const prevMap = new Map(snapshot.map((t) => [t.id, t]))
        persisted.forEach((now) => {
            const prev = prevMap.get(now.id)
            if (!prev) return
            if (prev.order !== now.order || prev.status !== now.status || prev.swimlane !== now.swimlane) {
                revertUpdates.push({ taskId: now.id, order: prev.order, status: prev.status, swimlane: prev.swimlane })
            }
        })

        toast.success("已更新看板", {
            action:
                revertUpdates.length > 0
                    ? {
                          label: "撤销",
                          onClick: async () => {
                              const undo = await reorderTasks(revertUpdates)
                              if (!undo.success) {
                                  toast.error("撤销失败", { description: undo.error || "请稍后重试" })
                                  return
                              }
                              applyLocalUpdate(snapshot)
                              if (dataMode === "remote" && statusChanged) {
                                  setRemoteCounts((prev) => {
                                      let next = prev
                                      if (enabledStatusSet.has(sourceStatus)) next = applyCountDelta(next, sourceStatus, 1)
                                      if (enabledStatusSet.has(destStatus)) next = applyCountDelta(next, destStatus, -1)
                                      const total = next.TODO + next.IN_PROGRESS + next.REVIEW + next.DONE
                                      onMetaChangeRef.current?.({ total, counts: next })
                                      return next
                                  })
                              }
                              toast.success("已撤销")
                          },
                      }
                    : undefined,
        })
    }

    if (!enabled) return null

    const canQuickAdd = Boolean(caseId || projectId) && capabilities.canCreate
    const itemGap = density === "compact" ? 10 : 12
    const itemSize = density === "compact" ? 206 : 222
    const overscanCount = 4

    const currentRemoteTotal =
        remoteCounts.TODO + remoteCounts.IN_PROGRESS + remoteCounts.REVIEW + remoteCounts.DONE
    const syncHint = tenantSignalState === "open" ? "实时同步" : "多人协作同步延迟 ≤ 20s"

    const catalog = [
        {
            id: "sync_hint",
            title: "同步提示",
            chrome: "none",
            defaultSize: { w: 12, h: 3, minW: 6, minH: 2, maxW: 12, maxH: 4 },
            content:
                dataMode === "remote" && remoteUpdateHint ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card/70 p-2 text-xs">
                        <div className="text-muted-foreground">
                            {remoteUpdateHint.reason === "counts" ? (
                                <>
                                    检测到看板更新：当前 {currentRemoteTotal}，最新 {remoteUpdateHint.total}
                                </>
                            ) : (
                                <>
                                    检测到看板更新：
                                    {formatTenantSignalActionLabel(remoteUpdateHint.action) ?? "排序/内容已变化"}
                                    ，建议刷新
                                </>
                            )}
                            （{syncHint}）
                        </div>
                        <div className="flex items-center gap-2">
                            <Button size="sm" variant="secondary" onClick={() => void reloadRemote()}>
                                刷新
                            </Button>
                            <Button size="sm" variant="ghost" onClick={dismissRemoteUpdateHint}>
                                忽略
                            </Button>
                        </div>
                    </div>
                ) : null,
        },
        {
            id: "collaboration_state",
            title: "协作状态",
            chrome: "none",
            defaultSize: { w: 12, h: 2, minW: 6, minH: 1, maxW: 12, maxH: 3 },
            content:
                dataMode === "remote" ? (
                    <div className="flex items-center justify-end">
                        <div className="flex items-center gap-2">
                            {remoteInitialized && !capabilities.canEdit ? (
                                <Badge variant="outline" className="text-xs text-muted-foreground">
                                    只读：无任务编辑权限
                                </Badge>
                            ) : null}
                            <Badge variant="outline" className="text-xs">
                                {tenantSignalState === "open" ? "实时已连接" : "实时断开（轮询）"}
                            </Badge>
                        </div>
                    </div>
                ) : null,
        },
        {
            id: "board",
            title: "看板",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 22, minW: 8, minH: 16, maxW: 12 },
            content: (
                <div className="flex h-full min-h-0 gap-4 overflow-x-auto pb-4">
                    {COLUMNS.map((col) => {
                        const loadedCount = grouped[col.id].length
                        const totalCount = dataMode === "remote" ? remoteCounts[col.id] : loadedCount
                        const badgeText =
                            dataMode === "remote" && totalCount > 0
                                ? `${loadedCount}/${totalCount}`
                                : `${loadedCount}`

                        const statusEnabled = dataMode !== "remote" || enabledStatusSet.has(col.id)
                        const colPaging = paging[col.id]
                        const dragDisabled =
                            !capabilities.canEdit ||
                            (dataMode === "remote" && orderedBoard && (colPaging.loading || !colPaging.loaded))

                        return (
                            <div
                                key={col.id}
                                data-testid={`task-kanban-column-${col.id}`}
                                className={cn("flex-shrink-0 w-80 flex flex-col rounded-lg border", col.color)}
                            >
                                <div className="p-3 border-b bg-card/60 backdrop-blur-sm flex items-center justify-between sticky top-0 z-10">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-semibold text-sm">{col.title}</h3>
                                        {dataMode === "remote" && colPaging.loading && !colPaging.loaded ? (
                                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                                        ) : null}
                                        <Badge variant="secondary" className="bg-card/70 text-xs text-muted-foreground">
                                            {badgeText}
                                        </Badge>
                                    </div>
                                    {canQuickAdd && statusEnabled ? (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            aria-label={`在「${col.title}」新建任务`}
                                            data-testid={`task-kanban-add-${col.id}`}
                                            onClick={() => {
                                                setAddingTo(col.id)
                                                setNewTitle("")
                                            }}
                                        >
                                            <Plus className="h-3 w-3" />
                                        </Button>
                                    ) : null}
                                </div>

                                {canQuickAdd && statusEnabled && addingTo === col.id ? (
                                    <div className="p-3">
                                        <Card className="bg-card border-primary/30">
                                            <CardContent className="p-3 space-y-2">
                                                <Textarea
                                                    value={newTitle}
                                                    onChange={(e) => setNewTitle(e.target.value)}
                                                    placeholder="输入任务标题（Enter 创建，Shift+Enter 换行）"
                                                    className="min-h-[72px]"
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Escape") {
                                                            e.preventDefault()
                                                            setAddingTo(null)
                                                            setNewTitle("")
                                                            return
                                                        }
                                                        if (e.key === "Enter" && !e.shiftKey) {
                                                            e.preventDefault()
                                                            void handleQuickAdd(col.id)
                                                        }
                                                    }}
                                                />
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            setAddingTo(null)
                                                            setNewTitle("")
                                                        }}
                                                    >
                                                        取消
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        disabled={creating || !newTitle.trim()}
                                                        onClick={() => void handleQuickAdd(col.id)}
                                                    >
                                                        创建
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                ) : null}

                                <TaskKanbanVirtualColumn
                                    status={col.id}
                                    tasks={grouped[col.id]}
                                    showCaseInfo={Boolean(showCaseInfo)}
                                    allowTimerFromCase={Boolean(caseId)}
                                    onOpenTask={openTaskDetail}
                                    dropDisabled={!capabilities.canEdit || (dataMode === "remote" && !statusEnabled)}
                                    dragDisabled={dragDisabled}
                                    itemSize={itemSize}
                                    itemGap={itemGap}
                                    overscanCount={overscanCount}
                                    paging={dataMode === "remote" && statusEnabled ? colPaging : undefined}
                                    onLoadMore={
                                        dataMode === "remote" && statusEnabled
                                            ? () => void loadMoreStatus(col.id)
                                            : undefined
                                    }
                                />

                                {dataMode === "remote" && statusEnabled ? (
                                    <div className="px-3 py-2 border-t bg-card/60 text-xs text-muted-foreground flex items-center justify-between">
                                        <div>
                                            已加载 {loadedCount} / {totalCount} 项
                                        </div>
                                        {colPaging.loading ? (
                                            <div className="flex items-center gap-2">
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                                加载中...
                                            </div>
                                        ) : colPaging.hasMore ? (
                                            <Button variant="outline" size="sm" onClick={() => void loadMoreStatus(col.id)}>
                                                加载更多
                                            </Button>
                                        ) : (
                                            <span>已全部加载</span>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        )
                    })}
                </div>
            ),
        },
    ] satisfies SectionCatalogItem[]

    return (
        <DragDropContext onDragEnd={onDragEnd}>
            <LegoDeck
                sectionId="task_kanban_deck"
                rowHeight={28}
                className="h-[calc(100vh-260px)] overflow-auto"
                catalog={catalog}
            />

            <TaskDetailDialog
                open={detailOpen}
                onOpenChange={(open) => {
                    setDetailOpen(open)
                    if (!open) setSelectedTaskId(null)
                }}
                task={selectedTask}
                canEdit={capabilities.canEdit}
                canDelete={capabilities.canDelete}
                assignees={assignees}
                allowTimer={Boolean(caseId || selectedTask?.case?.id)}
                onTaskPatched={(taskId, patch) => {
                    const before = tasks.find((t) => t.id === taskId) ?? null
                    applyLocalUpdate((prev) =>
                        prev.map((t) => (t.id === taskId ? ({ ...t, ...patch } as TaskItem) : t))
                    )

                    if (dataMode === "remote" && patch.status && before && before.status !== patch.status) {
                        const nextStatus = patch.status
                        setRemoteCounts((prev) => {
                            let next = prev
                            if (enabledStatusSet.has(before.status)) next = applyCountDelta(next, before.status, -1)
                            if (enabledStatusSet.has(nextStatus)) next = applyCountDelta(next, nextStatus, 1)
                            const total = next.TODO + next.IN_PROGRESS + next.REVIEW + next.DONE
                            onMetaChangeRef.current?.({ total, counts: next })
                            return next
                        })
                    }
                }}
                onTaskAppliedUpdates={(updates) => {
                    const statusChanges: Array<{ from: TaskStatus; to: TaskStatus }> = []
                    if (dataMode === "remote") {
                        for (const u of updates) {
                            if (!u.status) continue
                            const before = tasks.find((t) => t.id === u.taskId)
                            if (before && before.status !== u.status) statusChanges.push({ from: before.status, to: u.status })
                        }
                    }

                    applyLocalUpdate((prev) => applyUpdatesToTasks(prev, updates))

                    if (dataMode === "remote" && statusChanges.length > 0) {
                        setRemoteCounts((prev) => {
                            let next = prev
                            for (const change of statusChanges) {
                                if (enabledStatusSet.has(change.from)) next = applyCountDelta(next, change.from, -1)
                                if (enabledStatusSet.has(change.to)) next = applyCountDelta(next, change.to, 1)
                            }
                            const total = next.TODO + next.IN_PROGRESS + next.REVIEW + next.DONE
                            onMetaChangeRef.current?.({ total, counts: next })
                            return next
                        })
                    }
                }}
                onTaskDeleted={(taskId) => {
                    const before = tasks.find((t) => t.id === taskId) ?? null
                    applyLocalUpdate((prev) => prev.filter((t) => t.id !== taskId))
                    if (dataMode === "remote" && before && enabledStatusSet.has(before.status)) {
                        setRemoteCounts((prev) => {
                            const next = applyCountDelta(prev, before.status, -1)
                            const total = next.TODO + next.IN_PROGRESS + next.REVIEW + next.DONE
                            onMetaChangeRef.current?.({ total, counts: next })
                            return next
                        })
                    }
                }}
            />
        </DragDropContext>
    )
}
