import { logger } from "@/lib/logger"

export type DispatchRefreshReason = "manual" | "assignment" | "invite" | "unknown"

export type DispatchRefreshEvent = {
    reason: DispatchRefreshReason
    at: string
}

type Listener = (event: DispatchRefreshEvent) => void

const listeners = new Set<Listener>()

export function emitDispatchRefresh(reason: DispatchRefreshReason = "unknown") {
    const event: DispatchRefreshEvent = { reason, at: new Date().toISOString() }
    for (const listener of listeners) {
        try {
            listener(event)
        } catch (error) {
            logger.error("dispatch refresh listener error", error)
        }
    }
}

export function subscribeDispatchRefresh(listener: Listener) {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

