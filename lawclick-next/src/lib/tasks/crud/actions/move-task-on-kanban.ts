import "server-only"

import { TenantSignalKind, type Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"

import type { ActionResponse } from "@/lib/action-response"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { enforceActionRateLimit } from "@/lib/action-rate-limit"
import { logger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { touchTenantSignal } from "@/lib/realtime/tenant-signal"
import {
    getActiveTenantContextOrThrow,
    requireCaseAccess,
    requireProjectAccess,
    requireTenantPermission,
} from "@/lib/server-auth"
import { TASK_POSITION_GAP, computePersistedOrder } from "@/lib/task-ordering"
import { MoveTaskOnKanbanInputSchema } from "@/lib/tasks/crud/task-crud-schemas"
import type { MoveTaskOnKanbanInput, ReorderTaskUpdate } from "@/lib/tasks/crud/task-crud-types"

function getActionErrorMessage(error: unknown, fallback: string): string {
    return getPublicActionErrorMessage(error, fallback)
}

export async function moveTaskOnKanbanImpl(
    input: MoveTaskOnKanbanInput
): Promise<ActionResponse<{ updates: ReorderTaskUpdate[] }>> {
    try {
        const parsed = MoveTaskOnKanbanInputSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        input = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:edit")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "tasks.kanban.move",
            limit: 600,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false, error: rate.error }

        const moved = await prisma.task.findFirst({
            where: { id: input.taskId, tenantId },
            select: { id: true, caseId: true, projectId: true, status: true, swimlane: true, order: true },
        })
        if (!moved) {
            return { success: false, error: "目标列的任务过多（>10000），请缩小范围后重试" }
        }

        const parent =
            moved.caseId
                ? ({ type: "case" as const, id: moved.caseId } as const)
                : moved.projectId
                  ? ({ type: "project" as const, id: moved.projectId } as const)
                  : null
        if (!parent) {
            return { success: false, error: "目标列的任务过多（>10000），请缩小范围后重试" }
        }

        if (parent.type === "case") {
            await requireCaseAccess(parent.id, user, "case:view")
        } else {
            await requireProjectAccess(parent.id, user, "task:edit")
        }

        const toSwimlane = input.toSwimlane === undefined ? moved.swimlane : input.toSwimlane

        const neighborIds = [input.beforeTaskId, input.afterTaskId].filter(
            (v): v is string => typeof v === "string" && v.length > 0
        )

        const neighbors = neighborIds.length
            ? await prisma.task.findMany({
                  where: { tenantId, id: { in: neighborIds } },
                  select: { id: true, caseId: true, projectId: true, status: true, swimlane: true, order: true },
                  take: neighborIds.length,
              })
            : []

        const before = neighbors.find((n) => n.id === input.beforeTaskId) || null
        const after = neighbors.find((n) => n.id === input.afterTaskId) || null

        const validBefore =
            before &&
            ((parent.type === "case" && before.caseId === parent.id) ||
                (parent.type === "project" && before.projectId === parent.id)) &&
            before.status === input.toStatus &&
            before.swimlane === toSwimlane
                ? before
                : null

        const validAfter =
            after &&
            ((parent.type === "case" && after.caseId === parent.id) ||
                (parent.type === "project" && after.projectId === parent.id)) &&
            after.status === input.toStatus &&
            after.swimlane === toSwimlane
                ? after
                : null

        const prevOrder = validBefore?.order ?? null
        const nextOrder = validAfter?.order ?? null

        const parentWhere: Prisma.TaskWhereInput =
            parent.type === "case" ? { tenantId, caseId: parent.id } : { tenantId, projectId: parent.id }
        const targetWhere: Prisma.TaskWhereInput = {
            ...parentWhere,
            status: input.toStatus,
            swimlane: toSwimlane,
        }

        let beforeIdForInsert = input.beforeTaskId ?? null
        let afterIdForInsert = input.afterTaskId ?? null

        let effectivePrevOrder = prevOrder
        let effectiveNextOrder = nextOrder

        if (effectivePrevOrder !== null && effectiveNextOrder === null) {
            const successor = await prisma.task.findFirst({
                where: {
                    ...targetWhere,
                    id: { not: moved.id },
                    order: { gt: effectivePrevOrder },
                },
                orderBy: { order: "asc" },
                select: { id: true, order: true },
            })
            if (successor) {
                effectiveNextOrder = successor.order
                afterIdForInsert = successor.id
            }
        } else if (effectivePrevOrder === null && effectiveNextOrder !== null) {
            const predecessor = await prisma.task.findFirst({
                where: {
                    ...targetWhere,
                    id: { not: moved.id },
                    order: { lt: effectiveNextOrder },
                },
                orderBy: { order: "desc" },
                select: { id: true, order: true },
            })
            if (predecessor) {
                effectivePrevOrder = predecessor.order
                beforeIdForInsert = predecessor.id
            }
        } else if (effectivePrevOrder === null && effectiveNextOrder === null) {
            const maxOrder = await prisma.task.aggregate({
                where: { ...targetWhere, id: { not: moved.id } },
                _max: { order: true },
            })
            effectivePrevOrder = maxOrder._max.order ?? null
        }

        const { order: newOrder, needsReindex } = computePersistedOrder(effectivePrevOrder, effectiveNextOrder)
        if (!needsReindex) {
            const updated = await prisma.task.updateMany({
                where: { id: moved.id, tenantId },
                data: {
                    status: input.toStatus,
                    swimlane: toSwimlane,
                    order: newOrder,
                },
            })

            if (updated.count === 0) {
                return { success: false, error: "目标列的任务过多（>10000），请缩小范围后重试" }
            }

            try {
                await touchTenantSignal({
                    tenantId,
                    kind: TenantSignalKind.TASKS_CHANGED,
                    payload: {
                        action: "moved",
                        taskId: moved.id,
                        caseId: parent.type === "case" ? parent.id : null,
                        projectId: parent.type === "project" ? parent.id : null,
                    } satisfies Prisma.InputJsonValue,
                })
            } catch (error) {
                logger.error("触发实时信号失败", error)
            }

            revalidatePath(parent.type === "case" ? `/cases/${parent.id}` : `/projects/${parent.id}`)
            if (parent.type === "project") {
                revalidatePath("/projects")
            }
            revalidatePath("/tasks")

            return {
                success: true,
                updates: [
                    {
                        taskId: moved.id,
                        order: newOrder,
                        status: input.toStatus,
                        swimlane: toSwimlane,
                    },
                ],
            }
        }

        const pageSize = 500
        const targetTasks: Array<{ id: string; order: number }> = []
        let cursor: { order: number; id: string } | null = null

        while (true) {
            const page: Array<{ id: string; order: number }> = await prisma.task.findMany({
                where: {
                    ...targetWhere,
                    id: { not: moved.id },
                    ...(cursor
                        ? {
                              OR: [
                                  { order: { gt: cursor.order } },
                                  { order: cursor.order, id: { gt: cursor.id } },
                              ],
                          }
                        : {}),
                },
                orderBy: [{ order: "asc" }, { id: "asc" }],
                select: { id: true, order: true },
                take: pageSize,
            })

            targetTasks.push(...page)

            if (page.length < pageSize) break
            const last = page[page.length - 1]!
            cursor = { order: last.order, id: last.id }

            if (targetTasks.length > 10_000) {
                return { success: false, error: "目标列的任务过多（>10000），请缩小范围后重试" }
            }
        }

        const targetIds = targetTasks.map((t) => t.id)
        let insertIndex = targetIds.length
        if (beforeIdForInsert && targetIds.includes(beforeIdForInsert)) {
            insertIndex = targetIds.indexOf(beforeIdForInsert) + 1
        } else if (afterIdForInsert && targetIds.includes(afterIdForInsert)) {
            insertIndex = targetIds.indexOf(afterIdForInsert)
        }

        const reorderedIds = [...targetIds.slice(0, insertIndex), moved.id, ...targetIds.slice(insertIndex)]

        const updates: ReorderTaskUpdate[] = reorderedIds.map((id, idx) => {
            const order = (idx + 1) * TASK_POSITION_GAP
            if (id === moved.id) {
                return {
                    taskId: id,
                    order,
                    status: input.toStatus,
                    swimlane: toSwimlane,
                }
            }
            return { taskId: id, order }
        })

        try {
            await prisma.$transaction(async (tx) => {
                const results = await Promise.all(
                    updates.map((u) =>
                        tx.task.updateMany({
                            where: { id: u.taskId, tenantId },
                            data: {
                                order: u.order,
                                ...(u.status ? { status: u.status } : {}),
                                ...(u.swimlane !== undefined ? { swimlane: u.swimlane } : {}),
                            },
                        })
                    )
                )

                if (results.some((r) => r.count === 0)) {
                    throw new Error("任务不存在或无权限")
                }
            })
        } catch (error) {
            if (error instanceof Error && error.message === "任务不存在或无权限") {
                const message = error.message
                return { success: false, error: message }
            }
            throw error
        }

        try {
            await touchTenantSignal({
                tenantId,
                kind: TenantSignalKind.TASKS_CHANGED,
                payload: {
                    action: "moved",
                    taskId: moved.id,
                    caseId: parent.type === "case" ? parent.id : null,
                    projectId: parent.type === "project" ? parent.id : null,
                    reindexed: true,
                    reindexedTaskCount: updates.length,
                } satisfies Prisma.InputJsonValue,
            })
        } catch (error) {
            logger.error("触发实时信号失败", error)
        }

        revalidatePath(parent.type === "case" ? `/cases/${parent.id}` : `/projects/${parent.id}`)
        if (parent.type === "project") {
            revalidatePath("/projects")
        }
        revalidatePath("/tasks")

        return { success: true, updates }
    } catch (error) {
        logger.error("看板移动任务失败", error)
        return { success: false, error: getActionErrorMessage(error, "看板移动任务失败") }
    }
}

