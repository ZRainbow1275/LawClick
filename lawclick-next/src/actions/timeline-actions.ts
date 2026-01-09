"use server"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { getActiveTenantContextWithPermissionOrThrow, requireCaseAccess } from "@/lib/server-auth"
import { UuidSchema } from "@/lib/zod"
import type { ActionResponse } from "@/lib/action-response"

// ==============================================================================
// 时间线事件类型
// ==============================================================================

export interface TimelineEvent {
    id: string
    type: 'stage_change' | 'task_complete' | 'document_upload' | 'event' | 'timelog' | 'party_add'
    title: string
    description?: string
    timestamp: Date
    userId?: string
    userName?: string
    metadata?: Record<string, unknown>
}

// ==============================================================================
// 获取案件时间线
// ==============================================================================

export async function getCaseTimeline(caseId: string): Promise<ActionResponse<{ data: TimelineEvent[] }, { data: TimelineEvent[] }>> {
    try {
        const parsedId = UuidSchema.safeParse(caseId)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败", data: [] }
        }
        caseId = parsedId.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("case:view")
        const { tenantId, viewer } = ctx

        const rate = await enforceRateLimit({
            ctx,
            action: "timeline.case.get",
            limit: 600,
            extraKey: caseId,
        })
        if (!rate.allowed) return { success: false, error: rate.error, data: [] }

        await requireCaseAccess(caseId, viewer, "case:view")

        const timeline: TimelineEvent[] = []

        // 1. 获取案件事件
        const events = await prisma.event.findMany({
            where: { tenantId, caseId },
            include: { creator: true },
            orderBy: { startTime: 'desc' },
            take: 20
        })

        events.forEach(event => {
            timeline.push({
                id: `event-${event.id}`,
                type: 'event',
                title: event.title,
                description: event.location || undefined,
                timestamp: event.startTime,
                userId: event.creatorId || undefined,
                userName: event.creator?.name || undefined,
                metadata: { type: event.type }
            })
        })

        // 2. 获取已完成任务
        const completedTasks = await prisma.task.findMany({
            where: { tenantId, caseId, status: 'DONE' },
            include: { assignee: true },
            orderBy: { updatedAt: 'desc' },
            take: 20
        })

        completedTasks.forEach(task => {
            timeline.push({
                id: `task-${task.id}`,
                type: 'task_complete',
                title: `任务完成: ${task.title}`,
                timestamp: task.updatedAt,
                userId: task.assigneeId || undefined,
                userName: task.assignee?.name || undefined
            })
        })

        // 3. 获取文档上传记录
        const documents = await prisma.document.findMany({
            where: { caseId },
            orderBy: { createdAt: 'desc' },
            take: 20
        })

        documents.forEach(doc => {
            timeline.push({
                id: `doc-${doc.id}`,
                type: 'document_upload',
                title: `上传文档: ${doc.title}`,
                timestamp: doc.createdAt,
                metadata: { fileType: doc.fileType }
            })
        })

        // 4. 获取工时记录
        const timeLogs = await prisma.timeLog.findMany({
            where: { tenantId, caseId, status: 'COMPLETED' },
            include: { user: true },
            orderBy: { endTime: 'desc' },
            take: 10
        })

        timeLogs.forEach(log => {
            const hours = log.duration ? Math.round(log.duration / 3600 * 10) / 10 : 0
            timeline.push({
                id: `timelog-${log.id}`,
                type: 'timelog',
                title: `记录工时: ${hours}小时`,
                description: log.description || undefined,
                timestamp: log.endTime || log.startTime,
                userId: log.userId,
                userName: log.user?.name || undefined
            })
        })

        // 5. 获取当事人添加记录
        const parties = await prisma.party.findMany({
            where: { caseId },
            orderBy: { createdAt: 'desc' },
            take: 10
        })

        parties.forEach(party => {
            timeline.push({
                id: `party-${party.id}`,
                type: 'party_add',
                title: `添加当事人: ${party.name}`,
                timestamp: party.createdAt,
                metadata: { type: party.type, relation: party.relation }
            })
        })

        // 按时间排序
        timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

        return { success: true, data: timeline.slice(0, 50) }
    } catch (error) {
        logger.error("获取时间线失败", error)
        return { success: false, error: '获取时间线失败', data: [] }
    }
}
