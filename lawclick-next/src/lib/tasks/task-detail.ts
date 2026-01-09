import type { TaskPriority, TaskStatus } from "@prisma/client"
import type { TaskCapabilities } from "@/lib/capabilities/types"

export type TaskAssigneeOption = {
    id: string
    name: string | null
    email: string
}

export type TaskDetail = {
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
    assignee: TaskAssigneeOption | null
    document: { id: string; title: string; documentType: string | null } | null
    case: { id: string; title: string; caseCode: string | null } | null
    project: { id: string; title: string; projectCode: string } | null
}

export type TaskDetailPageData = {
    task: TaskDetail
    assignees: TaskAssigneeOption[]
    capabilities: Pick<TaskCapabilities, "canEdit" | "canDelete">
}
