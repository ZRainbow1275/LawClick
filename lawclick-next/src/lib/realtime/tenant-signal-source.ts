import "server-only"

import { TenantSignalKind, type Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { subscribeTenantSignalBus, type TenantSignalBusEvent } from "@/lib/realtime/tenant-signal-bus"

export type TenantSignalStreamEvent = {
    tenantId: string
    kind: TenantSignalKind
    updatedAt: string
    payload: Prisma.JsonValue | null
    version: number
}

type Subscriber = {
    id: string
    lastSeenMs: number
    lastSeenVersion: number
    onSignal: (event: TenantSignalStreamEvent) => void
}

type PollerKey = string

type Poller = {
    key: PollerKey
    tenantId: string
    kind: TenantSignalKind
    pollMs: number
    subscribers: Map<string, Subscriber>
    lastSeenSignalVersion: number
    lastSeenSignalUpdatedAt: Date | null
    lastSeenSignalPayload: Prisma.JsonValue | null
    pollInFlight: boolean
    timer: NodeJS.Timeout | null
    unsubscribeBus: () => void
    dbPollCount: number
    dbPollErrorCount: number
    lastDbPollAt: Date | null
    lastDbPollMs: number | null
    lastDbPollErrorAt: Date | null
}

function pollerKey(input: { tenantId: string; kind: TenantSignalKind; pollMs: number }): PollerKey {
    return `${input.tenantId}:${input.kind}:${input.pollMs}`
}

function getPollers(): Map<PollerKey, Poller> {
    const globalAny = globalThis as unknown as { __lawclickTenantSignalPollers?: Map<PollerKey, Poller> }
    if (!globalAny.__lawclickTenantSignalPollers) {
        globalAny.__lawclickTenantSignalPollers = new Map<PollerKey, Poller>()
    }
    return globalAny.__lawclickTenantSignalPollers
}

function broadcastToSubscribers(poller: Poller, input: { updatedAt: Date; payload: Prisma.JsonValue | null; version: number }) {
    const updatedAtMs = input.updatedAt.getTime()
    const version = input.version
    if (!Number.isFinite(updatedAtMs)) return
    if (typeof version !== "number" || !Number.isFinite(version) || version < 0) return

    poller.lastSeenSignalVersion = Math.max(poller.lastSeenSignalVersion, version)
    poller.lastSeenSignalUpdatedAt = input.updatedAt
    poller.lastSeenSignalPayload = input.payload

    const event: TenantSignalStreamEvent = {
        tenantId: poller.tenantId,
        kind: poller.kind,
        updatedAt: input.updatedAt.toISOString(),
        payload: input.payload,
        version,
    }

    for (const subscriber of poller.subscribers.values()) {
        if (updatedAtMs < subscriber.lastSeenMs) continue
        if (version <= subscriber.lastSeenVersion) continue
        subscriber.lastSeenMs = Math.max(subscriber.lastSeenMs, updatedAtMs)
        subscriber.lastSeenVersion = version
        try {
            subscriber.onSignal(event)
        } catch (error) {
            logger.error("[tenant-signal-source] subscriber handler failed", error)
        }
    }
}

async function pollOnce(poller: Poller) {
    if (poller.pollInFlight) return
    poller.pollInFlight = true

    const startedAt = Date.now()
    poller.dbPollCount += 1

    try {
        const signal = await prisma.tenantSignal.findUnique({
            where: { tenantId_kind: { tenantId: poller.tenantId, kind: poller.kind } },
            select: { updatedAt: true, payload: true, version: true },
        })

        poller.lastDbPollAt = new Date()
        poller.lastDbPollMs = Math.max(0, Date.now() - startedAt)

        if (!signal) return
        if (signal.version <= poller.lastSeenSignalVersion) return

        broadcastToSubscribers(poller, { updatedAt: signal.updatedAt, payload: signal.payload, version: signal.version })
    } catch (error) {
        poller.dbPollErrorCount += 1
        poller.lastDbPollAt = new Date()
        poller.lastDbPollMs = Math.max(0, Date.now() - startedAt)
        poller.lastDbPollErrorAt = new Date()
        logger.error("[tenant-signal-source] db poll failed", error)
    } finally {
        poller.pollInFlight = false
    }
}

function getOrCreatePoller(input: { tenantId: string; kind: TenantSignalKind; pollMs: number }): Poller {
    const pollMs = Math.max(1000, Math.min(10_000, input.pollMs))
    const key = pollerKey({ tenantId: input.tenantId, kind: input.kind, pollMs })

    const pollers = getPollers()
    const existing = pollers.get(key)
    if (existing) return existing

    const poller: Poller = {
        key,
        tenantId: input.tenantId,
        kind: input.kind,
        pollMs,
        subscribers: new Map(),
        lastSeenSignalVersion: 0,
        lastSeenSignalUpdatedAt: null,
        lastSeenSignalPayload: null,
        pollInFlight: false,
        timer: null,
        unsubscribeBus: () => undefined,
        dbPollCount: 0,
        dbPollErrorCount: 0,
        lastDbPollAt: null,
        lastDbPollMs: null,
        lastDbPollErrorAt: null,
    }

    poller.timer = setInterval(() => void pollOnce(poller), pollMs)

    poller.unsubscribeBus = subscribeTenantSignalBus({
        tenantId: poller.tenantId,
        kind: poller.kind,
        onEvent: (event: TenantSignalBusEvent) => {
            broadcastToSubscribers(poller, { updatedAt: event.updatedAt, payload: event.payload, version: event.version })
        },
    })

    pollers.set(key, poller)
    void pollOnce(poller)

    return poller
}

function cleanupPoller(poller: Poller) {
    if (poller.subscribers.size > 0) return
    const pollers = getPollers()
    pollers.delete(poller.key)
    if (poller.timer) clearInterval(poller.timer)
    try {
        poller.unsubscribeBus()
    } catch {
        // ignore
    }
}

export function subscribeTenantSignalSource(input: {
    tenantId: string
    kind: TenantSignalKind
    since: Date
    sinceVersion?: number
    pollMs?: number
    onSignal: (event: TenantSignalStreamEvent) => void
}) {
    const tenantId = input.tenantId.trim()
    if (!tenantId) {
        throw new Error("tenantId 不能为空")
    }

    const poller = getOrCreatePoller({
        tenantId,
        kind: input.kind,
        pollMs: input.pollMs ?? 3000,
    })

    const subscriberId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const sinceMs = input.since.getTime()
    const subscriber: Subscriber = {
        id: subscriberId,
        lastSeenMs: Number.isFinite(sinceMs) ? sinceMs : 0,
        lastSeenVersion: typeof input.sinceVersion === "number" && Number.isFinite(input.sinceVersion) && input.sinceVersion >= 0 ? input.sinceVersion : 0,
        onSignal: input.onSignal,
    }

    poller.subscribers.set(subscriberId, subscriber)

    const lastSeenSignalUpdatedAt = poller.lastSeenSignalUpdatedAt
    const shouldCatchUpImmediately = Boolean(lastSeenSignalUpdatedAt) && poller.lastSeenSignalVersion > subscriber.lastSeenVersion
    if (shouldCatchUpImmediately && lastSeenSignalUpdatedAt) {
        const updatedAtMs = lastSeenSignalUpdatedAt.getTime()
        if (Number.isFinite(updatedAtMs) && updatedAtMs >= subscriber.lastSeenMs) {
            subscriber.lastSeenMs = Math.max(subscriber.lastSeenMs, updatedAtMs)
            subscriber.lastSeenVersion = poller.lastSeenSignalVersion
            try {
                subscriber.onSignal({
                    tenantId: poller.tenantId,
                    kind: poller.kind,
                    updatedAt: lastSeenSignalUpdatedAt.toISOString(),
                    payload: poller.lastSeenSignalPayload,
                    version: poller.lastSeenSignalVersion,
                })
            } catch (error) {
                logger.error("[tenant-signal-source] subscriber catch-up handler failed", error)
            }
        }
    }

    void pollOnce(poller)

    return () => {
        poller.subscribers.delete(subscriberId)
        cleanupPoller(poller)
    }
}

export type TenantSignalSourcePollerDiagnostics = {
    key: string
    tenantId: string
    kind: TenantSignalKind
    pollMs: number
    subscribers: number
    lastSeenSignalVersion: number
    lastSeenSignalUpdatedAt: string | null
    dbPollCount: number
    dbPollErrorCount: number
    lastDbPollAt: string | null
    lastDbPollMs: number | null
    lastDbPollErrorAt: string | null
}

export function getTenantSignalSourceDiagnostics(filter?: { tenantId?: string; kind?: TenantSignalKind }) {
    const tenantId = (filter?.tenantId || "").trim()
    const kind = filter?.kind

    const pollers = Array.from(getPollers().values())
        .filter((p) => (tenantId ? p.tenantId === tenantId : true))
        .filter((p) => (kind ? p.kind === kind : true))
        .map(
            (p): TenantSignalSourcePollerDiagnostics => ({
                key: p.key,
                tenantId: p.tenantId,
                kind: p.kind,
                pollMs: p.pollMs,
                subscribers: p.subscribers.size,
                lastSeenSignalVersion: p.lastSeenSignalVersion,
                lastSeenSignalUpdatedAt: p.lastSeenSignalUpdatedAt ? p.lastSeenSignalUpdatedAt.toISOString() : null,
                dbPollCount: p.dbPollCount,
                dbPollErrorCount: p.dbPollErrorCount,
                lastDbPollAt: p.lastDbPollAt ? p.lastDbPollAt.toISOString() : null,
                lastDbPollMs: p.lastDbPollMs,
                lastDbPollErrorAt: p.lastDbPollErrorAt ? p.lastDbPollErrorAt.toISOString() : null,
            })
        )
        .sort((a, b) => a.key.localeCompare(b.key))

    return { pollers }
}
