import type { TaskStatus } from "@prisma/client"

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
    TODO: "待办",
    IN_PROGRESS: "进行中",
    REVIEW: "待审核",
    DONE: "已完成",
}

