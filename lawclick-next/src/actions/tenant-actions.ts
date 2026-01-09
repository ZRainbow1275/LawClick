"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { TenantInviteStatus, TenantMembershipRole, TenantMembershipStatus } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { enforceActionRateLimit } from "@/lib/action-rate-limit"
import {
    AuthError,
    PermissionError,
    getActiveTenantContextWithPermissionOrThrow,
    getSessionUserOrThrow,
    getTenantId,
    hasTenantRole,
} from "@/lib/server-auth"
import {
    FirmNameSchema,
    TenantIdSchema,
    TenantNameSchema,
    normalizeEmail,
} from "@/lib/tenant/tenant-domain"
import {
    addTenantMemberByEmailImpl,
    listTenantMembersImpl,
    offboardTenantMemberImpl,
    setTenantMemberStatusImpl,
    updateTenantMemberRoleImpl,
} from "@/lib/tenant/tenant-membership-domain"
import {
    acceptTenantInviteByIdImpl,
    acceptTenantInviteImpl,
    createTenantInviteImpl,
    getMyPendingTenantInvitesImpl,
    revokeTenantInviteImpl,
} from "@/lib/tenant/tenant-invites-domain"
import { listBuiltinDocumentTemplates } from "@/lib/templates/builtin/builtin-document-templates"

export type MyTenantContext = {
    active: { id: string; name: string; role: TenantMembershipRole | null }     
    tenants: Array<{ id: string; name: string; role: TenantMembershipRole }>    
    pendingInvites: number
}

export async function getMyTenantContext(): Promise<{ success: true; data: MyTenantContext } | { success: false; error: string }> {
    try {
        const user = await getSessionUserOrThrow()
        const activeTenantId = getTenantId(user)

        const rate = await enforceActionRateLimit({
            tenantId: activeTenantId,
            userId: user.id,
            action: "tenant.getMyTenantContext",
            limit: 600,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return { success: false, error: rate.error }
        }

        const [memberships, pendingInvites] = await Promise.all([
            prisma.tenantMembership.findMany({
                where: { userId: user.id, status: TenantMembershipStatus.ACTIVE },
                orderBy: [{ role: "asc" }, { createdAt: "asc" }],
                select: {
                    role: true,
                    tenant: { select: { id: true, name: true } },
                },
                take: 50,
            }),
            prisma.tenantInvite.count({
                where: {
                    status: TenantInviteStatus.PENDING,
                    email: normalizeEmail(user.email),
                    expiresAt: { gt: new Date() },
                },
            }),
        ])

        const tenants = memberships.map((m) => ({ id: m.tenant.id, name: m.tenant.name, role: m.role }))
        const activeMembership = tenants.find((t) => t.id === activeTenantId) || null

        const activeName = (() => {
            if (activeMembership) return activeMembership.name
            const fallback = tenants[0]
            if (fallback) return fallback.name
            return activeTenantId
        })()

        return {
            success: true,
            data: {
                active: { id: activeTenantId, name: activeName, role: activeMembership?.role ?? null },
                tenants,
                pendingInvites,
            },
        }
    } catch (error) {
        logger.error("获取租户上下文失败", error)
        return { success: false, error: "获取租户上下文失败" }
    }
}

const SwitchActiveTenantInputSchema = z.object({ tenantId: TenantIdSchema }).strict()

export async function switchMyActiveTenant(input: { tenantId: string }) {
    const parsed = SwitchActiveTenantInputSchema.safeParse(input)
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }

    const user = await getSessionUserOrThrow()
    const activeTenantId = getTenantId(user)
    const tenantId = parsed.data.tenantId

    const rate = await enforceActionRateLimit({
        tenantId: activeTenantId,
        userId: user.id,
        action: "tenant.switchMyActiveTenant",
        limit: 60,
        windowMs: 60_000,
        extraKey: tenantId,
    })
    if (!rate.allowed) {
        return { success: false as const, error: rate.error }
    }

    const membership = await prisma.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        select: { status: true },
    })
    if (!membership || membership.status !== TenantMembershipStatus.ACTIVE) {
        return { success: false as const, error: "无该租户访问权限" }
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { activeTenantId: tenantId },
    })

    revalidatePath("/", "layout")
    return { success: true as const }
}

const CreateTenantInputSchema = z
    .object({
        id: TenantIdSchema,
        name: TenantNameSchema,
        switchToNewTenant: z.boolean().optional(),
    })
    .strict()

export async function createTenant(input: { id: string; name: string; switchToNewTenant?: boolean }) {
    const parsed = CreateTenantInputSchema.safeParse(input)
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }

    let user: Awaited<ReturnType<typeof getSessionUserOrThrow>>
    let firmId = ""
    let firmName = ""
    try {
        user = await getSessionUserOrThrow()
    } catch (error) {
        if (error instanceof AuthError) return { success: false as const, error: "未登录" }
        throw error
    }
    const activeTenantId = getTenantId(user)

    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("admin:settings")
        firmId = ctx.tenant.firmId
        firmName = ctx.tenant.firm?.name ?? ctx.tenant.name
    } catch (error) {
        if (error instanceof PermissionError)
            return { success: false as const, error: getPublicActionErrorMessage(error, "权限不足") }
        throw error
    }

    if (!firmId) return { success: false as const, error: "无法确定机构（firmId）" }

    const tenantId = parsed.data.id
    const tenantName = parsed.data.name
    const switchToNewTenant = Boolean(parsed.data.switchToNewTenant)

    const rate = await enforceActionRateLimit({
        tenantId: activeTenantId,
        userId: user.id,
        action: "tenant.createTenant",
        limit: 10,
        windowMs: 60_000,
        extraKey: tenantId,
    })
    if (!rate.allowed) {
        return { success: false as const, error: rate.error }
    }

    try {
        await prisma.$transaction(async (tx) => {
            await tx.firm.upsert({
                where: { id: firmId },
                update: {},
                create: { id: firmId, name: firmName },
            })

            await tx.tenant.create({
                data: {
                    id: tenantId,
                    firmId,
                    name: tenantName,
                },
            })

            const builtinTemplates = listBuiltinDocumentTemplates()
            await tx.documentTemplate.createMany({
                data: builtinTemplates.map((t) => ({
                    tenantId,
                    code: t.code,
                    name: t.name,
                    description: t.description,
                    variables: t.variables,
                    content: t.content,
                    isActive: true,
                })),
                skipDuplicates: true,
            })

            await tx.tenantMembership.upsert({
                where: { tenantId_userId: { tenantId, userId: user.id } },      
                update: {
                    status: TenantMembershipStatus.ACTIVE,
                    role: TenantMembershipRole.OWNER,
                },
                create: {
                    id: `tm:${tenantId}:${user.id}`,
                    tenantId,
                    userId: user.id,
                    status: TenantMembershipStatus.ACTIVE,
                    role: TenantMembershipRole.OWNER,
                },
            })

            await tx.firmMembership.upsert({
                where: { firmId_userId: { firmId, userId: user.id } },
                update: {
                    status: TenantMembershipStatus.ACTIVE,
                    role: TenantMembershipRole.OWNER,
                },
                create: {
                    id: `fm:${firmId}:${user.id}`,
                    firmId,
                    userId: user.id,
                    status: TenantMembershipStatus.ACTIVE,
                    role: TenantMembershipRole.OWNER,
                },
            })

            if (switchToNewTenant) {
                await tx.user.update({ where: { id: user.id }, data: { activeTenantId: tenantId } })
            }
        })

        revalidatePath("/", "layout")
        revalidatePath("/admin/tenants")
        revalidatePath("/tenants")
        return { success: true as const }
    } catch (error) {
        logger.error("创建租户失败", error)
        return { success: false as const, error: "创建租户失败（可能 tenantId 已存在）" }
    }
}

const UpdateFirmProfileInputSchema = z
    .object({
        name: FirmNameSchema,
    })
    .strict()

export async function updateMyFirmProfile(input: { name: string }) {
    const parsed = UpdateFirmProfileInputSchema.safeParse(input)
    if (!parsed.success) return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }

    let ctx: Awaited<ReturnType<typeof getActiveTenantContextWithPermissionOrThrow>>
    try {
        ctx = await getActiveTenantContextWithPermissionOrThrow("admin:settings")
    } catch (error) {
        if (error instanceof AuthError) return { success: false as const, error: "未登录" }
        if (error instanceof PermissionError)
            return { success: false as const, error: getPublicActionErrorMessage(error, "权限不足") }
        throw error
    }

    const firmId = (ctx.tenant.firmId || "").trim()
    if (!firmId) return { success: false as const, error: "无法确定机构（firmId）" }

    const rate = await enforceActionRateLimit({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        action: "tenant.updateMyFirmProfile",
        limit: 30,
        windowMs: 60_000,
        extraKey: firmId,
    })
    if (!rate.allowed) return { success: false as const, error: rate.error }

    const firmMembership = await prisma.firmMembership.findUnique({
        where: { firmId_userId: { firmId, userId: ctx.user.id } },
        select: { role: true, status: true },
    })

    if (!firmMembership || firmMembership.status !== TenantMembershipStatus.ACTIVE) {
        return { success: false as const, error: "无机构访问权限" }
    }

    if (!hasTenantRole(firmMembership.role, TenantMembershipRole.ADMIN)) {
        return { success: false as const, error: "缺少机构管理权限" }
    }

    try {
        const updated = await prisma.firm.update({
            where: { id: firmId },
            data: { name: parsed.data.name },
            select: { id: true, name: true },
        })

        revalidatePath("/", "layout")
        revalidatePath("/admin/tenants")
        return { success: true as const, data: updated }
    } catch (error) {
        logger.error("更新机构信息失败", error)
        return { success: false as const, error: "更新机构信息失败" }
    }
}

export async function createTenantInvite(input: {
    tenantId?: string
    email: string
    role?: TenantMembershipRole
    expiresInDays?: number
}) {
    const result = await createTenantInviteImpl(input)
    if (result.success) revalidatePath("/admin/tenants")
    return result
}

export async function addTenantMemberByEmail(input: { tenantId?: string; email: string; role?: TenantMembershipRole }) {
    const result = await addTenantMemberByEmailImpl(input)
    if (result.success) revalidatePath("/admin/tenants")
    return result
}

export async function listTenantMembers(input?: { tenantId?: string; includeInactive?: boolean }) {
    return listTenantMembersImpl(input)
}

export async function updateTenantMemberRole(input: { membershipId: string; role: TenantMembershipRole }) {
    const result = await updateTenantMemberRoleImpl(input)
    if (result.success) {
        revalidatePath("/admin/tenants")
        revalidatePath("/tenants")
    }
    return result
}

export async function setTenantMemberStatus(input: { membershipId: string; status: TenantMembershipStatus }) {
    const result = await setTenantMemberStatusImpl(input)
    if (result.success) {
        revalidatePath("/admin/tenants")
        revalidatePath("/tenants")
    }
    return result
}

export async function offboardTenantMember(input: { membershipId: string; successorUserId: string }) {
    const result = await offboardTenantMemberImpl(input)
    if (result.success) {
        revalidatePath("/admin/tenants")
        revalidatePath("/tenants")
        revalidatePath("/", "layout")
    }
    return result
}

export async function getMyPendingTenantInvites(input?: { includeExpired?: boolean; take?: number }) {
    return getMyPendingTenantInvitesImpl(input)
}

export async function acceptTenantInvite(input: { token: string }) {
    const result = await acceptTenantInviteImpl(input)
    if (result.success) revalidatePath("/", "layout")
    return result
}

export async function acceptTenantInviteById(input: { inviteId: string }) {
    const result = await acceptTenantInviteByIdImpl(input)
    if (result.success) revalidatePath("/", "layout")
    return result
}

export async function revokeTenantInvite(input: { inviteId: string }) {
    const result = await revokeTenantInviteImpl(input)
    if (result.success) revalidatePath("/admin/tenants")
    return result
}
