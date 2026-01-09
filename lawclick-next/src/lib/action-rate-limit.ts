import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

export type ActionRateLimitInput = {
    tenantId: string
    userId: string
    action: string
    limit: number
    windowMs: number
    extraKey?: string
}

export const DEFAULT_ACTION_RATE_LIMIT_WINDOW_MS = 60_000

export type ActionRateLimitContext = {
    tenantId: string
    user: { id: string }
}

export async function enforceActionRateLimit(
    input: ActionRateLimitInput
): Promise<{ allowed: true } | { allowed: false; error: string }> {
    const key = input.extraKey
        ? `${input.action}:${input.tenantId}:${input.userId}:${input.extraKey}`
        : `${input.action}:${input.tenantId}:${input.userId}`

    try {
        const decision = await checkRateLimit({
            key,
            limit: input.limit,
            windowMs: input.windowMs,
        })
        if (decision.allowed) return { allowed: true as const }

        logger.warn("action rate limited", {
            action: input.action,
            tenantId: input.tenantId,
            userId: input.userId,
            limit: input.limit,
            windowMs: input.windowMs,
            remaining: decision.remaining,
        })

        return { allowed: false as const, error: "请求过于频繁，请稍后重试" }
    } catch (error) {
        logger.error("action rate limit failed", error, {
            action: input.action,
            tenantId: input.tenantId,
            userId: input.userId,
        })
        return { allowed: false as const, error: "系统繁忙，请稍后再试" }
    }
}

type EnforceRateLimitInput =
    | ActionRateLimitInput
    | {
          ctx: ActionRateLimitContext
          action: string
          limit: number
          windowMs?: number
          extraKey?: string
      }

export async function enforceRateLimit(
    input: EnforceRateLimitInput
): Promise<{ allowed: true } | { allowed: false; error: string }> {
    if ("ctx" in input) {
        return enforceActionRateLimit({
            tenantId: input.ctx.tenantId,
            userId: input.ctx.user.id,
            action: input.action,
            limit: input.limit,
            windowMs: input.windowMs ?? DEFAULT_ACTION_RATE_LIMIT_WINDOW_MS,
            ...(input.extraKey ? { extraKey: input.extraKey } : {}),
        })
    }
    return enforceActionRateLimit(input)
}
