"use server"

import { enforceRateLimit } from "@/lib/action-rate-limit"
import type { ActionResponse } from "@/lib/action-response"
import { findBusinessCardProfile, projectBusinessCardProfile, type BusinessCardProfile } from "@/lib/business-card/business-card"
import { getActiveTenantContextWithPermissionOrThrow, hasTenantPermission } from "@/lib/server-auth"
import { UuidSchema } from "@/lib/zod"

export async function getUserBusinessCard(userId: string): Promise<ActionResponse<{ data: BusinessCardProfile }>> {
    const parsedId = UuidSchema.safeParse(userId)
    if (!parsedId.success) {
        return { success: false, error: "输入校验失败" }
    }

    const ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
    const rate = await enforceRateLimit({
        ctx,
        action: "team.user.businessCard.get",
        limit: 240,
        extraKey: parsedId.data,
    })
    if (!rate.allowed) {
        return { success: false, error: rate.error }
    }

    const profile = await findBusinessCardProfile({ tenantId: ctx.tenantId, userId: parsedId.data })
    if (!profile) {
        return { success: false, error: "成员不存在或不在当前租户" }
    }

    const revealSensitive = parsedId.data === ctx.user.id || hasTenantPermission(ctx, "user:view_all")
    return {
        success: true,
        data: projectBusinessCardProfile(profile, { audience: "card", revealSensitive }),
    }
}
