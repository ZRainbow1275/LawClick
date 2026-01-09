"use server"

import type { TaskStatus } from "@prisma/client"

import type { ActionResponse } from "@/lib/action-response"
import { getAccessibleTasksForBoardImpl, getAccessibleTasksForBoardMetaImpl, getAccessibleTasksForListPageImpl } from "@/lib/tasks/crud/actions/board-queries"
import { createCaseTaskImpl, createProjectTaskImpl } from "@/lib/tasks/crud/actions/create-task"
import { deleteTaskImpl } from "@/lib/tasks/crud/actions/delete-task"
import { getUserTasksImpl } from "@/lib/tasks/crud/actions/get-user-tasks"
import { getAccessibleTaskKanbanItemByIdImpl, getAccessibleTaskKanbanStatusCountsImpl, getAccessibleTaskKanbanStatusPageImpl } from "@/lib/tasks/crud/actions/kanban-queries"
import { moveTaskOnKanbanImpl } from "@/lib/tasks/crud/actions/move-task-on-kanban"
import { reorderTasksImpl } from "@/lib/tasks/crud/actions/reorder-tasks"
import { assignTaskImpl, updateTaskImpl, updateTaskStatusImpl } from "@/lib/tasks/crud/actions/update-task"
import type {
    CreateProjectTaskInput,
    CreateTaskInput,
    GetAccessibleTasksOptions,
    MoveTaskOnKanbanInput,
    ReorderTaskUpdate,
    TaskForKanban,
    UpdateTaskInput,
} from "@/lib/tasks/crud/task-crud-types"

export type {
    AccessibleTasksForBoardItem,
    CreateProjectTaskInput,
    CreateTaskInput,
    GetAccessibleTasksOptions,
    KanbanStatusCounts,
    MoveTaskOnKanbanInput,
    ReorderTaskUpdate,
    TaskForKanban,
    TaskKanbanItem,
    TaskListItem,
    UpdateTaskInput,
} from "@/lib/tasks/crud/task-crud-types"

export async function createCaseTask(
    input: CreateTaskInput
): Promise<ActionResponse<{ taskId: string; task: TaskForKanban }>> {
    return createCaseTaskImpl(input)
}

export async function createProjectTask(
    input: CreateProjectTaskInput
): Promise<ActionResponse<{ taskId: string; task: TaskForKanban }>> {
    return createProjectTaskImpl(input)
}

export async function updateTask(taskId: string, input: UpdateTaskInput): Promise<ActionResponse> {
    return updateTaskImpl(taskId, input)
}

export async function moveTaskOnKanban(
    input: MoveTaskOnKanbanInput
): Promise<ActionResponse<{ updates: ReorderTaskUpdate[] }>> {
    return moveTaskOnKanbanImpl(input)
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<ActionResponse> {
    return updateTaskStatusImpl(taskId, status)
}

export async function assignTask(taskId: string, assigneeId: string | null): Promise<ActionResponse> {
    return assignTaskImpl(taskId, assigneeId)
}

export async function deleteTask(taskId: string): Promise<ActionResponse> {
    return deleteTaskImpl(taskId)
}

export async function reorderTasks(updates: ReorderTaskUpdate[]): Promise<ActionResponse> {
    return reorderTasksImpl(updates)
}

export async function getUserTasks(userId?: string) {
    return getUserTasksImpl(userId)
}

export async function getAccessibleTaskKanbanStatusCounts(options?: {
    caseId?: string
    projectId?: string
    assigneeId?: string
    status?: TaskStatus[]
    search?: string
}) {
    return getAccessibleTaskKanbanStatusCountsImpl(options)
}

export async function getAccessibleTaskKanbanStatusPage(input: {
    status: TaskStatus
    caseId?: string
    projectId?: string
    assigneeId?: string
    search?: string
    cursor?: { order: number; id: string }
    page?: number
    take?: number
}) {
    return getAccessibleTaskKanbanStatusPageImpl(input)
}

export async function getAccessibleTaskKanbanItemById(input: {
    taskId: string
    caseId?: string
    projectId?: string
    assigneeId?: string
    status?: TaskStatus[]
    search?: string
}) {
    return getAccessibleTaskKanbanItemByIdImpl(input)
}

export async function getAccessibleTasksForBoardMeta(options?: GetAccessibleTasksOptions) {
    return getAccessibleTasksForBoardMetaImpl(options)
}

export async function getAccessibleTasksForBoard(options?: GetAccessibleTasksOptions) {
    return getAccessibleTasksForBoardImpl(options)
}

export async function getAccessibleTasksForListPage(input?: {
    caseId?: string
    projectId?: string
    status?: TaskStatus[]
    search?: string
    page?: number
    take?: number
}) {
    return getAccessibleTasksForListPageImpl(input)
}

