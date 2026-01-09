"use server"

import type { TimeLogStatus } from "@prisma/client"

import type { ActionResponse } from "@/lib/action-response"
import {
    approveTimeLogImpl,
    getTimeLogsPendingApprovalImpl,
    markTimeLogBilledImpl,
    unapproveTimeLogImpl,
    unmarkTimeLogBilledImpl,
} from "@/lib/timelogs/crud/actions/approval-actions"
import { getCaseTimeLogsImpl, getCaseTimeLogsPageImpl } from "@/lib/timelogs/crud/actions/case-logs"
import { addManualTimeLogImpl } from "@/lib/timelogs/crud/actions/manual-timelog"
import { getMyTimeLogsImpl, getMyTimeLogsMetaImpl } from "@/lib/timelogs/crud/actions/my-logs"
import { deleteTimeLogImpl, updateTimeLogImpl } from "@/lib/timelogs/crud/actions/mutations"
import { getCaseTimeSummaryImpl, getMyTimeSummaryImpl, getTodayTimeSummaryImpl } from "@/lib/timelogs/crud/actions/summaries"
import { getActiveTimerImpl, pauseTimerImpl, resumeTimerImpl, startTimerImpl, stopTimerImpl } from "@/lib/timelogs/crud/actions/timer-actions"
import type {
    GetCaseTimeLogsInput,
    GetMyTimeLogsInput,
    StartTimerInput,
    UpdateTimeLogInput,
} from "@/lib/timelogs/crud/timelog-crud-types"

export type {
    ActiveTimer,
    CaseTimeLogListItem,
    GetCaseTimeLogsInput,
    GetMyTimeLogsInput,
    StartTimerInput,
    TimeLogApprovalItem,
    TimeLogListItem,
    TimeLogSummary,
    UpdateTimeLogInput,
} from "@/lib/timelogs/crud/timelog-crud-types"

export interface AddManualTimeLogInput {
    caseId?: string
    taskId?: string
    description: string
    startTime: string
    endTime: string
    isBillable?: boolean
}

export async function startTimer(input: StartTimerInput): Promise<ActionResponse<{ timeLogId: string }>> {
    return startTimerImpl(input)
}

export async function stopTimer(timeLogId: string): Promise<ActionResponse<{ duration: number }>> {
    return stopTimerImpl(timeLogId)
}

export async function pauseTimer(timeLogId: string): Promise<ActionResponse> {
    return pauseTimerImpl(timeLogId)
}

export async function resumeTimer(timeLogId: string): Promise<ActionResponse> {
    return resumeTimerImpl(timeLogId)
}

export async function getActiveTimer() {
    return getActiveTimerImpl()
}

export async function addManualTimeLog(input: AddManualTimeLogInput): Promise<ActionResponse> {
    return addManualTimeLogImpl(input)
}

export async function getCaseTimeSummary(caseId: string) {
    return getCaseTimeSummaryImpl(caseId)
}

export async function getTodayTimeSummary() {
    return getTodayTimeSummaryImpl()
}

export async function getCaseTimeLogs(caseId: string) {
    return getCaseTimeLogsImpl(caseId)
}

export async function getCaseTimeLogsPage(input: GetCaseTimeLogsInput) {
    return getCaseTimeLogsPageImpl(input)
}

export async function getMyTimeLogsMeta(input: GetMyTimeLogsInput) {
    return getMyTimeLogsMetaImpl(input)
}

export async function getMyTimeLogs(input: GetMyTimeLogsInput) {
    return getMyTimeLogsImpl(input)
}

export async function getMyTimeSummary(input: { from: string; to: string }) {
    return getMyTimeSummaryImpl(input)
}

export async function updateTimeLog(input: UpdateTimeLogInput): Promise<ActionResponse> {
    return updateTimeLogImpl(input)
}

export async function deleteTimeLog(timeLogId: string): Promise<ActionResponse> {
    return deleteTimeLogImpl(timeLogId)
}

export async function getTimeLogsPendingApproval(input?: {
    from?: string | Date
    to?: string | Date
    take?: number
    status?: TimeLogStatus[]
}) {
    return getTimeLogsPendingApprovalImpl(input)
}

export async function approveTimeLog(timeLogId: string): Promise<ActionResponse> {
    return approveTimeLogImpl(timeLogId)
}

export async function unapproveTimeLog(timeLogId: string): Promise<ActionResponse> {
    return unapproveTimeLogImpl(timeLogId)
}

export async function markTimeLogBilled(timeLogId: string): Promise<ActionResponse> {
    return markTimeLogBilledImpl(timeLogId)
}

export async function unmarkTimeLogBilled(timeLogId: string): Promise<ActionResponse> {
    return unmarkTimeLogBilledImpl(timeLogId)
}
