import "server-only"

import { EventEmitter } from "events"
import { TenantSignalKind, type Prisma } from "@prisma/client"

export type TenantSignalBusEvent = {
    tenantId: string
    kind: TenantSignalKind
    updatedAt: Date
    payload: Prisma.JsonValue | null
    version: number
}

type TenantSignalBus = {
    emitter: EventEmitter
}

function getGlobalBus(): TenantSignalBus {
    const globalAny = globalThis as unknown as { __lawclickTenantSignalBus?: TenantSignalBus }
    if (!globalAny.__lawclickTenantSignalBus) {
        const emitter = new EventEmitter()
        emitter.setMaxListeners(0)
        globalAny.__lawclickTenantSignalBus = { emitter }
    }
    return globalAny.__lawclickTenantSignalBus
}

function channelName(input: { tenantId: string; kind: TenantSignalKind }) {
    return `tenant:${input.tenantId}:signal:${input.kind}` as const
}

export function publishTenantSignalBus(event: TenantSignalBusEvent) {
    const bus = getGlobalBus()
    bus.emitter.emit(channelName({ tenantId: event.tenantId, kind: event.kind }), event)
}

export function subscribeTenantSignalBus(input: {
    tenantId: string
    kind: TenantSignalKind
    onEvent: (event: TenantSignalBusEvent) => void
}) {
    const bus = getGlobalBus()
    const name = channelName({ tenantId: input.tenantId, kind: input.kind })

    const handler = (event: unknown) => {
        if (!event || typeof event !== "object") return
        input.onEvent(event as TenantSignalBusEvent)
    }

    bus.emitter.on(name, handler)
    return () => bus.emitter.off(name, handler)
}
