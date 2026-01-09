import "server-only"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { computeQueueHealthSnapshot } from "@/lib/queue-health"
import { QUEUE_LOCK_TIMEOUT_MS } from "@/lib/queue-constants"
import { getEmailProviderDiagnostics } from "@/lib/email"
import { notifyUsers, notifyUsersWithEmailQueue } from "@/lib/notifications"
import { listTenantAdminUserIds } from "@/lib/ops/ops-recipients"
import { NotificationType, OpsAlertSeverity, OpsAlertStatus, OpsAlertType, OpsMetricKind, type Prisma } from "@prisma/client"

function parseIntEnv(name: string, fallback: number): number {
    const raw = (process.env[name] || "").trim()
    if (!raw) return fallback
    const value = Number.parseInt(raw, 10)
    return Number.isFinite(value) ? value : fallback
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

function formatAgeSeconds(value: number | null) {
    if (value === null) return "-"
    const seconds = Math.max(0, Math.floor(value))
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    const rem = minutes % 60
    return `${hours}h${rem}m`
}

type QueueAlertConfig = {
    duePendingThreshold: number
    duePendingP0Threshold: number
    oldestAgeSecondsThreshold: number
    oldestAgeSecondsP0Threshold: number
    staleProcessingThreshold: number
    failed24hThreshold: number
    notifyIntervalMinutes: number
}

function getQueueAlertConfig(): QueueAlertConfig {
    return {
        duePendingThreshold: Math.max(0, parseIntEnv("OPS_QUEUE_DUE_PENDING_THRESHOLD", 200)),
        duePendingP0Threshold: Math.max(0, parseIntEnv("OPS_QUEUE_DUE_PENDING_P0_THRESHOLD", 1000)),
        oldestAgeSecondsThreshold: Math.max(0, parseIntEnv("OPS_QUEUE_OLDEST_PENDING_AGE_SECONDS_THRESHOLD", 10 * 60)),
        oldestAgeSecondsP0Threshold: Math.max(0, parseIntEnv("OPS_QUEUE_OLDEST_PENDING_AGE_SECONDS_P0_THRESHOLD", 60 * 60)),
        staleProcessingThreshold: Math.max(0, parseIntEnv("OPS_QUEUE_STALE_PROCESSING_THRESHOLD", 1)),
        failed24hThreshold: Math.max(0, parseIntEnv("OPS_QUEUE_FAILED_24H_THRESHOLD", 10)),
        notifyIntervalMinutes: Math.max(5, parseIntEnv("OPS_QUEUE_ALERT_NOTIFY_INTERVAL_MINUTES", 60)),
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

export type QueueHealthCheckResult = {
    snapshotId: string
    createdAlerts: number
    updatedAlerts: number
    resolvedAlerts: number
    notifiedAlerts: number
    tenantId: string
    duePending: number
    scheduledPending: number
    staleProcessing: number
    failed24h: number
}

export async function runQueueHealthCheck(input: { tenantId: string; now?: Date }): Promise<QueueHealthCheckResult> {
    const tenantId = input.tenantId.trim()
    if (!tenantId) {
        throw new Error("tenantId 不能为空")
    }

    const now = input.now ?? new Date()
    const config = getQueueAlertConfig()
    const snapshot = await computeQueueHealthSnapshot({ tenantId, now })

    const metric = await prisma.opsMetricSnapshot.create({
        data: {
            tenantId,
            kind: OpsMetricKind.QUEUE_HEALTH,
            capturedAt: now,
            metrics: snapshot satisfies Prisma.InputJsonValue,
        },
        select: { id: true },
    })

    const ageSeconds = snapshot.oldestDuePendingAgeSeconds

    const backlogTriggered =
        snapshot.duePending >= config.duePendingThreshold ||
        (ageSeconds !== null && ageSeconds >= config.oldestAgeSecondsThreshold)

    const backlogSeverity =
        snapshot.duePending >= config.duePendingP0Threshold || (ageSeconds !== null && ageSeconds >= config.oldestAgeSecondsP0Threshold)
            ? OpsAlertSeverity.P0
            : OpsAlertSeverity.P1

    const staleTriggered = snapshot.staleProcessing >= config.staleProcessingThreshold
    const staleSeverity = snapshot.staleProcessing >= Math.max(5, config.staleProcessingThreshold) ? OpsAlertSeverity.P0 : OpsAlertSeverity.P1

    const failureTriggered = snapshot.failed24h >= config.failed24hThreshold
    const failureSeverity = snapshot.failed24h >= Math.max(config.failed24hThreshold * 5, config.failed24hThreshold + 50) ? OpsAlertSeverity.P1 : OpsAlertSeverity.P2

    const candidates: AlertCandidate[] = [
        {
            idempotencyKey: "queue/backlog",
            type: OpsAlertType.QUEUE_BACKLOG,
            severity: backlogSeverity,
            title: "队列积压",
            message: `可执行待执行=${snapshot.duePending}，最老等待=${formatAgeSeconds(snapshot.oldestDuePendingAgeSeconds)}`,
            payload: { snapshot, thresholds: config } satisfies Prisma.InputJsonValue,
            triggered: backlogTriggered,
        },
        {
            idempotencyKey: "queue/stale-processing",
            type: OpsAlertType.QUEUE_STALE_PROCESSING,
            severity: staleSeverity,
            title: "队列疑似卡死",
            message: `疑似卡死=${snapshot.staleProcessing}（锁超时> ${Math.floor(QUEUE_LOCK_TIMEOUT_MS / 60_000)}m）`,
            payload: { snapshot, thresholds: config } satisfies Prisma.InputJsonValue,
            triggered: staleTriggered,
        },
        {
            idempotencyKey: "queue/failure-spike",
            type: OpsAlertType.QUEUE_FAILURE_SPIKE,
            severity: failureSeverity,
            title: "队列失败升高",
            message: `24h 失败=${snapshot.failed24h}${snapshot.latestFailure ? `，最近失败=${snapshot.latestFailure.type}` : ""}`,
            payload: { snapshot, thresholds: config } satisfies Prisma.InputJsonValue,
            triggered: failureTriggered,
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
            ...(shouldReopen ? { firstSeenAt: now, acknowledgedAt: null, acknowledgedById: null, resolvedAt: null, resolvedById: null, snoozedUntil: null } : {}),
        } satisfies Prisma.OpsAlertUpdateInput

        const alertId = (() => {
            if (!existing) return null
            return existing.id
        })()

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

        const { alert, created } = alertId
            ? await prisma.$transaction(async (tx) => {
                  const updated = await tx.opsAlert.updateMany({ where: { id: alertId, tenantId }, data: baseUpdate })
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
                      where: { id: alertId, tenantId },
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
                    actionUrl: "/admin/ops/queue",
                    actorId: null,
                    metadata: { alertId: alert.id, alertType: candidate.type } satisfies Prisma.InputJsonValue,
                })
                notifiedAlerts += 1
                await prisma.opsAlert.updateMany({ where: { id: alert.id, tenantId }, data: { lastNotifiedAt: now } })
            } catch (error) {
                logger.error(`[QUEUE_HEALTH_CHECK] 通知失败：alertId=${alert.id}`, error)
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
        duePending: snapshot.duePending,
        scheduledPending: snapshot.scheduledPending,
        staleProcessing: snapshot.staleProcessing,
        failed24h: snapshot.failed24h,
    }
}
