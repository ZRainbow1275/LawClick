"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import type { Event, Prisma } from "@prisma/client"
import { EventType, EventVisibility, EventStatus, EventParticipantStatus } from "@prisma/client"
import { logger } from "@/lib/logger"
import { checkRateLimit } from "@/lib/rate-limit"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import type { ActionResponse } from "@/lib/action-response"
import {
    getActiveTenantContextWithPermissionOrThrow,
    requireCaseAccess,
    requireProjectAccess,
} from "@/lib/server-auth"
import { ensureUsersInTenant } from "@/lib/tenant-guards"
import { z } from "zod"
import {
    canViewerSeeDetails,
    CreateEventInputSchema,
    EventIdSchema,
    getAccessibleCaseIdSet,
    GetAvailableSlotsInputSchema,
    GetEventOccurrencesInRangeInputSchema,
    maskEventForViewer,
    toIso,
    tryNotifyMeetingInviteReceivers,
    UpdateEventInputSchema,
    type CalendarEventDTO,
    type CalendarEventOccurrenceDTO,
    type Viewer,
} from "@/lib/events/event-domain"

export type { CalendarEventDTO, CalendarEventOccurrenceDTO } from "@/lib/events/event-domain"

// 日程 / 调度：领域类型与输入校验在 `src/lib/events/event-domain.ts` 内统一维护
export async function getEventOccurrencesInRange(input: {
    from: string | Date
    to: string | Date
    userIds?: string[]
    caseId?: string
    includeCancelled?: boolean
}) {
    try {
        const parsed = GetEventOccurrencesInRangeInputSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败", data: [] as CalendarEventOccurrenceDTO[] }
        }
        const request = parsed.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
        const rate = await enforceRateLimit({ ctx, action: "events.occurrences.range", limit: 600 })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [] as CalendarEventOccurrenceDTO[] }
        }
        const { tenantId } = ctx
        const viewer: Viewer = ctx.viewer

        const from = request.from
        const to = request.to
        if (from >= to) return { success: false as const, error: "时间范围不合法", data: [] as CalendarEventOccurrenceDTO[] }

        const maxRangeDays = 93
        const rangeDays = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)
        if (rangeDays > maxRangeDays) {
            return {
                success: false as const,
                error: `时间范围过大（最大 ${maxRangeDays} 天）`,
                data: [] as CalendarEventOccurrenceDTO[],
            }
        }

        const userIds = request.userIds?.length ? Array.from(new Set(request.userIds)) : [viewer.id]
        const selectedUserIdSet = new Set<string>(userIds)
        const usersOk = await ensureUsersInTenant({ tenantId, userIds })
        if (!usersOk) return { success: false as const, error: "参与人不存在或不在当前租户", data: [] as CalendarEventOccurrenceDTO[] }

        if (request.caseId) {
            await requireCaseAccess(request.caseId, viewer, "case:view")
        }

        const where: Prisma.EventWhereInput = {
            tenantId,
            ...(request.caseId ? { caseId: request.caseId } : {}),
            ...(request.includeCancelled ? {} : { status: EventStatus.SCHEDULED }),
            AND: [{ startTime: { lt: to } }, { endTime: { gt: from } }],
            OR: [
                { creatorId: { in: userIds } },
                { participants: { some: { userId: { in: userIds } } } },
            ],
        }

        const maxEvents = 5000
        const events = await prisma.event.findMany({
            where,
            include: {
                case: { select: { id: true, title: true, caseCode: true } },    
                task: { select: { id: true, title: true, caseId: true } },      
                creator: { select: { id: true, name: true } },
                participants: {
                    select: {
                        userId: true,
                        status: true,
                        user: { select: { id: true, name: true, avatarUrl: true } },
                    },
                },
            },
            orderBy: { startTime: "asc" },
            take: maxEvents + 1,
        })

        if (events.length > maxEvents) {
            return {
                success: false as const,
                error: "日程数量过多，请缩小时间范围或减少参与人",
                data: [] as CalendarEventOccurrenceDTO[],
            }
        }

        const caseIds = Array.from(new Set(events.map((e) => e.caseId).filter(Boolean))) as string[]
        const accessibleCaseIds = await getAccessibleCaseIdSet(viewer, caseIds)

        const occurrences: CalendarEventOccurrenceDTO[] = []

        for (const e of events) {
            const relatedUserIds = new Set<string>([
                e.creatorId,
                ...e.participants.filter((p) => p.status !== EventParticipantStatus.DECLINED).map((p) => p.userId),
            ])
            const canAccessCase = e.caseId ? accessibleCaseIds.has(e.caseId) : false
            const canViewDetails = canViewerSeeDetails(viewer, e, canAccessCase)

            const canEdit = e.creatorId === viewer.id

            const base: CalendarEventDTO = {
                id: e.id,
                title: e.title,
                description: e.description ?? null,
                type: e.type,
                visibility: e.visibility,
                status: e.status,
                startTime: toIso(e.startTime),
                endTime: toIso(e.endTime),
                location: e.location ?? null,
                case: canAccessCase && e.case ? e.case : null,
                task: canAccessCase && e.task ? { id: e.task.id, title: e.task.title } : null,
                 creator: e.creator ? { id: e.creator.id, name: e.creator.name ?? null } : null,
                 participants: canViewDetails ? e.participants : [],
                 canViewDetails,
                 canEdit,
             }

            const dto = canViewDetails ? base : { ...maskEventForViewer(base), case: null, task: null, creator: null, participants: [], canViewDetails: false, canEdit: false }

            for (const uid of relatedUserIds) {
                if (!selectedUserIdSet.has(uid)) continue
                occurrences.push({ userId: uid, event: dto })
            }
        }

        return { success: true as const, data: occurrences }
    } catch (error) {
        logger.error("获取日程范围失败", error, {
            from: String(input.from),
            to: String(input.to),
            userIdsCount: Array.isArray(input.userIds) ? input.userIds.length : 0,
            hasCaseId: Boolean(input.caseId),
        })
        return { success: false as const, error: "获取日程失败", data: [] as CalendarEventOccurrenceDTO[] }
    }
}

// ==============================================================================
// 获取单个日程
// ==============================================================================

export async function getEventById(id: string) {
    try {
        const parsedId = EventIdSchema.safeParse(id)
        if (!parsedId.success) {
            return { success: false as const, error: "输入校验失败" }
        }
        id = parsedId.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
        const rate = await enforceRateLimit({ ctx, action: "events.get", limit: 600, extraKey: id })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { tenantId } = ctx
        const viewer: Viewer = ctx.viewer

        const event = await prisma.event.findFirst({
            where: { id, tenantId },
            include: {
                case: { select: { id: true, title: true, caseCode: true } },
                task: { select: { id: true, title: true, caseId: true } },
                creator: { select: { id: true, name: true } },
                participants: {
                    select: {
                        userId: true,
                        status: true,
                        user: { select: { id: true, name: true, avatarUrl: true } },
                    },
                },
            },
        })

        if (!event) {
            return { success: false as const, error: "日程不存在" }
        }

        const accessibleCaseIds = await getAccessibleCaseIdSet(viewer, event.caseId ? [event.caseId] : [])
        const canAccessCase = event.caseId ? accessibleCaseIds.has(event.caseId) : false
        const canViewDetails = canViewerSeeDetails(viewer, event, canAccessCase)

        const dto: CalendarEventDTO = {
            id: event.id,
            title: event.title,
            description: event.description ?? null,
            type: event.type,
            visibility: event.visibility,
            status: event.status,
            startTime: toIso(event.startTime),
            endTime: toIso(event.endTime),
            location: event.location ?? null,
            case: canAccessCase && event.case ? event.case : null,
            task: canAccessCase && event.task ? { id: event.task.id, title: event.task.title } : null,
             creator: event.creator ? { id: event.creator.id, name: event.creator.name ?? null } : null,
             participants: canViewDetails ? event.participants : [],
             canViewDetails,
             canEdit: event.creatorId === viewer.id,
         }

        return {
            success: true as const,
            data: canViewDetails
                ? dto
                : {
                      ...maskEventForViewer(dto),
                      case: null,
                      task: null,
                      creator: null,
                      participants: [],
                      canViewDetails: false,
                      canEdit: false,
                  },
        }
    } catch (error) {
        logger.error("get event detail failed", error)
        return { success: false as const, error: "获取日程详情失败" }
    }
}

// ==============================================================================
// 创建日程
// ==============================================================================

export async function createEvent(data: {
    title: string
    description?: string
    type?: string
    startTime: Date | string
    endTime: Date | string
    location?: string
    caseId?: string
    taskId?: string
    visibility?: string
    participantIds?: string[]
}): Promise<ActionResponse<{ data: Event }>> {
    try {
        const parsed = CreateEventInputSchema.safeParse(data)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        const request = parsed.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
        const rate = await enforceRateLimit({ ctx, action: "events.create", limit: 120 })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { user, tenantId, viewer } = ctx

        const startTime = request.startTime
        const endTime = request.endTime
        if (startTime >= endTime) {
            return { success: false as const, error: "结束时间必须晚于开始时间" }
        }

        let caseId = request.caseId || null
        if (request.taskId) {
            const task = await prisma.task.findFirst({
                where: { id: request.taskId, tenantId },
                select: { id: true, caseId: true, projectId: true, assigneeId: true },
            })
            if (!task) return { success: false as const, error: "任务不存在" }
            if (task.caseId) {
                if (caseId && caseId !== task.caseId) {
                    return { success: false as const, error: "任务不属于该案件" }
                }
                await requireCaseAccess(task.caseId, viewer, "case:view")
                caseId = task.caseId
            } else if (task.projectId) {
                if (caseId) {
                    return { success: false as const, error: "项目任务不能绑定案件" }
                }
                await requireProjectAccess(task.projectId, viewer, "task:view")
            } else if (user.role !== "PARTNER" && user.role !== "ADMIN") {
                if (!task.assigneeId || task.assigneeId !== user.id) {
                    return { success: false as const, error: "无任务访问权限" }
                }
            }
        }

        if (caseId) {
            await requireCaseAccess(caseId, viewer, "case:view")
        }

        const participantIds = Array.from(new Set((request.participantIds || []).filter(Boolean))).filter((id) => id !== user.id)
        const participantsOk = await ensureUsersInTenant({ tenantId, userIds: participantIds })
        if (!participantsOk) {
            return { success: false as const, error: "参与人不存在或不在当前租户" }
        }
        const visibility = request.visibility || (caseId ? EventVisibility.CASE_TEAM : EventVisibility.TEAM_BUSY)

        const event = await prisma.$transaction(async (tx) => {
            const created = await tx.event.create({
                data: {
                    tenantId,
                    title: request.title,
                    description: request.description,
                    type: request.type || EventType.MEETING,
                    visibility,
                    status: EventStatus.SCHEDULED,
                    startTime,
                    endTime,
                    location: request.location,
                    caseId,
                    taskId: request.taskId || null,
                    creatorId: user.id,
                },
            })

            await tx.eventParticipant.createMany({
                data: [
                    { eventId: created.id, userId: user.id, status: EventParticipantStatus.ACCEPTED },
                    ...participantIds.map((id) => ({ eventId: created.id, userId: id, status: EventParticipantStatus.INVITED })),
                ],
                skipDuplicates: true,
            })

            if (participantIds.length > 0) {
                await tx.collaborationInvite.createMany({
                    data: participantIds.map((receiverId) => ({
                        type: "MEETING",
                        targetId: created.id,
                        senderId: user.id,
                        receiverId,
                        message: `邀请您参加：${created.title}`,
                    })),
                })

                await tryNotifyMeetingInviteReceivers({
                    tenantId,
                    actor: { id: user.id, name: user.name ?? null, email: user.email },
                    receiverIds: participantIds,
                    event: { id: created.id, title: created.title },
                    tx,
                })
            }

            return created
        })

        revalidatePath("/calendar")
        revalidatePath("/dispatch")
        if (caseId) {
            revalidatePath(`/cases/${caseId}`)
        }
        if (participantIds.length > 0) {
            revalidatePath("/invites")
            revalidatePath("/notifications")
        }
        return { success: true, data: event }
    } catch (error) {
        logger.error("create event failed", error)
        return { success: false, error: '创建日程失败' }
    }
}

// ==============================================================================
// 更新日程
// ==============================================================================

export type UpdateEventInput = z.input<typeof UpdateEventInputSchema>

export async function updateEvent(id: string, data: UpdateEventInput): Promise<ActionResponse<{ data: Event }>> {
    try {
        const parsedId = EventIdSchema.safeParse(id)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败" }
        }
        id = parsedId.data

        const parsedData = UpdateEventInputSchema.safeParse(data)
        if (!parsedData.success) {
            return { success: false, error: parsedData.error.issues[0]?.message || "输入校验失败" }
        }
        const request = parsedData.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
        const rate = await enforceRateLimit({ ctx, action: "events.update", limit: 120, extraKey: id })
        if (!rate.allowed) {
            return { success: false, error: rate.error }
        }
        const { user, tenantId, viewer } = ctx

        const existing = await prisma.event.findFirst({
            where: { id, tenantId },
            include: { participants: { select: { userId: true, status: true } } },
        })
        if (!existing) {
            return { success: false, error: "日程不存在" }
        }

        const canEdit = existing.creatorId === user.id
        if (!canEdit) {
            return { success: false, error: "只有创建者可以编辑日程" }
        }

        let caseId = request.caseId ?? existing.caseId
        if (request.taskId) {
            const task = await prisma.task.findFirst({
                where: { id: request.taskId, tenantId },
                select: { id: true, caseId: true, projectId: true, assigneeId: true },
            })
            if (!task) return { success: false as const, error: "任务不存在" }
            if (task.caseId) {
                if (caseId && caseId !== task.caseId) {
                    return { success: false as const, error: "任务不属于该案件" }
                }
                await requireCaseAccess(task.caseId, viewer, "case:view")
                caseId = task.caseId
            } else if (task.projectId) {
                if (caseId) {
                    return { success: false as const, error: "项目任务不能绑定案件" }
                }
                await requireProjectAccess(task.projectId, viewer, "task:view")
            } else if (user.role !== "PARTNER" && user.role !== "ADMIN") {
                if (!task.assigneeId || task.assigneeId !== user.id) {
                    return { success: false as const, error: "无任务访问权限" }
                }
            }
        }
        if (caseId) {
            await requireCaseAccess(caseId, viewer, "case:view")
        }

        const nextStart = request.startTime ?? existing.startTime
        const nextEnd = request.endTime ?? existing.endTime
        if (nextStart >= nextEnd) return { success: false as const, error: "结束时间必须晚于开始时间" }

        const participantIds = request.participantIds
            ? Array.from(new Set(request.participantIds.filter(Boolean))).filter((pid) => pid !== user.id)
            : null
        if (participantIds) {
            const ok = await ensureUsersInTenant({ tenantId, userIds: participantIds })
            if (!ok) return { success: false as const, error: "参与人不存在或不在当前租户" }
        }

        const updated = await prisma.$transaction(async (tx) => {
            const event = await tx.event.update({
                where: { id },
                data: {
                    title: request.title,
                    description: request.description,
                    type: request.type,
                    startTime: request.startTime ? nextStart : undefined,
                    endTime: request.endTime ? nextEnd : undefined,
                    location: request.location,
                    caseId,
                    taskId: request.taskId ?? undefined,
                    visibility: request.visibility,
                },
            })

            if (participantIds) {
                const existingIds = new Set(existing.participants.map((p) => p.userId))
                const desiredIds = new Set([user.id, ...participantIds])

                const toRemove = Array.from(existingIds).filter((pid) => pid !== user.id && !desiredIds.has(pid))
                const toAdd = Array.from(desiredIds).filter((pid) => pid !== user.id && !existingIds.has(pid))

                if (toRemove.length > 0) {
                    await tx.eventParticipant.deleteMany({ where: { eventId: id, userId: { in: toRemove } } })
                }

                if (toAdd.length > 0) {
                    await tx.eventParticipant.createMany({
                        data: toAdd.map((pid) => ({ eventId: id, userId: pid, status: EventParticipantStatus.INVITED })),
                        skipDuplicates: true,
                    })

                    await tx.collaborationInvite.createMany({
                        data: toAdd.map((receiverId) => ({
                            type: "MEETING",
                            targetId: id,
                            senderId: user.id,
                            receiverId,
                            message: `邀请您参加：${event.title}`,
                        })),
                    })

                    await tryNotifyMeetingInviteReceivers({
                        tenantId,
                        actor: { id: user.id, name: user.name ?? null, email: user.email },
                        receiverIds: toAdd,
                        event: { id, title: event.title },
                        tx,
                    })
                }
            }

            return event
        })

        revalidatePath('/calendar')
        revalidatePath("/dispatch")
        if (caseId) {
            revalidatePath(`/cases/${caseId}`)
        }
        if (participantIds) {
            revalidatePath("/invites")
            revalidatePath("/notifications")
        }
        return { success: true, data: updated }
    } catch (error) {
        logger.error("update event failed", error)
        return { success: false, error: '更新日程失败' }
    }
}

// ==============================================================================
// 取消/删除日程（取消优先）
// ==============================================================================

export async function cancelEvent(id: string): Promise<ActionResponse> {
    try {
        const parsedId = EventIdSchema.safeParse(id)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败" }
        }
        id = parsedId.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
        const rate = await enforceRateLimit({ ctx, action: "events.cancel", limit: 60, extraKey: id })
        if (!rate.allowed) {
            return { success: false, error: rate.error }
        }
        const { user, tenantId, viewer } = ctx

        const existing = await prisma.event.findFirst({
            where: { id, tenantId },
            select: { creatorId: true, caseId: true },
        })
        if (!existing) return { success: false, error: "日程不存在" }
        if (existing.creatorId !== user.id) return { success: false, error: "只有创建者可以取消日程" }
        if (existing.caseId) {
            await requireCaseAccess(existing.caseId, viewer, "case:view")
        }

        const updated = await prisma.event.updateMany({
            where: { id, tenantId, creatorId: user.id },
            data: { status: EventStatus.CANCELLED },
        })
        if (updated.count === 0) return { success: false, error: "日程不存在" }

        revalidatePath("/calendar")
        revalidatePath("/dispatch")
        if (existing.caseId) {
            revalidatePath(`/cases/${existing.caseId}`)
        }
        return { success: true }
    } catch (error) {
        logger.error("cancel event failed", error)
        return { success: false, error: "取消日程失败" }
    }
}

export async function deleteEvent(id: string): Promise<ActionResponse> {
    try {
        const parsedId = EventIdSchema.safeParse(id)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败" }
        }
        id = parsedId.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
        const rate = await enforceRateLimit({ ctx, action: "events.delete", limit: 60, extraKey: id })
        if (!rate.allowed) {
            return { success: false, error: rate.error }
        }
        const { user, tenantId, viewer } = ctx

        const existing = await prisma.event.findFirst({
            where: { id, tenantId },
            select: { caseId: true, creatorId: true },
        })
        if (!existing) {
            return { success: false, error: "日程不存在" }
        }
        if (existing.creatorId !== user.id) {
            return { success: false, error: "只有创建者可以删除日程" }
        }
        if (existing.caseId) {
            await requireCaseAccess(existing.caseId, viewer, "case:view")
        }

        const deleted = await prisma.event.deleteMany({
            where: { id, tenantId, creatorId: user.id },
        })
        if (deleted.count === 0) return { success: false, error: "日程不存在" }

        revalidatePath('/calendar')
        revalidatePath("/dispatch")
        if (existing.caseId) {
            revalidatePath(`/cases/${existing.caseId}`)
        }
        return { success: true }
    } catch (error) {
        logger.error("delete event failed", error)
        return { success: false, error: '删除日程失败' }
    }
}

// ==============================================================================
// 可用时段计算（MVP）：工作时段交集 - 忙碌事件差集
// ==============================================================================

type Slot = { startTime: string; endTime: string }

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
    return aStart < bEnd && bStart < aEnd
}

function addMinutes(date: Date, minutes: number) {
    return new Date(date.getTime() + minutes * 60_000)
}

export async function getAvailableSlots(input: {
    userIds: string[]
    from: string | Date
    to: string | Date
    durationMinutes: number
    slotIntervalMinutes?: number
}) {
    try {
        const parsed = GetAvailableSlotsInputSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败", data: [] as { date: string; slots: Slot[] }[] }
        }
        const request = parsed.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
        const { tenantId, user } = ctx

        const from = request.from
        const to = request.to
        if (from >= to) return { success: false as const, error: "时间范围不合法", data: [] as { date: string; slots: Slot[] }[] }

        const maxRangeMs = 31 * 24 * 60 * 60 * 1000
        if (to.getTime() - from.getTime() > maxRangeMs) {
            return { success: false as const, error: "时间范围过大（最多 31 天）", data: [] as { date: string; slots: Slot[] }[] }
        }

        const durationMinutes = request.durationMinutes
        const slotIntervalMinutes = request.slotIntervalMinutes ?? 30

        const userIds = Array.from(new Set(request.userIds))
        if (userIds.length === 0) return { success: false as const, error: "请选择参与人", data: [] as { date: string; slots: Slot[] }[] }

        const sizeBucket = userIds.length >= 200 ? "200+" : userIds.length >= 100 ? "100-199" : userIds.length >= 30 ? "30-99" : "1-29"
        const limit = sizeBucket === "200+" ? 3 : sizeBucket === "100-199" ? 6 : sizeBucket === "30-99" ? 12 : 20
        const rate = await checkRateLimit({
            key: `schedule:availableSlots:tenant:${tenantId}:user:${user.id}:bucket:${sizeBucket}`,
            limit,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            logger.warn("get available slots rate limited", {
                tenantId,
                userId: user.id,
                retryAfterSeconds: rate.retryAfterSeconds,
                sizeBucket,
            })
            return {
                success: false as const,
                error: `请求过于频繁，请在 ${rate.retryAfterSeconds} 秒后重试`,
                data: [] as { date: string; slots: Slot[] }[],
            }
        }

        const usersOk = await ensureUsersInTenant({ tenantId, userIds })
        if (!usersOk) return { success: false as const, error: "参与人不存在或不在当前租户", data: [] as { date: string; slots: Slot[] }[] }

        // 1) 获取/初始化默认排班（仅用于计算；未做完整 UI 管理）
        const schedules = await prisma.schedule.findMany({
            where: { tenantId, userId: { in: userIds }, isDefault: true },      
            include: { rules: true },
            take: userIds.length,
        })

        const scheduleByUser = new Map<string, { timeZone: string; rules: { dayOfWeek: number; startMinute: number; endMinute: number }[] }>()
        for (const s of schedules) {
            scheduleByUser.set(s.userId, { timeZone: s.timeZone, rules: s.rules.map((r) => ({ dayOfWeek: r.dayOfWeek, startMinute: r.startMinute, endMinute: r.endMinute })) })
        }

        // 2) 查询忙碌区间：事件 + 外出
        const maxBusyIntervals = 10_000
        const [events, ooo] = await Promise.all([
            prisma.event.findMany({
                where: {
                    tenantId,
                    status: EventStatus.SCHEDULED,
                    AND: [{ startTime: { lt: to } }, { endTime: { gt: from } }],
                    OR: [
                        { creatorId: { in: userIds } },
                        { participants: { some: { userId: { in: userIds } } } },
                    ],
                },
                select: {
                    id: true,
                    creatorId: true,
                    startTime: true,
                    endTime: true,
                    participants: { select: { userId: true, status: true } },   
                },
                orderBy: { startTime: "asc" },
                take: maxBusyIntervals + 1,
            }),
            prisma.outOfOffice.findMany({
                where: {
                    tenantId,
                    userId: { in: userIds },
                    AND: [{ startTime: { lt: to } }, { endTime: { gt: from } }],
                },
                select: { userId: true, startTime: true, endTime: true },       
                orderBy: { startTime: "asc" },
                take: maxBusyIntervals + 1,
            }),
        ])

        if (events.length > maxBusyIntervals || ooo.length > maxBusyIntervals) {
            return {
                success: false as const,
                error: "忙碌数据过多，请缩小时间范围或减少参与人",
                data: [] as { date: string; slots: Slot[] }[],
            }
        }

        const busyByUser = new Map<string, { startTime: Date; endTime: Date }[]>()
        for (const uid of userIds) busyByUser.set(uid, [])

        for (const e of events) {
            const related = new Set<string>()
            related.add(e.creatorId)
            for (const p of e.participants) {
                if (p.status === EventParticipantStatus.DECLINED) continue
                related.add(p.userId)
            }
            for (const uid of related) {
                const bucket = busyByUser.get(uid)
                if (!bucket) continue
                bucket.push({ startTime: e.startTime, endTime: e.endTime })
            }
        }
        for (const entry of ooo) {
            busyByUser.get(entry.userId)?.push({ startTime: entry.startTime, endTime: entry.endTime })
        }

        for (const [uid, intervals] of busyByUser.entries()) {
            if (intervals.length <= 1) continue
            const sorted = intervals
                .slice()
                .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
            const merged: { startTime: Date; endTime: Date }[] = []
            for (const interval of sorted) {
                const last = merged[merged.length - 1]
                if (!last || interval.startTime >= last.endTime) {
                    merged.push({ startTime: interval.startTime, endTime: interval.endTime })
                    continue
                }
                if (interval.endTime > last.endTime) last.endTime = interval.endTime
            }
            busyByUser.set(uid, merged)
        }

        // 3) 枚举槽位（MVP，适配 30-300 人排期推荐）
        const results: { date: string; slots: Slot[] }[] = []

        const cursor = new Date(from)
        cursor.setHours(0, 0, 0, 0)

        while (cursor < to) {
            const dayStart = new Date(cursor)
            const dayEnd = new Date(cursor)
            dayEnd.setHours(23, 59, 59, 999)

            const slots: Slot[] = []

            // 全员工作时段交集：先用“最保守默认”兜底（09:00-18:00）
            const defaultWindows = [{ startMinute: 9 * 60, endMinute: 18 * 60 }]

            const windowsByUser = userIds.map((uid) => {
                const schedule = scheduleByUser.get(uid)
                const rules = schedule?.rules?.filter((r) => r.dayOfWeek === dayStart.getDay()) ?? []
                if (rules.length === 0) return defaultWindows
                return rules.map((r) => ({ startMinute: r.startMinute, endMinute: r.endMinute }))
            })

            const dayFrom = from > dayStart ? from : dayStart
            const dayTo = to < dayEnd ? to : dayEnd

            // 以 30min 步长枚举候选起点
            for (let minute = 0; minute <= 24 * 60 - durationMinutes; minute += slotIntervalMinutes) {
                const start = new Date(dayStart)
                start.setMinutes(minute, 0, 0)
                const end = addMinutes(start, durationMinutes)
                const startMinute = minute
                const endMinute = minute + durationMinutes

                if (start < dayFrom || end > dayTo) continue

                let ok = true

                for (let i = 0; i < userIds.length && ok; i++) {
                    const uid = userIds[i]
                    const windows = windowsByUser[i]

                    const withinWorking = windows.some((w) => startMinute >= w.startMinute && endMinute <= w.endMinute)
                    if (!withinWorking) {
                        ok = false
                        break
                    }

                    const busy = busyByUser.get(uid) || []
                    if (busy.some((b) => overlaps(start, end, b.startTime, b.endTime))) {
                        ok = false
                        break
                    }
                }

                if (ok) {
                    slots.push({ startTime: toIso(start), endTime: toIso(end) })
                }
            }

            if (slots.length > 0) {
                results.push({ date: dayStart.toISOString().slice(0, 10), slots: slots.slice(0, 24) })
            }

            cursor.setDate(cursor.getDate() + 1)
        }

        return { success: true as const, data: results }
    } catch (error) {
        logger.error("get available slots failed", error)
        return { success: false as const, error: "获取可用时段失败", data: [] as { date: string; slots: Slot[] }[] }
    }
}
