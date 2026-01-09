import "server-only"

import { randomBytes } from "crypto"
import { z } from "zod"
import {
    TenantInviteStatus,
    TenantMembershipRole,
    TenantMembershipStatus,
} from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { enforceActionRateLimit } from "@/lib/action-rate-limit"
import {
    AuthError,
    PermissionError,
    getSessionUserOrThrow,
    getTenantId,
    requireTenantMembership,
} from "@/lib/server-auth"
import { queue, TaskType } from "@/lib/queue"
import { QUEUE_TASK_PRIORITY } from "@/lib/queue-policy"
import { UuidSchema } from "@/lib/zod"
import {
    TenantIdSchema,
    TenantMembershipRoleSchema,
    buildInviteUrl,
    hashInviteToken,
    normalizeEmail,
} from "@/lib/tenant/tenant-domain"

const CreateTenantInviteInputSchema = z
    .object({
        tenantId: TenantIdSchema.optional(),
        email: z.string().email("邮箱格式不正确"),
        role: TenantMembershipRoleSchema.optional(),
        expiresInDays: z.number().int().min(1).max(30).optional(),
    })
    .strict()

export async function createTenantInviteImpl(input: {
    tenantId?: string
    email: string
    role?: TenantMembershipRole
    expiresInDays?: number
}) {
    const parsed = CreateTenantInviteInputSchema.safeParse(input)
    if (!parsed.success) {
        return {
            success: false as const,
            error: parsed.error.issues[0]?.message || "输入校验失败",
        }
    }

    let user: Awaited<ReturnType<typeof getSessionUserOrThrow>>
    try {
        user = await getSessionUserOrThrow()
    } catch (error) {
        if (error instanceof AuthError) {
            return { success: false as const, error: "未登录" }
        }
        throw error
    }

    const tenantId = parsed.data.tenantId ?? getTenantId(user)

    try {
        await requireTenantMembership({
            tenantId,
            userId: user.id,
            requireRole: TenantMembershipRole.ADMIN,
        })
    } catch (error) {
        if (error instanceof PermissionError) {
            return {
                success: false as const,
                error: getPublicActionErrorMessage(error, "权限不足"),
            }
        }
        throw error
    }

    const email = normalizeEmail(parsed.data.email)

    const rate = await enforceActionRateLimit({
        tenantId,
        userId: user.id,
        action: "tenant.invites.create",
        limit: 60,
        windowMs: 60_000,
        extraKey: email,
    })
    if (!rate.allowed) return { success: false as const, error: rate.error }

    const role = parsed.data.role ?? TenantMembershipRole.MEMBER
    const expiresInDays = parsed.data.expiresInDays ?? 7

    const token = randomBytes(32).toString("hex")
    const tokenHash = hashInviteToken(token)
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)

    try {
        const invite = await prisma.tenantInvite.create({
            data: {
                tenantId,
                status: TenantInviteStatus.PENDING,
                email,
                role,
                tokenHash,
                expiresAt,
                createdById: user.id,
            },
            select: { id: true, tenant: { select: { name: true } } },
        })

        const actionUrl = buildInviteUrl(token)
        const subject = `租户邀请：加入 ${invite.tenant.name}`
        const content = [
            `你被邀请加入租户：${invite.tenant.name}`,
            "",
            `邀请邮箱：${email}`,
            `角色：${role}`,
            `有效期：${expiresInDays} 天`,
            "",
            `点击链接接受邀请：${actionUrl}`,
        ].join("\n")

        await queue.enqueue(
            TaskType.SEND_EMAIL,
            { to: email, subject, content, actionUrl },
            {
                tenantId,
                priority: QUEUE_TASK_PRIORITY[TaskType.SEND_EMAIL],
                idempotencyKey: `tenant-invite/${invite.id}`,
                maxAttempts: 5,
            }
        )

        return {
            success: true as const,
            data: { inviteId: invite.id, inviteUrl: actionUrl },
        }
    } catch (error) {
        logger.error("创建租户邀请失败", error)
        return { success: false as const, error: "创建租户邀请失败" }
    }
}

const GetMyPendingInvitesInputSchema = z
    .object({
        includeExpired: z.boolean().optional(),
        take: z.number().int().min(1).max(200).optional(),
    })
    .strict()
    .optional()

export async function getMyPendingTenantInvitesImpl(input?: {
    includeExpired?: boolean
    take?: number
}) {
    const parsed = GetMyPendingInvitesInputSchema.safeParse(input)
    if (!parsed.success) {
        return {
            success: false as const,
            error: parsed.error.issues[0]?.message || "输入校验失败",
            data: [] as const,
        }
    }
    input = parsed.data

    const user = await getSessionUserOrThrow()
    const email = normalizeEmail(user.email)
    const activeTenantId = getTenantId(user)

    const rate = await enforceActionRateLimit({
        tenantId: activeTenantId,
        userId: user.id,
        action: "tenant.invites.listMyPending",
        limit: 600,
        windowMs: 60_000,
        extraKey: email,
    })
    if (!rate.allowed) {
        return { success: false as const, error: rate.error, data: [] as const }
    }

    const includeExpired = Boolean(input?.includeExpired)
    const take = input?.take ?? 50

    const invites = await prisma.tenantInvite.findMany({
        where: {
            email,
            status: TenantInviteStatus.PENDING,
            ...(includeExpired ? {} : { expiresAt: { gt: new Date() } }),
        },
        orderBy: { createdAt: "desc" },
        take,
        select: {
            id: true,
            tenantId: true,
            role: true,
            expiresAt: true,
            createdAt: true,
            tenant: { select: { name: true } },
        },
    })

    return {
        success: true as const,
        data: invites.map((row) => ({
            id: row.id,
            tenantId: row.tenantId,
            tenantName: row.tenant.name,
            role: row.role,
            expiresAt: row.expiresAt.toISOString(),
            createdAt: row.createdAt.toISOString(),
        })),
    }
}

const AcceptTenantInviteInputSchema = z
    .object({ token: z.string().trim().min(1).max(256) })
    .strict()

export async function acceptTenantInviteImpl(input: { token: string }) {
    const parsed = AcceptTenantInviteInputSchema.safeParse(input)
    if (!parsed.success) {
        return {
            success: false as const,
            error: parsed.error.issues[0]?.message || "输入校验失败",
        }
    }

    const user = await getSessionUserOrThrow()
    const tokenHash = hashInviteToken(parsed.data.token)

    const invite = await prisma.tenantInvite.findUnique({
        where: { tokenHash },
        select: {
            id: true,
            tenantId: true,
            email: true,
            role: true,
            status: true,
            expiresAt: true,
        },
    })

    if (!invite) return { success: false as const, error: "邀请码无效" }

    const now = new Date()
    if (invite.status !== TenantInviteStatus.PENDING) {
        return { success: false as const, error: "邀请码已被使用或已失效" }
    }

    if (invite.expiresAt.getTime() <= now.getTime()) {
        await prisma.tenantInvite.update({
            where: { id: invite.id },
            data: { status: TenantInviteStatus.EXPIRED, updatedAt: now },
        })
        return { success: false as const, error: "邀请码已过期" }
    }

    if (normalizeEmail(invite.email) !== normalizeEmail(user.email)) {
        return { success: false as const, error: "该邀请码不属于当前登录邮箱" }
    }

    try {
        const rate = await enforceActionRateLimit({
            tenantId: invite.tenantId,
            userId: user.id,
            action: "tenant.invites.accept",
            limit: 30,
            windowMs: 60_000,
            extraKey: invite.id,
        })
        if (!rate.allowed) return { success: false as const, error: rate.error }

        await prisma.$transaction(async (tx) => {
            const tenant = await tx.tenant.findUnique({
                where: { id: invite.tenantId },
                select: { firmId: true },
            })
            if (!tenant) {
                throw new Error("租户不存在")
            }

            await tx.tenantMembership.upsert({
                where: {
                    tenantId_userId: { tenantId: invite.tenantId, userId: user.id },
                },
                update: { status: TenantMembershipStatus.ACTIVE, role: invite.role },
                create: {
                    id: `tm:${invite.tenantId}:${user.id}`,
                    tenantId: invite.tenantId,
                    userId: user.id,
                    role: invite.role,
                    status: TenantMembershipStatus.ACTIVE,
                },
            })

            await tx.firmMembership.upsert({
                where: { firmId_userId: { firmId: tenant.firmId, userId: user.id } },
                update: { status: TenantMembershipStatus.ACTIVE, role: invite.role },
                create: {
                    id: `fm:${tenant.firmId}:${user.id}`,
                    firmId: tenant.firmId,
                    userId: user.id,
                    role: invite.role,
                    status: TenantMembershipStatus.ACTIVE,
                },
            })

            await tx.tenantInvite.update({
                where: { id: invite.id },
                data: {
                    status: TenantInviteStatus.ACCEPTED,
                    acceptedById: user.id,
                    acceptedAt: now,
                    updatedAt: now,
                },
            })

            await tx.user.update({
                where: { id: user.id },
                data: { activeTenantId: invite.tenantId },
            })
        })

        return { success: true as const, data: { tenantId: invite.tenantId } }
    } catch (error) {
        logger.error("接受租户邀请失败", error)
        return { success: false as const, error: "接受租户邀请失败" }
    }
}

const AcceptTenantInviteByIdInputSchema = z.object({ inviteId: UuidSchema }).strict()

export async function acceptTenantInviteByIdImpl(input: { inviteId: string }) {
    const parsed = AcceptTenantInviteByIdInputSchema.safeParse(input)
    if (!parsed.success) {
        return {
            success: false as const,
            error: parsed.error.issues[0]?.message || "输入校验失败",
        }
    }

    const user = await getSessionUserOrThrow()
    const activeTenantId = getTenantId(user)

    const rate = await enforceActionRateLimit({
        tenantId: activeTenantId,
        userId: user.id,
        action: "tenant.invites.acceptById",
        limit: 30,
        windowMs: 60_000,
        extraKey: parsed.data.inviteId,
    })
    if (!rate.allowed) return { success: false as const, error: rate.error }

    const invite = await prisma.tenantInvite.findFirst({
        where: {
            id: parsed.data.inviteId,
            email: { equals: user.email, mode: "insensitive" },
        },
        select: {
            id: true,
            tenantId: true,
            email: true,
            role: true,
            status: true,
            expiresAt: true,
        },
    })

    if (!invite) return { success: false as const, error: "邀请不存在或已失效" }

    const now = new Date()
    if (invite.status !== TenantInviteStatus.PENDING) {
        return { success: false as const, error: "该邀请已被使用或已失效" }
    }

    if (invite.expiresAt.getTime() <= now.getTime()) {
        await prisma.tenantInvite.updateMany({
            where: {
                id: invite.id,
                email: { equals: user.email, mode: "insensitive" },
            },
            data: { status: TenantInviteStatus.EXPIRED, updatedAt: now },
        })
        return { success: false as const, error: "邀请已过期" }
    }

    try {
        await prisma.$transaction(async (tx) => {
            const tenant = await tx.tenant.findUnique({
                where: { id: invite.tenantId },
                select: { firmId: true },
            })
            if (!tenant) {
                throw new Error("租户不存在")
            }

            await tx.tenantMembership.upsert({
                where: {
                    tenantId_userId: { tenantId: invite.tenantId, userId: user.id },
                },
                update: { status: TenantMembershipStatus.ACTIVE, role: invite.role },
                create: {
                    id: `tm:${invite.tenantId}:${user.id}`,
                    tenantId: invite.tenantId,
                    userId: user.id,
                    role: invite.role,
                    status: TenantMembershipStatus.ACTIVE,
                },
            })

            await tx.firmMembership.upsert({
                where: { firmId_userId: { firmId: tenant.firmId, userId: user.id } },
                update: { status: TenantMembershipStatus.ACTIVE, role: invite.role },
                create: {
                    id: `fm:${tenant.firmId}:${user.id}`,
                    firmId: tenant.firmId,
                    userId: user.id,
                    role: invite.role,
                    status: TenantMembershipStatus.ACTIVE,
                },
            })

            await tx.tenantInvite.update({
                where: { id: invite.id },
                data: {
                    status: TenantInviteStatus.ACCEPTED,
                    acceptedById: user.id,
                    acceptedAt: now,
                    updatedAt: now,
                },
            })

            await tx.user.update({
                where: { id: user.id },
                data: { activeTenantId: invite.tenantId },
            })
        })

        return { success: true as const, data: { tenantId: invite.tenantId } }
    } catch (error) {
        logger.error("接受租户邀请失败", error)
        return { success: false as const, error: "接受租户邀请失败" }
    }
}

const RevokeTenantInviteInputSchema = z.object({ inviteId: UuidSchema }).strict()

export async function revokeTenantInviteImpl(input: { inviteId: string }) {
    const parsed = RevokeTenantInviteInputSchema.safeParse(input)
    if (!parsed.success) {
        return {
            success: false as const,
            error: parsed.error.issues[0]?.message || "输入校验失败",
        }
    }

    let user: Awaited<ReturnType<typeof getSessionUserOrThrow>>
    try {
        user = await getSessionUserOrThrow()
    } catch (error) {
        if (error instanceof AuthError) {
            return { success: false as const, error: "未登录" }
        }
        throw error
    }

    const invite = await prisma.tenantInvite.findUnique({
        where: { id: parsed.data.inviteId },
        select: { id: true, tenantId: true, status: true },
    })
    if (!invite) return { success: false as const, error: "邀请不存在" }

    try {
        const rate = await enforceActionRateLimit({
            tenantId: invite.tenantId,
            userId: user.id,
            action: "tenant.invites.revoke",
            limit: 60,
            windowMs: 60_000,
            extraKey: invite.id,
        })
        if (!rate.allowed) return { success: false as const, error: rate.error }

        await requireTenantMembership({
            tenantId: invite.tenantId,
            userId: user.id,
            requireRole: TenantMembershipRole.ADMIN,
        })
    } catch (error) {
        if (error instanceof PermissionError) {
            return {
                success: false as const,
                error: getPublicActionErrorMessage(error, "权限不足"),
            }
        }
        throw error
    }

    if (invite.status !== TenantInviteStatus.PENDING) {
        return { success: false as const, error: "该邀请已被处理，无法撤销" }
    }

    await prisma.tenantInvite.update({
        where: { id: invite.id },
        data: {
            status: TenantInviteStatus.REVOKED,
            revokedAt: new Date(),
        },
    })

    return { success: true as const }
}
