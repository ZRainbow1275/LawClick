import "server-only"

import type { Role } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { requireCaseAccess } from "@/lib/server-auth"

export async function resolveCaseIdForTaskTimeLog(taskId: string, viewer: { id: string; role: Role }, tenantId: string) {
    const task = await prisma.task.findFirst({
        where: { id: taskId, tenantId },
        select: { caseId: true },
    })
    if (!task) {
        return { success: false as const, error: "任务不存在", caseId: null }
    }
    if (!task.caseId) {
        return { success: false as const, error: "任务未关联案件，无法作为工时对象", caseId: null }
    }
    await requireCaseAccess(task.caseId, { id: viewer.id, role: viewer.role, tenantId }, "case:view")
    return { success: true as const, caseId: task.caseId }
}

