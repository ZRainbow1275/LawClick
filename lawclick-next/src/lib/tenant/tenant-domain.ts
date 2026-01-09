import "server-only"

import { createHash } from "crypto"
import { z } from "zod"
import { TenantMembershipRole } from "@prisma/client"

import { hasTenantRole } from "@/lib/server-auth"

export const TenantIdSchema = z
    .string()
    .trim()
    .min(3, "tenantId 过短")
    .max(64, "tenantId 过长")
    .regex(
        /^(?:[a-z0-9][a-z0-9-]*[a-z0-9]|t:[a-f0-9]{32})$/i,
        "tenantId 格式无效：允许 slug（字母/数字/连字符，且不能以连字符开头/结尾）或 legacy t:<32位hex>"
    )

export const TenantNameSchema = z
    .string()
    .trim()
    .min(1, "租户名称不能为空")
    .max(100, "租户名称过长")

export const FirmNameSchema = z
    .string()
    .trim()
    .min(1, "机构名称不能为空")
    .max(100, "机构名称过长")

export const TenantMembershipRoleSchema = z.nativeEnum(TenantMembershipRole)

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase()
}

export function maxTenantRole(
    a: TenantMembershipRole,
    b: TenantMembershipRole
): TenantMembershipRole {
    return hasTenantRole(a, b) ? a : b
}

export function hashInviteToken(token: string): string {
    return createHash("sha256").update(token).digest("hex")
}

export function buildInviteUrl(token: string): string {
    const baseUrl = (process.env.NEXTAUTH_URL || "").trim() || "http://localhost:3000"
    return `${baseUrl.replace(/\/$/, "")}/tenants/accept?token=${encodeURIComponent(token)}`
}
