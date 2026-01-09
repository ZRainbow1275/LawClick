import "server-only"

import type { Prisma } from "@prisma/client"
import { TaskPriority, TaskStatus } from "@prisma/client"
import type { TaskTypeValue } from "@/lib/task-types"

export interface CreateTaskInput {
    caseId: string
    title: string
    description?: string
    priority?: TaskPriority
    dueDate?: Date
    assigneeId?: string
    stage?: string
    swimlane?: string | null
    status?: TaskStatus
    taskType?: TaskTypeValue
    documentId?: string
    estimatedHours?: number
}

export interface CreateProjectTaskInput extends Omit<CreateTaskInput, "caseId"> {
    projectId: string
}

export interface TaskForKanban {
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
}

export const TASK_LIST_SELECT = {
    id: true,
    title: true,
    description: true,
    status: true,
    priority: true,
    dueDate: true,
    updatedAt: true,
    assignee: { select: { id: true, name: true, email: true } },
    case: { select: { id: true, title: true, caseCode: true } },
    project: { select: { id: true, title: true, projectCode: true } },
} satisfies Prisma.TaskSelect

export type TaskListItem = Prisma.TaskGetPayload<{ select: typeof TASK_LIST_SELECT }>

export const TASK_KANBAN_SELECT = {
    id: true,
    title: true,
    description: true,
    status: true,
    priority: true,
    dueDate: true,
    stage: true,
    swimlane: true,
    taskType: true,
    estimatedHours: true,
    order: true,
    assignee: { select: { id: true, name: true, email: true } },
    document: { select: { id: true, title: true, documentType: true } },
    case: { select: { id: true, title: true, caseCode: true } },
    project: { select: { id: true, title: true, projectCode: true } },
} satisfies Prisma.TaskSelect

export type TaskKanbanItem = Prisma.TaskGetPayload<{ select: typeof TASK_KANBAN_SELECT }>

export interface UpdateTaskInput {
    title?: string
    description?: string | null
    status?: TaskStatus
    priority?: TaskPriority
    dueDate?: Date | null
    assigneeId?: string | null
    stage?: string | null
    swimlane?: string | null
    taskType?: string | null
    documentId?: string | null
    estimatedHours?: number | null
    order?: number
}

export interface ReorderTaskUpdate {
    taskId: string
    order: number
    status?: TaskStatus
    swimlane?: string | null
    stage?: string | null
}

export interface GetAccessibleTasksOptions {
    caseId?: string
    projectId?: string
    assigneeId?: string
    status?: TaskStatus[]
    search?: string
    take?: number
}

export type KanbanStatusCounts = Record<TaskStatus, number>

export interface MoveTaskOnKanbanInput {
    taskId: string
    toStatus: TaskStatus
    toSwimlane?: string | null
    beforeTaskId?: string | null
    afterTaskId?: string | null
}

export type AccessibleTasksForBoardItem = {
    id: string
    title: string
    status: TaskStatus
    priority: TaskPriority
    dueDate: string | null
    case: { id: string; title: string; caseCode: string | null; status: string; currentStage: string | null } | null
    project: { id: string; title: string; projectCode: string | null; status: string; type: string } | null
    assignee: { id: string; name: string | null; email: string } | null
    document: { id: string; title: string; documentType: string | null } | null
}

