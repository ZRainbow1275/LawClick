import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { checkRateLimit } from "@/lib/rate-limit"
import { prisma } from "@/lib/prisma"
import { getStorageProvider } from "@/lib/s3"
import { logger } from "@/lib/logger"
import { getActiveTenantContextOrThrow, hasTenantPermission } from "@/lib/server-auth"

export const runtime = "nodejs"

type HealthCheckResult = {
    ok: boolean
    at: string
    checks: {
        db: { ok: boolean; latencyMs: number; error?: string }
        s3: { ok: boolean; latencyMs: number; error?: string }
    }
}

type HealthProbe = "all" | "db" | "s3"

const HealthQuerySchema = z
    .object({
        detail: z.enum(["0", "1"]).optional(),
        probe: z.enum(["all", "db", "s3"]).optional(),
    })
    .strict()

function getClientFingerprint(request: NextRequest) {
    const forwarded = request.headers.get("x-forwarded-for") || ""
    const ip = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"
    return `${ip}:${userAgent.slice(0, 80)}`
}

async function runCheck<T>(
    name: string,
    fn: () => Promise<T>
): Promise<{ ok: true; latencyMs: number } | { ok: false; latencyMs: number; error: string }> {
    const start = Date.now()
    try {
        await fn()
        return { ok: true, latencyMs: Date.now() - start }
    } catch (error) {
        logger.error(`[health] ${name} check failed`, error)
        const msg = error instanceof Error ? error.message : "unknown error"
        return { ok: false, latencyMs: Date.now() - start, error: msg }
    }
}

export async function GET(request: NextRequest) {
    const at = new Date().toISOString()
    const url = new URL(request.url)

    const parsedQuery = HealthQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()))
    if (!parsedQuery.success) {
        return NextResponse.json({ error: "输入校验失败" }, { status: 400 })
    }
    const probe: HealthProbe = parsedQuery.data.probe ?? "all"
    const wantsDetail = parsedQuery.data.detail === "1"

    const rate = await checkRateLimit({
        key: `api:health:${getClientFingerprint(request)}`,
        limit: 60,
        windowMs: 60_000,
    })
    if (!rate.allowed) {
        return NextResponse.json(
            { error: "请求过于频繁，请稍后再试" },
            {
                status: 429,
                headers: {
                    "Retry-After": String(rate.retryAfterSeconds),
                    "X-RateLimit-Limit": String(rate.limit),
                    "X-RateLimit-Remaining": String(rate.remaining),
                    "X-RateLimit-Reset": String(Math.floor(rate.resetAt.getTime() / 1000)),
                },
            }
        )
    }

    const allowDetail = await (async () => {
        try {
            const ctx = await getActiveTenantContextOrThrow({ requireRole: "ADMIN" })
            return hasTenantPermission(ctx, "admin:audit") || hasTenantPermission(ctx, "admin:access")
        } catch {
            return false
        }
    })()

    const db =
        probe === "all" || probe === "db"
            ? await runCheck("db", async () => {
                  await prisma.$queryRaw`SELECT 1`
              })
            : { ok: true as const, latencyMs: 0 }

    const s3 =
        probe === "all" || probe === "s3"
            ? await runCheck("s3", async () => {
                  const provider = getStorageProvider()
                  await provider.ensureBucketExists()
              })
            : { ok: true as const, latencyMs: 0 }

    const ok = db.ok && s3.ok
    const showDetails = wantsDetail && allowDetail

    const payload: HealthCheckResult = {
        ok,
        at,
        checks: {
            db: db.ok
                ? { ok: true, latencyMs: db.latencyMs }
                : {
                      ok: false,
                      latencyMs: db.latencyMs,
                      ...(showDetails ? { error: db.error } : {}),
                  },
            s3: s3.ok
                ? { ok: true, latencyMs: s3.latencyMs }
                : {
                      ok: false,
                      latencyMs: s3.latencyMs,
                      ...(showDetails ? { error: s3.error } : {}),
                  },
        },
    }

    return NextResponse.json(payload, { status: ok ? 200 : 503 })
}
