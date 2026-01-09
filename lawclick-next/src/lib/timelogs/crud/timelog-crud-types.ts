import "server-only"

import type { Prisma } from "@prisma/client"
import { TimeLogStatus } from "@prisma/client"

export interface StartTimerInput {
    caseId?: string
    taskId?: string
    description: string
    isBillable?: boolean
}

export interface TimeLogSummary {
    totalSeconds: number
    totalHours: number
    billableSeconds: number
    billableHours: number
    count: number
}

export const ACTIVE_TIMER_INCLUDE = {
    case: {
        select: { id: true, title: true, caseCode: true },
    },
    task: {
        select: { id: true, title: true },
    },
} satisfies Prisma.TimeLogInclude

export type ActiveTimer = Prisma.TimeLogGetPayload<{ include: typeof ACTIVE_TIMER_INCLUDE }> | null

export type TimeLogListItem = {
    id: string
    description: string
    startTime: Date
    endTime: Date | null
    duration: number
    status: TimeLogStatus
    isBillable: boolean
    userId: string
    caseId: string | null
    taskId: string | null
    billingRate: number | null
    billingAmount: number | null
    case: { id: string; title: string; caseCode: string } | null
    task: { id: string; title: string } | null
}

export type CaseTimeLogListItem = {
    id: string
    description: string
    startTime: Date
    endTime: Date | null
    duration: number
    status: TimeLogStatus
    isBillable: boolean
    billingRate: number | null
    billingAmount: number | null
    user: { id: string; name: string | null; email: string }
    task: { id: string; title: string } | null
}

export type TimeLogApprovalItem = {
    id: string
    description: string
    startTime: Date
    endTime: Date | null
    duration: number
    status: TimeLogStatus
    isBillable: boolean
    billingRate: number | null
    billingAmount: number | null
    user?: { id: string; name: string | null; email: string } | null
    case?: { id: string; title: string; caseCode: string } | null
    task?: { id: string; title: string } | null
}

export interface GetCaseTimeLogsInput {
    caseId: string
    cursor?: string
    take?: number
    from?: string
    to?: string
    status?: TimeLogStatus[]
}

export interface GetMyTimeLogsInput {
    from: string
    to: string
    status?: TimeLogStatus[]
    caseId?: string
    taskId?: string
    take?: number
}

export interface UpdateTimeLogInput {
    id: string
    description?: string
    isBillable?: boolean
    startTime?: string
    endTime?: string
    caseId?: string | null
    taskId?: string | null
}
