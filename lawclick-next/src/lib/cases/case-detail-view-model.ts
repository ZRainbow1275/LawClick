import type { CaseRole, Prisma, TaskStatus } from "@prisma/client"

type CaseUserView = { id: string; name: string | null; email: string; image: string | null }

type DbUser = Prisma.UserGetPayload<{ select: { id: true; name: true; email: true; avatarUrl: true } }>

export type CaseTaskStats = {
    total: number
    done: number
    openTotal: number
    progress: number
    counts: Record<TaskStatus, number>
}

export type CaseTaskPreview = {
    id: string
    title: string
    status: TaskStatus
    dueDate: Date | null
    updatedAt: Date
}

type DbCaseDetailsPayload = Prisma.CaseGetPayload<{
    include: {
        events: true
        documents: true
        members: { include: { user: true } }
        originator: true
        handler: true
        client: true
    }
}>

export type CaseDetailsPayload = Omit<DbCaseDetailsPayload, "contractValue"> & {
    contractValue: number | null
    taskStats: CaseTaskStats
    openTasksPreview: CaseTaskPreview[]
}

export function buildCaseDetailViewModel(input: { caseItem: CaseDetailsPayload; currentUser: DbUser | null }) {
    const { caseItem, currentUser } = input

    const safeUser = (
        u: { id: string; name: string | null; email: string; avatarUrl?: string | null } | null | undefined
    ): CaseUserView | null =>
        u
            ? {
                  id: u.id,
                  name: u.name,
                  email: u.email,
                  image: u.avatarUrl || null,
              }
            : null

    const safeCurrentUser = safeUser(currentUser)

    const progress = caseItem.taskStats.progress

    const safeMembers = (caseItem.members || [])
        .map((m) => ({ role: m.role, user: safeUser(m.user) }))
        .filter((m): m is { role: CaseRole; user: CaseUserView } => m.user !== null)

    const safeEvents = (caseItem.events || []).map((event) => ({
        id: event.id,
        title: event.title,
        description: event.description ?? null,
        type: event.type,
        visibility: event.visibility,
        status: event.status,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location ?? null,
        caseId: event.caseId,
        taskId: event.taskId,
    }))

    const viewModel = {
        id: caseItem.id,
        caseCode: caseItem.caseCode,
        title: caseItem.title,
        status: caseItem.status,
        serviceType: caseItem.serviceType,
        billingMode: caseItem.billingMode,
        description: caseItem.description,
        contractValue: caseItem.contractValue ?? 0,
        currentStage: caseItem.currentStage,
        templateId: caseItem.templateId,
        createdAt: caseItem.createdAt,
        updatedAt: caseItem.updatedAt,
        clientId: caseItem.clientId,
        originatorId: caseItem.originatorId,
        handlerId: caseItem.handlerId,
        channelId: caseItem.channelId,
        client: caseItem.client,
        tasksTotal: caseItem.taskStats.total,
        documents: caseItem.documents || [],
        events: safeEvents,
        members: safeMembers,
        originator: safeUser(caseItem.originator),
        handler: safeUser(caseItem.handler),
        caseNumber: caseItem.caseCode,
        caseType: caseItem.serviceType,
        clientName: caseItem.client?.name || "未知客户",
        progress,
        owner: safeUser(caseItem.originator) || safeUser(caseItem.handler) || safeCurrentUser,
    }

    return { viewModel, currentUser: safeCurrentUser }
}
