import "server-only"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import {
    AuthError,
    PermissionError,
    getActiveTenantContextWithPermissionOrThrow,
} from "@/lib/server-auth"

export async function getMyInvitesImpl(type: "sent" | "received" = "received") {
    try {
        const parsed = z.enum(["sent", "received"]).safeParse(type)
        if (!parsed.success) {
            return { success: false as const, error: "输入校验失败", data: [] }
        }
        type = parsed.data

        let ctx: Awaited<ReturnType<typeof getActiveTenantContextWithPermissionOrThrow>>
        try {
            ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
        } catch (error) {
            if (error instanceof AuthError) {
                return { success: false as const, error: "请先登录", data: [] }
            }
            if (error instanceof PermissionError) {
                return {
                    success: false as const,
                    error: getPublicActionErrorMessage(error, "权限不足"),
                    data: [],
                }
            }
            throw error
        }

        const { user, tenantId } = ctx

        const rate = await enforceRateLimit({
            ctx,
            action: "collaboration.invites.list",
            limit: 240,
        })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [] }
        }

        const invites = await prisma.collaborationInvite.findMany({
            where:
                type === "sent"
                    ? {
                          senderId: user.id,
                          sender: {
                              tenantMemberships: {
                                  some: { tenantId, status: "ACTIVE" },
                              },
                          },
                          receiver: {
                              tenantMemberships: {
                                  some: { tenantId, status: "ACTIVE" },
                              },
                          },
                      }
                    : {
                          receiverId: user.id,
                          sender: {
                              tenantMemberships: {
                                  some: { tenantId, status: "ACTIVE" },
                              },
                          },
                          receiver: {
                              tenantMemberships: {
                                  some: { tenantId, status: "ACTIVE" },
                              },
                          },
                      },
            include: {
                sender: { select: { id: true, name: true, avatarUrl: true } },
                receiver: { select: { id: true, name: true, avatarUrl: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 200,
        })

        const meetingIds = invites
            .filter((i) => i.type === "MEETING")
            .map((i) => i.targetId)
        const taskIds = invites.filter((i) => i.type === "TASK").map((i) => i.targetId)
        const caseIds = invites.filter((i) => i.type === "CASE").map((i) => i.targetId)

        const [events, tasks, cases] = await Promise.all([
            meetingIds.length
                ? prisma.event.findMany({
                      where: { tenantId, id: { in: meetingIds } },
                      select: {
                          id: true,
                          title: true,
                          startTime: true,
                          endTime: true,
                          type: true,
                      },
                      take: meetingIds.length,
                  })
                : Promise.resolve([]),
            taskIds.length
                ? prisma.task.findMany({
                      where: { tenantId, id: { in: taskIds } },
                      select: { id: true, title: true, dueDate: true, caseId: true },
                      take: taskIds.length,
                  })
                : Promise.resolve([]),
            caseIds.length
                ? prisma.case.findMany({
                      where: { tenantId, id: { in: caseIds } },
                      select: { id: true, title: true, caseCode: true },
                      take: caseIds.length,
                  })
                : Promise.resolve([]),
        ])

        const eventById = new Map(events.map((e) => [e.id, e]))
        const taskById = new Map(tasks.map((t) => [t.id, t]))
        const caseById = new Map(cases.map((c) => [c.id, c]))

        const enriched = invites.map((invite) => {
            if (invite.type === "MEETING") {
                return { ...invite, target: eventById.get(invite.targetId) || null }
            }
            if (invite.type === "TASK") {
                return { ...invite, target: taskById.get(invite.targetId) || null }
            }
            if (invite.type === "CASE") {
                return { ...invite, target: caseById.get(invite.targetId) || null }
            }
            return { ...invite, target: null }
        })

        return { success: true as const, data: enriched }
    } catch (error) {
        logger.error("获取邀请失败", error)
        return { success: false as const, error: "获取邀请失败", data: [] }
    }
}

