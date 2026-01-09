import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { AuthError, getActiveTenantContextWithPermissionOrThrow, hasTenantPermission, PermissionError } from "@/lib/server-auth"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { UuidSchema } from "@/lib/zod"
import { buildVCard, findBusinessCardProfile, projectBusinessCardProfile } from "@/lib/business-card/business-card"

export const runtime = "nodejs"

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        let { id } = await params
        const parsedId = UuidSchema.safeParse(id)
        if (!parsedId.success) {
            return NextResponse.json({ error: "输入校验失败" }, { status: 400 })
        }
        id = parsedId.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
        const { user, tenantId } = ctx

        const rate = await checkRateLimit({
            key: `team:vcard:${tenantId}:${user.id}:${id}`,
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return NextResponse.json(
                { error: "请求过于频繁，请稍后重试" },
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

        const rawProfile = await findBusinessCardProfile({ tenantId, userId: id })
        const revealSensitive = id === user.id || hasTenantPermission(ctx, "user:view_all")
        const profile = rawProfile
            ? projectBusinessCardProfile(rawProfile, { audience: "vcard", revealSensitive })
            : null
        if (!profile) {
            return NextResponse.json({ error: "成员不存在或不在当前租户" }, { status: 404 })
        }

        const url = new URL(request.url)
        const cardUrl = url.searchParams.get("cardUrl")
        const resolvedCardUrl = cardUrl || new URL(`/team/${id}/card`, url.origin).toString()

        const vcard = buildVCard({ profile, cardUrl: resolvedCardUrl })
        const headers = new Headers()
        headers.set("Content-Type", "text/vcard; charset=utf-8")
        headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(vcard.filename)}`)
        headers.set("Cache-Control", "private, no-store")
        headers.set("X-Content-Type-Options", "nosniff")
        headers.set("X-RateLimit-Limit", String(rate.limit))
        headers.set("X-RateLimit-Remaining", String(rate.remaining))
        headers.set("X-RateLimit-Reset", String(Math.floor(rate.resetAt.getTime() / 1000)))

        return new Response(vcard.content, { status: 200, headers })
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json({ error: getPublicActionErrorMessage(error, "请先登录") }, { status: 401 })
        }
        if (error instanceof PermissionError) {
            return NextResponse.json({ error: getPublicActionErrorMessage(error, "权限不足") }, { status: 403 })
        }
        logger.error("生成名片 vCard 失败", error)
        return NextResponse.json({ error: "生成名片失败" }, { status: 500 })
    }
}
