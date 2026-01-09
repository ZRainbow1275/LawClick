"use client"

import * as React from "react"
import { Draggable, Droppable } from "@hello-pangea/dnd"
import { List as VirtualList, type RowComponentProps } from "react-window"
import { TaskStatus } from "@/lib/prisma-browser"

import { cn } from "@/lib/utils"
import { useElementSize } from "@/lib/ui/use-element-size"
import type { KanbanPagingState } from "@/components/tasks/kanban/task-kanban-paging"
import type { TaskItem } from "@/components/tasks/kanban/task-kanban-helpers"
import { TaskKanbanCard } from "@/components/tasks/kanban/TaskKanbanCard"

type KanbanRowData = {
    tasks: TaskItem[]
    showCaseInfo: boolean
    allowTimerFromCase: boolean
    onOpenTask: (taskId: string) => void
    dragDisabled: boolean
    itemGap: number
}

function KanbanVirtualRow({ index, style, ariaAttributes, ...data }: RowComponentProps<KanbanRowData>) {
    const task = data.tasks[index]
    if (!task) {
        return <div {...ariaAttributes} style={style} aria-hidden="true" />
    }

    return (
        <Draggable draggableId={task.id} index={index} key={task.id} isDragDisabled={data.dragDisabled}>
            {(dragProvided, snapshot) => (
                <div
                    {...ariaAttributes}
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    style={{
                        ...style,
                        ...dragProvided.draggableProps.style,
                        paddingLeft: 12,
                        paddingRight: 12,
                        paddingBottom: data.itemGap,
                        boxSizing: "border-box",
                    }}
                    className={cn(snapshot.isDragging ? "rotate-2 scale-[1.02] opacity-90" : "")}
                >
                    <TaskKanbanCard
                        task={task}
                        dragHandleProps={dragProvided.dragHandleProps ?? undefined}
                        showCaseInfo={data.showCaseInfo}
                        canStartTimer={data.allowTimerFromCase || Boolean(task.case?.id)}
                        onOpen={() => data.onOpenTask(task.id)}
                    />
                </div>
            )}
        </Draggable>
    )
}

export function TaskKanbanVirtualColumn(props: {
    status: TaskStatus
    tasks: TaskItem[]
    showCaseInfo: boolean
    allowTimerFromCase: boolean
    onOpenTask: (taskId: string) => void
    dropDisabled?: boolean
    dragDisabled: boolean
    itemSize: number
    itemGap: number
    overscanCount: number
    paging?: KanbanPagingState
    onLoadMore?: () => void
}) {
    const {
        status,
        tasks,
        showCaseInfo,
        allowTimerFromCase,
        onOpenTask,
        dropDisabled,
        dragDisabled,
        itemSize,
        itemGap,
        overscanCount,
        paging,
        onLoadMore,
    } = props
    const { ref, height } = useElementSize<HTMLDivElement>()

    const itemData = React.useMemo<KanbanRowData>(() => {
        return { tasks, showCaseInfo, allowTimerFromCase, onOpenTask, dragDisabled, itemGap }
    }, [tasks, showCaseInfo, allowTimerFromCase, onOpenTask, dragDisabled, itemGap])

    return (
        <div ref={ref} className="flex-1 min-h-[80px]">
            <Droppable
                droppableId={status}
                mode="virtual"
                isDropDisabled={dropDisabled}
                renderClone={(cloneProvided, _snapshot, rubric) => {
                    const task = tasks[rubric.source.index]
                    if (!task) return null
                    return (
                        <div
                            ref={cloneProvided.innerRef}
                            {...cloneProvided.draggableProps}
                            style={{
                                ...cloneProvided.draggableProps.style,
                                paddingLeft: 12,
                                paddingRight: 12,
                                paddingBottom: itemGap,
                                boxSizing: "border-box",
                            }}
                        >
                            <TaskKanbanCard
                                task={task}
                                dragHandleProps={cloneProvided.dragHandleProps ?? undefined}
                                showCaseInfo={showCaseInfo}
                                canStartTimer={allowTimerFromCase || Boolean(task.case?.id)}
                            />
                        </div>
                    )
                }}
            >
                {(provided, snapshot) => {
                    const placeholderCount = snapshot.isUsingPlaceholder ? 1 : 0
                    const itemCount = tasks.length + placeholderCount

                    const resolvedHeight = Math.max(1, height)

                    return (
                        <VirtualList
                            rowCount={itemCount}
                            rowHeight={itemSize}
                            rowComponent={KanbanVirtualRow}
                            rowProps={itemData}
                            defaultHeight={resolvedHeight}
                            style={{ height: resolvedHeight, width: "100%" }}
                            overscanCount={overscanCount}
                            listRef={(api) => provided.innerRef(api?.element ?? null)}
                            onRowsRendered={(_visible, allRows) => {
                                if (!paging || !onLoadMore) return
                                if (!paging.loaded || paging.loading || !paging.hasMore) return
                                if (tasks.length === 0) return
                                if (allRows.stopIndex >= Math.max(0, tasks.length - 3)) {
                                    onLoadMore()
                                }
                            }}
                            {...provided.droppableProps}
                        ></VirtualList>
                    )
                }}
            </Droppable>
        </div>
    )
}
