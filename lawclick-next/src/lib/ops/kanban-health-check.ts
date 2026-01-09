import "server-only"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { getEmailProviderDiagnostics } from "@/lib/email"
import { notifyUsers, notifyUsersWithEmailQueue } from "@/lib/notifications"
import { listTenantAdminUserIds } from "@/lib/ops/ops-recipients"
import {
    NotificationType,
    OpsAlertSeverity,
    OpsAlertStatus,
    OpsAlertType,
    OpsMetricKind,
    TaskStatus,
    TenantSignalKind,
    type Prisma,
} from "@prisma/client"

function parseIntEnv(name: string, fallback: number): number {
    const raw = (process.env[name] || "").trim()
    if (!raw) return fallback
    const value = Number.parseInt(raw, 10)
    return Number.isFinite(value) ? value : fallback
}

async function measureMs<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
    const start = Date.now()
    const value = await fn()
    return { value, ms: Math.max(0, Date.now() - start) }
}

function getSignalAction(payload: Prisma.JsonValue | null | undefined): string | null {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
    const action = (payload as { action?: unknown }).action
    return typeof action === "string" && action.trim() ? action.trim() : null
}

function getSignalReindexed(payload: Prisma.JsonValue | null | undefined): boolean | null {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
    const value = (payload as { reindexed?: unknown }).reindexed
    return typeof value === "boolean" ? value : null
}

function getSignalReindexedTaskCount(payload: Prisma.JsonValue | null | undefined): number | null {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
    const value = (payload as { reindexedTaskCount?: unknown }).reindexedTaskCount
    if (typeof value !== "number" || !Number.isFinite(value)) return null
    const normalized = Math.floor(value)
    if (normalized <= 0) return null
    return normalized
}

function severityRank(severity: OpsAlertSeverity): number {
    if (severity === OpsAlertSeverity.P0) return 0
    if (severity === OpsAlertSeverity.P1) return 1
    if (severity === OpsAlertSeverity.P2) return 2
    return 3
}

function maxSeverity(a: OpsAlertSeverity, b: OpsAlertSeverity): OpsAlertSeverity {
    return severityRank(a) <= severityRank(b) ? a : b
}

type KanbanAlertConfig = {
    openTasksThreshold: number
    openTasksP0Threshold: number
    maxColumnThreshold: number
    maxColumnP0Threshold: number
    notifyIntervalMinutes: number
}

function getKanbanAlertConfig(): KanbanAlertConfig {
    return {
        openTasksThreshold: Math.max(0, parseIntEnv("OPS_KANBAN_OPEN_TASKS_THRESHOLD", 2000)),
        openTasksP0Threshold: Math.max(0, parseIntEnv("OPS_KANBAN_OPEN_TASKS_P0_THRESHOLD", 10_000)),
        maxColumnThreshold: Math.max(0, parseIntEnv("OPS_KANBAN_MAX_COLUMN_THRESHOLD", 1500)),
        maxColumnP0Threshold: Math.max(0, parseIntEnv("OPS_KANBAN_MAX_COLUMN_P0_THRESHOLD", 8000)),
        notifyIntervalMinutes: Math.max(5, parseIntEnv("OPS_KANBAN_ALERT_NOTIFY_INTERVAL_MINUTES", 180)),
    }
}

type AlertCandidate = {
    idempotencyKey: string
    type: OpsAlertType
    severity: OpsAlertSeverity
    title: string
    message: string
    payload: Prisma.InputJsonValue
    triggered: boolean
}

export type KanbanHealthCheckResult = {
    snapshotId: string
    createdAlerts: number
    updatedAlerts: number
    resolvedAlerts: number
    notifiedAlerts: number
    tenantId: string
    totalTasks: number
    openTasks: number
    maxColumnStatus: TaskStatus
    maxColumnCount: number
}

export async function runKanbanHealthCheck(input: { tenantId: string; now?: Date }): Promise<KanbanHealthCheckResult> {
    const tenantId = input.tenantId.trim()
    if (!tenantId) {
        throw new Error("tenantId 不能为空")
    }

    const now = input.now ?? new Date()
    const config = getKanbanAlertConfig()

    const startedAtMs = Date.now()

    const [statusGroupedRes, orphanTasksRes, oldestOpenRes, topProjectsRawRes, topCasesRawRes, tasksChangedSignalRes] = await Promise.all([
        measureMs(() =>
            prisma.task.groupBy({
                by: ["status"],
                where: { tenantId },
                _count: { id: true },
            })
        ),
        measureMs(() => prisma.task.count({ where: { tenantId, caseId: null, projectId: null } })),
        measureMs(() =>
            prisma.task.findFirst({
                where: { tenantId, status: { not: TaskStatus.DONE } },
                orderBy: { updatedAt: "asc" },
                select: { updatedAt: true },
            })
        ),
        measureMs(() =>
            prisma.task.groupBy({
                by: ["projectId"],
                where: { tenantId, projectId: { not: null } },
                _count: { id: true },
                orderBy: { _count: { id: "desc" } },
                take: 5,
            })
        ),
        measureMs(() =>
            prisma.task.groupBy({
                by: ["caseId"],
                where: { tenantId, caseId: { not: null } },
                _count: { id: true },
                orderBy: { _count: { id: "desc" } },
                take: 5,
            })
        ),
        measureMs(() =>
            prisma.tenantSignal.findUnique({
                where: { tenantId_kind: { tenantId, kind: TenantSignalKind.TASKS_CHANGED } },
                select: { updatedAt: true, payload: true, version: true },
            })
        ),
    ])

    const statusGrouped = statusGroupedRes.value
    const orphanTasks = orphanTasksRes.value
    const oldestOpen = oldestOpenRes.value
    const topProjectsRaw = topProjectsRawRes.value
    const topCasesRaw = topCasesRawRes.value
    const tasksChangedSignal = tasksChangedSignalRes.value

    const queryMs: Record<string, number> = {
        statusGrouped: statusGroupedRes.ms,
        orphanTasks: orphanTasksRes.ms,
        oldestOpen: oldestOpenRes.ms,
        topProjects: topProjectsRawRes.ms,
        topCases: topCasesRawRes.ms,
        tasksChangedSignal: tasksChangedSignalRes.ms,
    }

    const perStatus: Record<TaskStatus, number> = {
        TODO: 0,
        IN_PROGRESS: 0,
        REVIEW: 0,
        DONE: 0,
    }

    for (const row of statusGrouped) {
        perStatus[row.status] = row._count.id
    }

    const totalTasks = perStatus.TODO + perStatus.IN_PROGRESS + perStatus.REVIEW + perStatus.DONE
    const openTasks = perStatus.TODO + perStatus.IN_PROGRESS + perStatus.REVIEW

    const maxColumn = ([TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.REVIEW, TaskStatus.DONE] as const).reduce<{
        status: TaskStatus
        count: number
    }>(
        (acc, status) => {
            const count = perStatus[status]
            return count > acc.count ? { status, count } : acc
        },
        { status: TaskStatus.TODO, count: perStatus.TODO }
    )

    const projectIds = topProjectsRaw.map((r) => r.projectId).filter((v): v is string => typeof v === "string")
    const caseIds = topCasesRaw.map((r) => r.caseId).filter((v): v is string => typeof v === "string")

    const sampleProjectId = projectIds[0] ?? null
    const sampleCaseId = caseIds[0] ?? null

    const [projectsRes, casesRes, sampleProjectTodoRes, sampleCaseTodoRes] = await Promise.all([
        projectIds.length
            ? measureMs(() =>
                  prisma.project.findMany({
                      where: { tenantId, id: { in: projectIds } },
                      select: { id: true, title: true, projectCode: true },
                  })
              )
            : Promise.resolve({ value: [] as const, ms: 0 }),
        caseIds.length
            ? measureMs(() =>
                  prisma.case.findMany({
                      where: { tenantId, id: { in: caseIds } },
                      select: { id: true, title: true, caseCode: true },
                  })
              )
            : Promise.resolve({ value: [] as const, ms: 0 }),
        sampleProjectId
            ? measureMs(() =>
                  prisma.task.findMany({
                      where: { tenantId, projectId: sampleProjectId, status: TaskStatus.TODO },
                      orderBy: [{ order: "asc" }, { id: "asc" }],
                      take: 50,
                      select: { id: true },
                  })
              )
            : Promise.resolve({ value: [] as const, ms: 0 }),
        sampleCaseId
            ? measureMs(() =>
                  prisma.task.findMany({
                      where: { tenantId, caseId: sampleCaseId, status: TaskStatus.TODO },
                      orderBy: [{ order: "asc" }, { id: "asc" }],
                      take: 50,
                      select: { id: true },
                  })
              )
            : Promise.resolve({ value: [] as const, ms: 0 }),
    ])

    queryMs.projectsLookup = projectsRes.ms
    queryMs.casesLookup = casesRes.ms
    if (sampleProjectId) queryMs.sampleProjectTodo = sampleProjectTodoRes.ms
    if (sampleCaseId) queryMs.sampleCaseTodo = sampleCaseTodoRes.ms

    const projects = projectsRes.value
    const cases = casesRes.value

    const projectMap = new Map(projects.map((p) => [p.id, p]))
    const caseMap = new Map(cases.map((c) => [c.id, c]))

    const topProjects = topProjectsRaw
        .map((row) => {
            const id = row.projectId
            if (typeof id !== "string") return null
            const project = projectMap.get(id)
            if (!project) return null
            return {
                projectId: id,
                title: project.title,
                projectCode: project.projectCode,
                count: row._count.id,
            }
        })
        .filter((v): v is NonNullable<typeof v> => v !== null)

    const topCases = topCasesRaw
        .map((row) => {
            const id = row.caseId
            if (typeof id !== "string") return null
            const c = caseMap.get(id)
            if (!c) return null
            return {
                caseId: id,
                title: c.title,
                caseCode: c.caseCode,
                count: row._count.id,
            }
        })
        .filter((v): v is NonNullable<typeof v> => v !== null)

    const oldestOpenUpdatedAt = oldestOpen?.updatedAt ?? null
    const oldestOpenAgeHours =
        oldestOpenUpdatedAt ? Math.max(0, Math.floor((now.getTime() - oldestOpenUpdatedAt.getTime()) / 3_600_000)) : null

    const tasksChangedSignalUpdatedAt = tasksChangedSignal?.updatedAt ?? null
    const tasksChangedSignalVersion = typeof tasksChangedSignal?.version === "number" ? tasksChangedSignal.version : null
    const tasksChangedSignalAgeSeconds = tasksChangedSignalUpdatedAt
        ? Math.max(0, Math.floor((now.getTime() - tasksChangedSignalUpdatedAt.getTime()) / 1000))
        : null
    const tasksChangedSignalAction = getSignalAction(tasksChangedSignal?.payload)
    const tasksChangedSignalReindexed = getSignalReindexed(tasksChangedSignal?.payload)
    const tasksChangedSignalReindexedTaskCount = getSignalReindexedTaskCount(tasksChangedSignal?.payload)

    const snapshot = {
        tenantId,
        totalTasks,
        openTasks,
        orphanTasks,
        perStatus,
        maxColumn,
        topProjects,
        topCases,
        oldestOpenUpdatedAt: oldestOpenUpdatedAt ? oldestOpenUpdatedAt.toISOString() : null,
        oldestOpenAgeHours,
        tasksChangedSignalUpdatedAt: tasksChangedSignalUpdatedAt ? tasksChangedSignalUpdatedAt.toISOString() : null,
        tasksChangedSignalVersion,
        tasksChangedSignalAgeSeconds,
        tasksChangedSignalAction,
        tasksChangedSignalReindexed,
        tasksChangedSignalReindexedTaskCount,
        queryMs,
        runMs: Math.max(0, Date.now() - startedAtMs),
    } satisfies Prisma.InputJsonValue

    const metric = await prisma.opsMetricSnapshot.create({
        data: {
            tenantId,
            kind: OpsMetricKind.KANBAN_HEALTH,
            capturedAt: now,
            metrics: snapshot,
        },
        select: { id: true },
    })

    const backlogTriggered = openTasks >= config.openTasksThreshold || maxColumn.count >= config.maxColumnThreshold
    const backlogSeverity =
        openTasks >= config.openTasksP0Threshold || maxColumn.count >= config.maxColumnP0Threshold ? OpsAlertSeverity.P0 : OpsAlertSeverity.P2

    const candidates: AlertCandidate[] = [
        {
            idempotencyKey: "kanban/backlog",
            type: OpsAlertType.KANBAN_BACKLOG,
            severity: backlogSeverity,
            title: "看板积压风险",
            message: `open=${openTasks}/${totalTasks}，最大列=${maxColumn.status}:${maxColumn.count}，孤儿任务=${orphanTasks}`,
            payload: { snapshot, thresholds: config } satisfies Prisma.InputJsonValue,
            triggered: backlogTriggered,
        },
    ]

    const recipients = await listTenantAdminUserIds(tenantId)
    const emailProvider = getEmailProviderDiagnostics()
    const notify = emailProvider.provider === "unconfigured" ? notifyUsers : notifyUsersWithEmailQueue

    let createdAlerts = 0
    let updatedAlerts = 0
    let resolvedAlerts = 0
    let notifiedAlerts = 0

    for (const candidate of candidates) {
        const existing = await prisma.opsAlert.findFirst({
            where: { tenantId, idempotencyKey: candidate.idempotencyKey },
            select: {
                id: true,
                status: true,
                severity: true,
                snoozedUntil: true,
                lastNotifiedAt: true,
            },
        })

        if (!candidate.triggered) {
            if (existing && existing.status !== OpsAlertStatus.RESOLVED) {
                resolvedAlerts += 1
                await prisma.opsAlert.updateMany({
                    where: { id: existing.id, tenantId },
                    data: {
                        status: OpsAlertStatus.RESOLVED,
                        resolvedAt: now,
                        resolvedById: null,
                        snoozedUntil: null,
                        lastSeenAt: now,
                    },
                })
            }
            continue
        }

        const isSnoozedActive =
            existing?.status === OpsAlertStatus.SNOOZED && existing.snoozedUntil && existing.snoozedUntil.getTime() > now.getTime()

        const shouldReopen =
            !existing ||
            existing.status === OpsAlertStatus.RESOLVED ||
            (existing.status === OpsAlertStatus.SNOOZED && existing.snoozedUntil && existing.snoozedUntil.getTime() <= now.getTime())

        const status = shouldReopen ? OpsAlertStatus.OPEN : existing.status
        const severity = existing ? maxSeverity(existing.severity, candidate.severity) : candidate.severity

        const baseUpdate = {
            type: candidate.type,
            severity,
            status,
            title: candidate.title,
            message: candidate.message,
            payload: candidate.payload,
            lastSeenAt: now,
            ...(shouldReopen
                ? {
                      firstSeenAt: now,
                      acknowledgedAt: null,
                      acknowledgedById: null,
                      resolvedAt: null,
                      resolvedById: null,
                      snoozedUntil: null,
                  }
                : {}),
        } satisfies Prisma.OpsAlertUpdateInput

        const createData = {
            tenantId,
            idempotencyKey: candidate.idempotencyKey,
            type: candidate.type,
            severity: candidate.severity,
            status: OpsAlertStatus.OPEN,
            title: candidate.title,
            message: candidate.message,
            payload: candidate.payload,
            firstSeenAt: now,
            lastSeenAt: now,
            createdAt: now,
            updatedAt: now,
        } satisfies Prisma.OpsAlertUncheckedCreateInput

        const { alert, created } = existing
            ? await prisma.$transaction(async (tx) => {
                  const updated = await tx.opsAlert.updateMany({ where: { id: existing.id, tenantId }, data: baseUpdate })
                  if (updated.count === 0) {
                      return {
                          created: true,
                          alert: await tx.opsAlert.create({
                              data: createData,
                              select: { id: true, lastNotifiedAt: true, status: true },
                          }),
                      }
                  }

                  const next = await tx.opsAlert.findFirst({
                      where: { id: existing.id, tenantId },
                      select: { id: true, lastNotifiedAt: true, status: true },
                  })

                  if (!next) {
                      return {
                          created: true,
                          alert: await tx.opsAlert.create({
                              data: createData,
                              select: { id: true, lastNotifiedAt: true, status: true },
                          }),
                      }
                  }

                  return { created: false, alert: next }
              })
            : {
                  created: true,
                  alert: await prisma.opsAlert.create({
                      data: createData,
                      select: { id: true, lastNotifiedAt: true, status: true },
                  }),
              }

        if (created) createdAlerts += 1
        else updatedAlerts += 1

        const notifyIntervalMs = config.notifyIntervalMinutes * 60_000
        const lastNotifiedAt = alert.lastNotifiedAt
        const shouldNotify =
            recipients.length > 0 &&
            !isSnoozedActive &&
            alert.status === OpsAlertStatus.OPEN &&
            (shouldReopen || !lastNotifiedAt || now.getTime() - lastNotifiedAt.getTime() >= notifyIntervalMs)

        if (shouldNotify) {
            try {
                await notify({
                    tenantId,
                    userIds: recipients,
                    type: NotificationType.SYSTEM,
                    title: `运行机制告警：${candidate.title}`,
                    content: candidate.message,
                    actionUrl: "/admin/ops/kanban",
                    actorId: null,
                    metadata: { alertId: alert.id, alertType: candidate.type } satisfies Prisma.InputJsonValue,
                })
                notifiedAlerts += 1
                await prisma.opsAlert.updateMany({ where: { id: alert.id, tenantId }, data: { lastNotifiedAt: now } })
            } catch (error) {
                logger.error(`[KANBAN_HEALTH_CHECK] 通知失败：alertId=${alert.id}`, error)
            }
        }
    }

    return {
        snapshotId: metric.id,
        createdAlerts,
        updatedAlerts,
        resolvedAlerts,
        notifiedAlerts,
        tenantId,
        totalTasks,
        openTasks,
        maxColumnStatus: maxColumn.status,
        maxColumnCount: maxColumn.count,
    }
}
