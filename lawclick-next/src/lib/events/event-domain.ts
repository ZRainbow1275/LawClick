import "server-only"

import type { Prisma, Role } from "@prisma/client"
import {
    EventParticipantStatus,
    EventStatus,
    EventType,
    EventVisibility,
    NotificationType,
} from "@prisma/client"
import { z } from "zod"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { notifyUsersWithEmailQueue } from "@/lib/notifications"
import { getCaseListAccessWhereOrNull } from "@/lib/server-auth"
import { DateInputSchema, OptionalNonEmptyString, UuidSchema } from "@/lib/zod"

export type Viewer = { id: string; role: Role; tenantId: string }

export function isViewerInEvent(
    viewer: Viewer,
    event: { creatorId: string; participants?: { userId: string }[] }
) {
    if (event.creatorId === viewer.id) return true
    return (event.participants || []).some((p) => p.userId === viewer.id)
}

export function canViewerSeeDetails(
    viewer: Viewer,
    event: {
        creatorId: string
        visibility: EventVisibility
        participants?: { userId: string }[]
    },
    canAccessCase: boolean
) {
    if (isViewerInEvent(viewer, event)) return true

    if (event.visibility === EventVisibility.TEAM_PUBLIC) return true
    if (event.visibility === EventVisibility.CASE_TEAM) return canAccessCase

    // PRIVATE / TEAM_BUSY：非参与人一律 Busy-only
    return false
}

export function maskEventForViewer<
    T extends {
        title: string
        description?: string | null
        location?: string | null
    }
>(event: T) {
    return {
        ...event,
        title: "忙碌",
        description: null,
        location: null,
    }
}

export async function getAccessibleCaseIdSet(user: Viewer, caseIds: string[]) {
    if (caseIds.length === 0) return new Set<string>()
    const accessWhere = getCaseListAccessWhereOrNull(user, "case:view")
    if (!accessWhere) return new Set<string>()

    const rows = await prisma.case.findMany({
        where: {
            AND: [{ id: { in: caseIds } }, accessWhere],
        },
        select: { id: true },
        take: caseIds.length,
    })
    return new Set(rows.map((r) => r.id))
}

export type CalendarEventDTO = {
    id: string
    title: string
    description: string | null
    type: EventType
    visibility: EventVisibility
    status: EventStatus
    startTime: string
    endTime: string
    location: string | null
    case: { id: string; title: string; caseCode: string | null } | null
    task: { id: string; title: string } | null
    creator: { id: string; name: string | null } | null
    participants: {
        userId: string
        status: EventParticipantStatus
        user: { id: string; name: string | null; avatarUrl: string | null }
    }[]
    canViewDetails: boolean
    canEdit: boolean
}

export type CalendarEventOccurrenceDTO = {
    userId: string
    event: CalendarEventDTO
}

export function toIso(date: Date) {
    return date.toISOString()
}

export async function tryNotifyMeetingInviteReceivers(input: {
    tenantId: string
    actor: { id: string; name: string | null; email: string }
    receiverIds: string[]
    event: { id: string; title: string }
    tx: Prisma.TransactionClient
}) {
    const receiverIds = Array.from(
        new Set((input.receiverIds || []).filter(Boolean))
    ).filter((id) => id !== input.actor.id)
    if (receiverIds.length === 0) return

    try {
        const senderName =
            input.actor.name || input.actor.email.split("@")[0] || "同事"
        await notifyUsersWithEmailQueue(
            {
                tenantId: input.tenantId,
                userIds: receiverIds,
                type: NotificationType.INVITE_RECEIVED,
                title: "新的协作邀请：会议",
                content: `${senderName} 邀请你参加会议：${input.event.title}`,
                actionUrl: "/invites",
                actorId: input.actor.id,
                metadata: { inviteType: "MEETING", targetId: input.event.id },
            },
            input.tx
        )
    } catch (error) {
        logger.error("meeting invite notification failed", error, {
            tenantId: input.tenantId,
        })
    }
}

export const EventIdSchema = UuidSchema

export const GetEventOccurrencesInRangeInputSchema = z
    .object({
        from: DateInputSchema,
        to: DateInputSchema,
        userIds: z.array(UuidSchema).min(1).max(300).optional(),
        caseId: UuidSchema.optional(),
        includeCancelled: z.boolean().optional(),
    })
    .strict()

export const CreateEventInputSchema = z
    .object({
        title: z.string().trim().min(1, "标题不能为空").max(200),
        description: OptionalNonEmptyString(5000),
        type: z.nativeEnum(EventType).optional(),
        startTime: DateInputSchema,
        endTime: DateInputSchema,
        location: OptionalNonEmptyString(200),
        caseId: UuidSchema.optional(),
        taskId: UuidSchema.optional(),
        visibility: z.nativeEnum(EventVisibility).optional(),
        participantIds: z.array(UuidSchema).max(300).optional(),
    })
    .strict()

export const UpdateEventInputSchema = z
    .object({
        title: OptionalNonEmptyString(200),
        description: OptionalNonEmptyString(5000),
        type: z.nativeEnum(EventType).optional(),
        startTime: DateInputSchema.optional(),
        endTime: DateInputSchema.optional(),
        location: OptionalNonEmptyString(200),
        caseId: UuidSchema.optional(),
        taskId: UuidSchema.optional(),
        visibility: z.nativeEnum(EventVisibility).optional(),
        participantIds: z.array(UuidSchema).max(300).optional(),
    })
    .strict()

export const GetAvailableSlotsInputSchema = z
    .object({
        userIds: z
            .array(UuidSchema)
            .min(1)
            .max(300, "最多支持 300 人参与排期"),
        from: DateInputSchema,
        to: DateInputSchema,
        durationMinutes: z.number().int().min(1).max(8 * 60),
        slotIntervalMinutes: z.number().int().min(5).max(120).optional(),
    })
    .strict()

