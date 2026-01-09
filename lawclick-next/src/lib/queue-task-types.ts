export const TaskType = {
    SEND_EMAIL: "SEND_EMAIL",
    AUDIT_LOG: "AUDIT_LOG",
    CLEANUP_UPLOAD_INTENTS: "CLEANUP_UPLOAD_INTENTS",
    TRIGGER_TOOL_WEBHOOK: "TRIGGER_TOOL_WEBHOOK",
    QUEUE_HEALTH_CHECK: "QUEUE_HEALTH_CHECK",
    KANBAN_HEALTH_CHECK: "KANBAN_HEALTH_CHECK",
} as const

export type TaskType = (typeof TaskType)[keyof typeof TaskType]

const TASK_TYPE_SET = new Set<string>(Object.values(TaskType))

export function parseTaskType(value: unknown): TaskType | null {
    if (typeof value !== "string") return null
    return TASK_TYPE_SET.has(value) ? (value as TaskType) : null
}
