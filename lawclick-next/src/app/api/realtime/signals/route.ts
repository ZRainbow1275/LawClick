import { z } from "zod"
import { TenantSignalKind } from "@prisma/client"

import { AuthError, PermissionError, getActiveTenantContextWithPermissionOrThrow } from "@/lib/server-auth"
import { subscribeTenantSignalSource } from "@/lib/realtime/tenant-signal-source"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const QuerySchema = z
    .object({
        kind: z.nativeEnum(TenantSignalKind).optional(),
        since: z.string().datetime().optional(),
        pollMs: z.coerce.number().int().min(1000).max(10_000).optional(),
    })
    .strict()

export async function GET(req: Request) {
    const url = new URL(req.url)

    const parsed = QuerySchema.safeParse({
        kind: url.searchParams.get("kind") || undefined,
        since: url.searchParams.get("since") || undefined,
        pollMs: url.searchParams.get("pollMs") || undefined,
    })

    if (!parsed.success) {
        return new Response(parsed.error.issues[0]?.message || "输入校验失败", { status: 400 })
    }

    let ctx: Awaited<ReturnType<typeof getActiveTenantContextWithPermissionOrThrow>>
    try {
        ctx = await getActiveTenantContextWithPermissionOrThrow("task:view")
    } catch (error) {
        if (error instanceof AuthError) return new Response("未登录", { status: 401 })
        if (error instanceof PermissionError) return new Response("无权限访问", { status: 403 })
        throw error
    }
    const tenantId = ctx.tenantId
    const userId = ctx.user.id

    const rate = await checkRateLimit({
        key: `realtime:signals:${tenantId}:${userId}`,
        limit: 30,
        windowMs: 60_000,
    })
    if (!rate.allowed) {
        logger.warn("realtime.signals rate limited", { tenantId, userId })
        return new Response("请求过于频繁，请稍后重试", {
            status: 429,
            headers: {
                "Retry-After": String(rate.retryAfterSeconds),
                "X-RateLimit-Limit": String(rate.limit),
                "X-RateLimit-Remaining": String(rate.remaining),
                "X-RateLimit-Reset": String(Math.floor(rate.resetAt.getTime() / 1000)),
            },
        })
    }

    const kind = parsed.data.kind ?? TenantSignalKind.TASKS_CHANGED
    const pollMs = parsed.data.pollMs ?? 3000

    const since = parsed.data.since ? new Date(parsed.data.since) : new Date()
    const sinceVersion = (() => {
        const raw = (req.headers.get("Last-Event-ID") || "").trim()
        if (!raw) return undefined
        const parsed = Number.parseInt(raw, 10)
        if (!Number.isFinite(parsed) || parsed < 0) return undefined
        return parsed
    })()

    const encoder = new TextEncoder()

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            let closed = false

            function send(event: string, data: unknown, id?: string) {
                if (closed) return
                const payload = typeof data === "string" ? data : JSON.stringify(data)
                if (id) controller.enqueue(encoder.encode(`id: ${id}\n`))
                controller.enqueue(encoder.encode(`event: ${event}\n`))
                controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
            }

            const unsubscribe = subscribeTenantSignalSource({
                tenantId,
                kind,
                since,
                pollMs,
                sinceVersion,
                onSignal: (signalEvent) => send("signal", signalEvent, String(signalEvent.version)),
            })

            const heartbeatTimer = setInterval(() => send("ping", { now: new Date().toISOString() }), 15_000)

            send("ready", { tenantId, kind, pollMs, sinceVersion: sinceVersion ?? null })

            const abortHandler = () => {
                if (closed) return
                closed = true
                clearInterval(heartbeatTimer)
                unsubscribe()
                try {
                    controller.close()
                } catch {
                    // ignore
                }
            }

            req.signal.addEventListener("abort", abortHandler)
        },
    })

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    })
}
