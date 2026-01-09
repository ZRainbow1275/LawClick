import { TaskType } from "@/lib/queue-task-types"

export const QUEUE_TASK_PRIORITY: Record<TaskType, number> = {
    [TaskType.CLEANUP_UPLOAD_INTENTS]: 10,
    [TaskType.QUEUE_HEALTH_CHECK]: 5,
    [TaskType.KANBAN_HEALTH_CHECK]: 5,
    [TaskType.AUDIT_LOG]: 0,
    [TaskType.TRIGGER_TOOL_WEBHOOK]: -10,
    [TaskType.SEND_EMAIL]: -20,
} as const

export type QueueProcessPolicy = {
    cleanupMax: number
    healthMax: number
    auditMax: number
    webhookMax: number
    emailMax: number
}

export const DEFAULT_QUEUE_PROCESS_POLICY: QueueProcessPolicy = {
    cleanupMax: 10,
    healthMax: 4,
    auditMax: 10,
    webhookMax: 20,
    emailMax: 20,
}
