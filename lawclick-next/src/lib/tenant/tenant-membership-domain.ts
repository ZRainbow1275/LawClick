import "server-only"

import { z } from "zod"
import {
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
import {
    TenantIdSchema,
    TenantMembershipRoleSchema,
    maxTenantRole,
    normalizeEmail,
} from "@/lib/tenant/tenant-domain"

const AddTenantMemberByEmailInputSchema = z
    .object({
        tenantId: TenantIdSchema.optional(),
        email: z.string().email("邮箱格式不正确"),
        role: TenantMembershipRoleSchema.optional(),
    })
    .strict()

export async function addTenantMemberByEmailImpl(input: {
    tenantId?: string
    email: string
    role?: TenantMembershipRole
}) {
    const parsed = AddTenantMemberByEmailInputSchema.safeParse(input)
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
    const role = parsed.data.role ?? TenantMembershipRole.MEMBER

    const rate = await enforceActionRateLimit({
        tenantId,
        userId: user.id,
        action: "tenant.members.addByEmail",
        limit: 30,
        windowMs: 60_000,
        extraKey: email,
    })
    if (!rate.allowed) return { success: false as const, error: rate.error }

    const target = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
    })
    if (!target) return { success: false as const, error: "该邮箱尚未注册用户" }

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { firmId: true },
    })
    if (!tenant) return { success: false as const, error: "租户不存在" }

    await prisma.$transaction(async (tx) => {
        await tx.tenantMembership.upsert({
            where: { tenantId_userId: { tenantId, userId: target.id } },
            update: {
                status: TenantMembershipStatus.ACTIVE,
                role,
            },
            create: {
                id: `tm:${tenantId}:${target.id}`,
                tenantId,
                userId: target.id,
                status: TenantMembershipStatus.ACTIVE,
                role,
            },
        })

        await tx.firmMembership.upsert({
            where: {
                firmId_userId: { firmId: tenant.firmId, userId: target.id },
            },
            update: {
                status: TenantMembershipStatus.ACTIVE,
                role,
            },
            create: {
                id: `fm:${tenant.firmId}:${target.id}`,
                firmId: tenant.firmId,
                userId: target.id,
                status: TenantMembershipStatus.ACTIVE,
                role,
            },
        })
    })

    return { success: true as const }
}

const ListTenantMembersInputSchema = z
    .object({
        tenantId: TenantIdSchema.optional(),
        includeInactive: z.boolean().optional(),
    })
    .strict()
    .optional()

export async function listTenantMembersImpl(input?: {
    tenantId?: string
    includeInactive?: boolean
}) {
    const parsed = ListTenantMembersInputSchema.safeParse(input)
    if (!parsed.success) {
        return {
            success: false as const,
            error: parsed.error.issues[0]?.message || "输入校验失败",
            data: [] as const,
        }
    }
    input = parsed.data

    let user: Awaited<ReturnType<typeof getSessionUserOrThrow>>
    try {
        user = await getSessionUserOrThrow()
    } catch (error) {
        if (error instanceof AuthError) {
            return { success: false as const, error: "未登录", data: [] as const }
        }
        throw error
    }

    const tenantId = input?.tenantId ?? getTenantId(user)

    const rate = await enforceActionRateLimit({
        tenantId,
        userId: user.id,
        action: "tenant.members.list",
        limit: 600,
        windowMs: 60_000,
    })
    if (!rate.allowed) {
        return { success: false as const, error: rate.error, data: [] as const }
    }

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
                data: [] as const,
            }
        }
        throw error
    }

    const includeInactive = Boolean(input?.includeInactive)

    const members = await prisma.tenantMembership.findMany({
        where: {
            tenantId,
            ...(includeInactive ? {} : { status: TenantMembershipStatus.ACTIVE }),
        },
        orderBy: [{ role: "desc" }, { createdAt: "desc" }],
        select: {
            id: true,
            role: true,
            status: true,
            createdAt: true,
            user: {
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    avatarUrl: true,
                    department: true,
                    title: true,
                    isActive: true,
                },
            },
        },
        take: 2000,
    })

    return {
        success: true as const,
        data: members.map((m) => ({
            id: m.id,
            role: m.role,
            status: m.status,
            createdAt: m.createdAt.toISOString(),
            user: m.user,
        })),
    }
}

const TenantMembershipIdSchema = z.string().trim().min(1).max(200)

const UpdateTenantMemberRoleInputSchema = z
    .object({
        membershipId: TenantMembershipIdSchema,
        role: TenantMembershipRoleSchema,
    })
    .strict()

export async function updateTenantMemberRoleImpl(input: {
    membershipId: string
    role: TenantMembershipRole
}) {
    const parsed = UpdateTenantMemberRoleInputSchema.safeParse(input)
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

    const tenantId = getTenantId(user)
    const membershipId = parsed.data.membershipId
    const nextRole = parsed.data.role

    const rate = await enforceActionRateLimit({
        tenantId,
        userId: user.id,
        action: "tenant.members.updateRole",
        limit: 60,
        windowMs: 60_000,
        extraKey: membershipId,
    })
    if (!rate.allowed) return { success: false as const, error: rate.error }

    let actor: Awaited<ReturnType<typeof requireTenantMembership>>
    try {
        actor = await requireTenantMembership({
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

    const target = await prisma.tenantMembership.findFirst({
        where: { id: membershipId, tenantId },
        select: { id: true, userId: true, role: true, status: true },
    })

    if (!target) return { success: false as const, error: "成员不存在" }
    if (target.userId === user.id) {
        return {
            success: false as const,
            error: "不支持修改自己的租户角色（避免锁死）",
        }
    }

    const actorIsOwner = actor.role === TenantMembershipRole.OWNER
    const touchesOwner =
        target.role === TenantMembershipRole.OWNER ||
        nextRole === TenantMembershipRole.OWNER

    if (touchesOwner && !actorIsOwner) {
        return { success: false as const, error: "仅租户 Owner 可变更 Owner 角色" }
    }

    if (
        target.role === TenantMembershipRole.OWNER &&
        nextRole !== TenantMembershipRole.OWNER &&
        target.status === TenantMembershipStatus.ACTIVE
    ) {
        const otherOwners = await prisma.tenantMembership.count({
            where: {
                tenantId,
                status: TenantMembershipStatus.ACTIVE,
                role: TenantMembershipRole.OWNER,
                NOT: { id: target.id },
            },
        })
        if (otherOwners === 0) {
            return { success: false as const, error: "至少保留一个 Owner" }
        }
    }

    try {
        await prisma.$transaction(async (tx) => {
            const updated = await tx.tenantMembership.updateMany({
                where: { id: target.id, tenantId },
                data: { role: nextRole },
            })
            if (updated.count === 0) {
                throw new Error("成员不存在或已被移除")
            }

            const tenant = await tx.tenant.findUnique({
                where: { id: tenantId },
                select: { firmId: true },
            })
            if (!tenant) return

            const activeRoles = await tx.tenantMembership.findMany({
                where: {
                    userId: target.userId,
                    status: TenantMembershipStatus.ACTIVE,
                    tenant: { firmId: tenant.firmId },
                },
                select: { role: true },
                take: 200,
            })

            if (activeRoles.length === 0) {
                await tx.firmMembership.updateMany({
                    where: { firmId: tenant.firmId, userId: target.userId },
                    data: { status: TenantMembershipStatus.DISABLED },
                })
                return
            }

            const maxRole = activeRoles
                .map((r) => r.role)
                .reduce(
                    (acc, role) => maxTenantRole(acc, role),
                    TenantMembershipRole.VIEWER
                )

            await tx.firmMembership.upsert({
                where: {
                    firmId_userId: {
                        firmId: tenant.firmId,
                        userId: target.userId,
                    },
                },
                update: {
                    status: TenantMembershipStatus.ACTIVE,
                    role: maxRole,
                },
                create: {
                    id: `fm:${tenant.firmId}:${target.userId}`,
                    firmId: tenant.firmId,
                    userId: target.userId,
                    status: TenantMembershipStatus.ACTIVE,
                    role: maxRole,
                },
            })
        })

        return { success: true as const }
    } catch (error) {
        logger.error("更新成员角色失败", error)
        return { success: false as const, error: "更新成员角色失败" }
    }
}

const SetTenantMemberStatusInputSchema = z
    .object({
        membershipId: TenantMembershipIdSchema,
        status: z.enum([
            TenantMembershipStatus.ACTIVE,
            TenantMembershipStatus.DISABLED,
        ]),
    })
    .strict()

export async function setTenantMemberStatusImpl(input: {
    membershipId: string
    status: TenantMembershipStatus
}) {
    const parsed = SetTenantMemberStatusInputSchema.safeParse(input)
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

    const tenantId = getTenantId(user)
    const membershipId = parsed.data.membershipId
    const nextStatus = parsed.data.status

    const rate = await enforceActionRateLimit({
        tenantId,
        userId: user.id,
        action: "tenant.members.setStatus",
        limit: 60,
        windowMs: 60_000,
        extraKey: membershipId,
    })
    if (!rate.allowed) return { success: false as const, error: rate.error }

    let actor: Awaited<ReturnType<typeof requireTenantMembership>>
    try {
        actor = await requireTenantMembership({
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

    const target = await prisma.tenantMembership.findFirst({
        where: { id: membershipId, tenantId },
        select: { id: true, userId: true, role: true, status: true },
    })

    if (!target) return { success: false as const, error: "成员不存在" }
    if (target.userId === user.id) {
        return {
            success: false as const,
            error: "不支持修改自己的成员状态（避免锁死）",
        }
    }

    const actorIsOwner = actor.role === TenantMembershipRole.OWNER
    if (
        target.role === TenantMembershipRole.OWNER &&
        nextStatus === TenantMembershipStatus.DISABLED &&
        !actorIsOwner
    ) {
        return { success: false as const, error: "仅租户 Owner 可停用 Owner" }
    }

    if (
        target.role === TenantMembershipRole.OWNER &&
        nextStatus === TenantMembershipStatus.DISABLED &&
        target.status === TenantMembershipStatus.ACTIVE
    ) {
        const otherOwners = await prisma.tenantMembership.count({
            where: {
                tenantId,
                status: TenantMembershipStatus.ACTIVE,
                role: TenantMembershipRole.OWNER,
                NOT: { id: target.id },
            },
        })
        if (otherOwners === 0) {
            return { success: false as const, error: "至少保留一个 Owner" }
        }
    }

    try {
        await prisma.$transaction(async (tx) => {
            const updated = await tx.tenantMembership.updateMany({
                where: { id: target.id, tenantId },
                data: { status: nextStatus },
            })
            if (updated.count === 0) {
                throw new Error("成员不存在或已被移除")
            }

            if (nextStatus === TenantMembershipStatus.DISABLED) {
                const activeTenant = await tx.user.findUnique({
                    where: { id: target.userId },
                    select: { id: true, activeTenantId: true, tenantId: true },
                })

                if (activeTenant?.activeTenantId === tenantId) {
                    const fallback = await tx.tenantMembership.findFirst({
                        where: {
                            userId: target.userId,
                            status: TenantMembershipStatus.ACTIVE,
                            tenantId: { not: tenantId },
                        },
                        orderBy: { createdAt: "asc" },
                        select: { tenantId: true },
                    })
                    const fallbackTenantId =
                        fallback?.tenantId || activeTenant.tenantId
                    if (fallbackTenantId) {
                        await tx.user.update({
                            where: { id: target.userId },
                            data: { activeTenantId: fallbackTenantId },
                        })
                    }
                }
            }

            const tenant = await tx.tenant.findUnique({
                where: { id: tenantId },
                select: { firmId: true },
            })
            if (!tenant) return

            const activeRoles = await tx.tenantMembership.findMany({
                where: {
                    userId: target.userId,
                    status: TenantMembershipStatus.ACTIVE,
                    tenant: { firmId: tenant.firmId },
                },
                select: { role: true },
                take: 200,
            })

            if (activeRoles.length === 0) {
                await tx.firmMembership.updateMany({
                    where: { firmId: tenant.firmId, userId: target.userId },
                    data: { status: TenantMembershipStatus.DISABLED },
                })
                return
            }

            const maxRole = activeRoles
                .map((r) => r.role)
                .reduce(
                    (acc, role) => maxTenantRole(acc, role),
                    TenantMembershipRole.VIEWER
                )

            await tx.firmMembership.upsert({
                where: {
                    firmId_userId: {
                        firmId: tenant.firmId,
                        userId: target.userId,
                    },
                },
                update: {
                    status: TenantMembershipStatus.ACTIVE,
                    role: maxRole,
                },
                create: {
                    id: `fm:${tenant.firmId}:${target.userId}`,
                    firmId: tenant.firmId,
                    userId: target.userId,
                    status: TenantMembershipStatus.ACTIVE,
                    role: maxRole,
                },
            })
        })

        return { success: true as const }
    } catch (error) {
        logger.error("更新成员状态失败", error)
        return { success: false as const, error: "更新成员状态失败" }
    }
}

const OffboardTenantMemberInputSchema = z
    .object({
        membershipId: TenantMembershipIdSchema,
        successorUserId: z.string().uuid("交接人用户ID无效"),
    })
    .strict()

export async function offboardTenantMemberImpl(input: { membershipId: string; successorUserId: string }) {
    const parsed = OffboardTenantMemberInputSchema.safeParse(input)
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

    const tenantId = getTenantId(user)
    const membershipId = parsed.data.membershipId
    const successorUserId = parsed.data.successorUserId

    const rate = await enforceActionRateLimit({
        tenantId,
        userId: user.id,
        action: "tenant.members.offboard",
        limit: 20,
        windowMs: 60_000,
        extraKey: membershipId,
    })
    if (!rate.allowed) return { success: false as const, error: rate.error }

    let actor: Awaited<ReturnType<typeof requireTenantMembership>>
    try {
        actor = await requireTenantMembership({
            tenantId,
            userId: user.id,
            requireRole: TenantMembershipRole.OWNER,
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

    const target = await prisma.tenantMembership.findFirst({
        where: { id: membershipId, tenantId },
        select: { id: true, userId: true, role: true, status: true },
    })
    if (!target) return { success: false as const, error: "成员不存在" }
    if (target.userId === user.id) {
        return { success: false as const, error: "不支持离职交接自己（避免锁死）" }
    }
    if (successorUserId === target.userId) {
        return { success: false as const, error: "交接人不能是本人" }
    }

    const successor = await prisma.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId, userId: successorUserId } },
        select: { userId: true, role: true, status: true },
    })
    if (!successor || successor.status !== TenantMembershipStatus.ACTIVE) {
        return { success: false as const, error: "交接人未加入本租户或未激活" }
    }

    const actorIsOwner = actor.role === TenantMembershipRole.OWNER
    if (!actorIsOwner) {
        return { success: false as const, error: "仅租户 Owner 可执行离职交接" }
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { firmId: true } })
            if (!tenant) {
                throw new Error("租户不存在")
            }

            let successorPromotedToOwner = false
            if (target.role === TenantMembershipRole.OWNER && target.status === TenantMembershipStatus.ACTIVE) {
                const otherOwners = await tx.tenantMembership.count({
                    where: {
                        tenantId,
                        status: TenantMembershipStatus.ACTIVE,
                        role: TenantMembershipRole.OWNER,
                        NOT: { userId: target.userId },
                    },
                })
                if (otherOwners === 0 && successor.role !== TenantMembershipRole.OWNER) {
                    await tx.tenantMembership.update({
                        where: {
                            tenantId_userId: {
                                tenantId,
                                userId: successor.userId,
                            },
                        },
                        data: { role: TenantMembershipRole.OWNER },
                    })
                    successorPromotedToOwner = true
                }
            }

            const [projects, tasks, handlerCases, originatorCases] = await Promise.all([
                tx.project.updateMany({
                    where: { tenantId, ownerId: target.userId },
                    data: { ownerId: successorUserId },
                }),
                tx.task.updateMany({
                    where: { tenantId, assigneeId: target.userId },
                    data: { assigneeId: successorUserId },
                }),
                tx.case.updateMany({
                    where: { tenantId, handlerId: target.userId },
                    data: { handlerId: successorUserId },
                }),
                tx.case.updateMany({
                    where: { tenantId, originatorId: target.userId },
                    data: { originatorId: successorUserId },
                }),
            ])

            const disabledMemberships = await tx.tenantMembership.updateMany({
                where: { userId: target.userId, tenant: { firmId: tenant.firmId } },
                data: { status: TenantMembershipStatus.DISABLED },
            })

            await tx.firmMembership.updateMany({
                where: { firmId: tenant.firmId, userId: target.userId },
                data: { status: TenantMembershipStatus.DISABLED },
            })

            await tx.user.updateMany({
                where: { id: target.userId },
                data: { isActive: false, leaveDate: new Date() },
            })

            return {
                successorPromotedToOwner,
                moved: {
                    projects: projects.count,
                    tasks: tasks.count,
                    handlerCases: handlerCases.count,
                    originatorCases: originatorCases.count,
                },
                disabledMemberships: disabledMemberships.count,
            }
        })

        logger.info("离职交接完成", {
            tenantId,
            targetUserId: target.userId,
            successorUserId,
            ...result,
        })

        return { success: true as const, data: result }
    } catch (error) {
        logger.error("离职交接失败", error)
        return { success: false as const, error: "离职交接失败" }
    }
}
