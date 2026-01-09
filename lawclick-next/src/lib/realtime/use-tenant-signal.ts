"use client"

import * as React from "react"
import { z } from "zod"
import { TenantSignalKind } from "@/lib/prisma-browser"

const TenantSignalEventSchema = z
    .object({
        tenantId: z.string().trim().min(1),
        kind: z.nativeEnum(TenantSignalKind),
        updatedAt: z.string().datetime(),
        payload: z.unknown().nullable().optional(),
        version: z.number().int().min(0).optional(),
    })
    .strict()

export type TenantSignalEvent = z.infer<typeof TenantSignalEventSchema>

export type TenantSignalConnectionState = "idle" | "connecting" | "open" | "error"

export function useTenantSignal(input: {
    enabled?: boolean
    kind?: TenantSignalKind
    onSignal: (event: TenantSignalEvent) => void
}) {
    const enabled = input.enabled ?? true
    const onSignalRef = React.useRef(input.onSignal)
    React.useEffect(() => {
        onSignalRef.current = input.onSignal
    }, [input.onSignal])

    const [state, setState] = React.useState<TenantSignalConnectionState>(enabled ? "connecting" : "idle")

    React.useEffect(() => {
        if (!enabled) {
            setState("idle")
            return
        }

        setState("connecting")

        const params = new URLSearchParams()
        params.set("since", new Date().toISOString())
        if (input.kind) params.set("kind", input.kind)

        const source = new EventSource(`/api/realtime/signals?${params.toString()}`)

        const onReady = () => {
            setState("open")
        }

        const onSignal = (event: MessageEvent<string>) => {
            const parsedJson = (() => {
                try {
                    return JSON.parse(event.data) as unknown
                } catch {
                    return null
                }
            })()

            const parsed = TenantSignalEventSchema.safeParse(parsedJson)
            if (!parsed.success) return
            onSignalRef.current(parsed.data)
        }

        source.addEventListener("ready", onReady)
        source.addEventListener("signal", onSignal as EventListener)

        source.onerror = () => {
            setState("error")
        }

        return () => {
            source.removeEventListener("ready", onReady)
            source.removeEventListener("signal", onSignal as EventListener)
            source.close()
        }
    }, [enabled, input.kind])

    return { state }
}
