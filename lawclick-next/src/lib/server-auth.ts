import "server-only"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { buildCaseVisibilityWhere } from "@/lib/case-visibility"
import { hasPermission, type Permission } from "@/lib/permissions"
import { enterTenantRequestContext } from "@/lib/tenant-context"
import { Prisma, TenantMembershipRole, TenantMembershipStatus, type Role, type User } from "@prisma/client"

const DEFAULT_TENANT_ID = "default-tenant"

export class AuthError extends Error {
    code = "UNAUTHORIZED"
    constructor(message = "未登录") {
        super(message)
        this.name = "AuthError"
    }
}

export class PermissionError extends Error {
    code = "FORBIDDEN"
    constructor(message = "权限不足") {
        super(message)
        this.name = "PermissionError"
    }
}

export async function getSessionUser() {
    const session = await auth()
    const sessionUser = session?.user
    if (!sessionUser) return null

    const sessionUserIdValue = (sessionUser as { id?: unknown }).id
    const sessionUserId = typeof sessionUserIdValue === "string" ? sessionUserIdValue.trim() : ""
    const sessionEmailKey =
        typeof sessionUser.email === "string" ? sessionUser.email.trim().toLowerCase().slice(0, 256) : ""

    if (!sessionUserId && !sessionEmailKey) return null

    const user = await prisma.user.findUnique({
        where: sessionUserId ? { id: sessionUserId } : { email: sessionEmailKey },
    })
    if (!user) return null
    if (!user.isActive) return null

    try {
        const ensured = await ensureActiveTenantMembership(user)
        enterTenantRequestContext({ tenantId: getTenantId(ensured), userId: ensured.id })
        return ensured
    } catch (error) {
        if (error instanceof AuthError) return null
        throw error
    }
}

export async function getSessionUserOrThrow() {
    const user = await getSessionUser()
    if (!user) throw new AuthError()
    return user
}

export function requirePermission(role: Role, permission: Permission) {
    if (!hasPermission(role, permission)) {
        throw new PermissionError(`缺少权限：${permission}`)
    }
}

const TENANT_ROLE_RANK: Record<TenantMembershipRole, number> = {
    VIEWER: 0,
    MEMBER: 1,
    ADMIN: 2,
    OWNER: 3,
}

export function hasTenantRole(role: TenantMembershipRole, atLeast: TenantMembershipRole): boolean {
    return TENANT_ROLE_RANK[role] >= TENANT_ROLE_RANK[atLeast]
}

const TENANT_PERMISSION_MIN_ROLE: Record<Permission, TenantMembershipRole> = {
    "dashboard:view": TenantMembershipRole.VIEWER,
    "dashboard:edit": TenantMembershipRole.MEMBER,

    "case:view": TenantMembershipRole.VIEWER,
    "case:create": TenantMembershipRole.MEMBER,
    "case:edit": TenantMembershipRole.MEMBER,
    "case:delete": TenantMembershipRole.ADMIN,
    "case:assign": TenantMembershipRole.MEMBER,
    "case:archive": TenantMembershipRole.MEMBER,

    "task:view": TenantMembershipRole.VIEWER,
    "task:create": TenantMembershipRole.MEMBER,
    "task:edit": TenantMembershipRole.MEMBER,
    "task:delete": TenantMembershipRole.ADMIN,

    "document:view": TenantMembershipRole.VIEWER,
    "document:upload": TenantMembershipRole.MEMBER,
    "document:edit": TenantMembershipRole.MEMBER,
    "document:delete": TenantMembershipRole.ADMIN,
    "document:template_manage": TenantMembershipRole.ADMIN,

    "billing:view": TenantMembershipRole.VIEWER,
    "billing:create": TenantMembershipRole.MEMBER,
    "billing:edit": TenantMembershipRole.MEMBER,
    "billing:approve": TenantMembershipRole.ADMIN,
    "timelog:approve": TenantMembershipRole.ADMIN,

    "team:view": TenantMembershipRole.MEMBER,
    "team:manage": TenantMembershipRole.ADMIN,
    "user:manage": TenantMembershipRole.ADMIN,
    "user:view_all": TenantMembershipRole.ADMIN,

    "approval:create": TenantMembershipRole.MEMBER,
    "approval:approve": TenantMembershipRole.ADMIN,
    "approval:view_all": TenantMembershipRole.ADMIN,

    "crm:view": TenantMembershipRole.MEMBER,
    "crm:edit": TenantMembershipRole.MEMBER,

    "tools:manage": TenantMembershipRole.ADMIN,
    "ai:use": TenantMembershipRole.MEMBER,

    "admin:access": TenantMembershipRole.ADMIN,
    "admin:settings": TenantMembershipRole.ADMIN,
    "admin:audit": TenantMembershipRole.ADMIN,
}

export function requireTenantPermission(
    ctx: { user: { role: Role }; membership: { role: TenantMembershipRole } },
    permission: Permission
) {
    requirePermission(ctx.user.role, permission)
    if (!hasTenantRole(ctx.membership.role, TENANT_PERMISSION_MIN_ROLE[permission])) {
        throw new PermissionError("当前工作区权限不足")
    }
}

export function hasTenantPermission(
    ctx: { user: { role: Role }; membership: { role: TenantMembershipRole } },
    permission: Permission
): boolean {
    return hasPermission(ctx.user.role, permission) && hasTenantRole(ctx.membership.role, TENANT_PERMISSION_MIN_ROLE[permission])
}

export async function requireTenantMembership(input: {
    tenantId: string
    userId: string
    requireRole?: TenantMembershipRole
}) {
    const membership = await prisma.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId: input.tenantId, userId: input.userId } },
        select: { role: true, status: true },
    })

    if (!membership || membership.status !== TenantMembershipStatus.ACTIVE) {
        throw new PermissionError("不属于该租户或成员状态不可用")
    }

    if (input.requireRole && !hasTenantRole(membership.role, input.requireRole)) {
        throw new PermissionError("缺少租户管理权限")
    }

    return membership
}

export async function getActiveTenantContextOrThrow(input?: { requireRole?: TenantMembershipRole }) {
    const user = await getSessionUserOrThrow()
    const tenantId = getTenantId(user)
    const [tenant, membership] = await Promise.all([
        prisma.tenant.findUnique({
            where: { id: tenantId },
            select: {
                id: true,
                name: true,
                firmId: true,
                firm: { select: { id: true, name: true } },
            },
        }),
        prisma.tenantMembership.findUnique({
            where: { tenantId_userId: { tenantId, userId: user.id } },
            select: { role: true, status: true },
        }),
    ])

    if (!tenant) throw new PermissionError("租户不存在")
    if (!membership || membership.status !== TenantMembershipStatus.ACTIVE) {
        throw new PermissionError("无该租户访问权限")
    }
    if (input?.requireRole && !hasTenantRole(membership.role, input.requireRole)) {
        throw new PermissionError("缺少租户管理权限")
    }

    enterTenantRequestContext({ tenantId, userId: user.id })
    return { user, tenantId, tenant, membership }
}

export type TenantViewer = { id: string; role: Role; tenantId: string }

export function toTenantViewer(input: { user: { id: string; role: Role }; tenantId: string }): TenantViewer {
    return { id: input.user.id, role: input.user.role, tenantId: input.tenantId }
}

export async function getActiveTenantContextWithPermissionOrThrow(
    permission: Permission,
    input?: { requireRole?: TenantMembershipRole }
) {
    const ctx = await getActiveTenantContextOrThrow(input)
    requireTenantPermission(ctx, permission)
    return { ...ctx, viewer: toTenantViewer(ctx) }
}

export async function requireCaseAccess(
    caseId: string,
    user: { id: string; role: Role; tenantId: string },
    permission: Permission = "case:view"
) {
    requirePermission(user.role, permission)

    const tenantId = getTenantId(user)

    if (user.role === "PARTNER" || user.role === "ADMIN") {
        const inTenant = await prisma.case.findFirst({
            where: { id: caseId, tenantId, deletedAt: null },
            select: { id: true },
        })
        if (!inTenant) {
            throw new PermissionError("无案件访问权限")
        }
        return
    }

    const accessible = await prisma.case.findFirst({
        where: {
            AND: [{ id: caseId }, buildCaseVisibilityWhere({ userId: user.id, role: user.role, tenantId })],
        },
        select: { id: true },
    })

    if (!accessible) {
        throw new PermissionError("无案件访问权限")
    }
}

export async function requireProjectAccess(
    projectId: string,
    user: { id: string; role: Role; tenantId: string },
    permission: Permission = "task:view"
) {
    requirePermission(user.role, permission)

    const tenantId = getTenantId(user)

    if (user.role === "PARTNER" || user.role === "ADMIN") {
        const inTenant = await prisma.project.findFirst({
            where: { id: projectId, tenantId, deletedAt: null },
            select: { id: true },
        })
        if (!inTenant) {
            throw new PermissionError("无项目访问权限")
        }
        return
    }

    const accessible = await prisma.project.findFirst({
        where: {
            id: projectId,
            tenantId,
            deletedAt: null,
            OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
        },
        select: { id: true },
    })

    if (!accessible) {
        throw new PermissionError("无项目访问权限")
    }
}

export function getCaseListAccessWhereOrNull(
    user: { id: string; role: Role; tenantId: string },
    permission: Permission = "case:view"
): Prisma.CaseWhereInput | null {
    if (!hasPermission(user.role, permission)) return null
    const tenantId = getTenantId(user)
    return buildCaseVisibilityWhere({ userId: user.id, role: user.role, tenantId })
}

export function getProjectListAccessWhereOrNull(
    user: { id: string; role: Role; tenantId: string },
    permission: Permission = "task:view"
): Prisma.ProjectWhereInput | null {
    if (!hasPermission(user.role, permission)) return null
    const tenantId = getTenantId(user)

    if (user.role === "PARTNER" || user.role === "ADMIN") {
        return { tenantId, deletedAt: null }
    }

    return {
        tenantId,
        deletedAt: null,
        OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
    }
}

export function getCaseListAccessWhereOrThrow(
    user: { id: string; role: Role; tenantId: string },
    permission: Permission = "case:view"
): Prisma.CaseWhereInput {
    requirePermission(user.role, permission)
    const where = getCaseListAccessWhereOrNull(user, permission)
    if (!where) {
        throw new PermissionError(`缺少权限：${permission}`)
    }
    return where
}

export function getProjectListAccessWhereOrThrow(
    user: { id: string; role: Role; tenantId: string },
    permission: Permission = "task:view"
): Prisma.ProjectWhereInput {
    requirePermission(user.role, permission)
    const where = getProjectListAccessWhereOrNull(user, permission)
    if (!where) {
        throw new PermissionError(`缺少权限：${permission}`)
    }
    return where
}

export function getTenantId(input?: unknown) {
    const activeTenantIdValue =
        input && typeof input === "object"
            ? (input as { activeTenantId?: unknown }).activeTenantId
            : undefined
    const fromActive = typeof activeTenantIdValue === "string" ? activeTenantIdValue.trim() : ""
    if (fromActive) return fromActive

    const tenantIdValue =
        input && typeof input === "object"
            ? (input as { tenantId?: unknown }).tenantId
            : undefined
    const fromUser = typeof tenantIdValue === "string" ? tenantIdValue.trim() : ""
    if (fromUser) return fromUser
    const fromEnv = (process.env.LAWCLICK_TENANT_ID || "").trim()
    if (fromEnv) return fromEnv
    return DEFAULT_TENANT_ID
}

async function ensureActiveTenantMembership(user: User): Promise<User> {
    const desiredTenantId = getTenantId(user)

    const currentMembership = await prisma.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId: desiredTenantId, userId: user.id } },
        select: { tenantId: true, status: true },
    })

    if (currentMembership?.status === TenantMembershipStatus.ACTIVE) {
        return user
    }

    const fallbackTenantId = (user.tenantId || "").trim()
    if (fallbackTenantId && fallbackTenantId !== desiredTenantId) {
        const fallbackMembership = await prisma.tenantMembership.findUnique({
            where: { tenantId_userId: { tenantId: fallbackTenantId, userId: user.id } },
            select: { status: true },
        })
        if (fallbackMembership?.status === TenantMembershipStatus.ACTIVE) {
            return prisma.user.update({
                where: { id: user.id },
                data: { activeTenantId: fallbackTenantId },
            })
        }
    }

    const firstActive = await prisma.tenantMembership.findFirst({
        where: { userId: user.id, status: TenantMembershipStatus.ACTIVE },
        orderBy: { createdAt: "asc" },
        select: { tenantId: true },
    })

    if (firstActive) {
        return prisma.user.update({
            where: { id: user.id },
            data: { activeTenantId: firstActive.tenantId },
        })
    }

    const anyMembership = await prisma.tenantMembership.findFirst({
        where: { userId: user.id },
        select: { id: true },
    })
    if (anyMembership) {
        throw new AuthError("成员状态不可用")
    }

    // 一次性自愈迁移（幂等）：仅当该用户完全缺失 TenantMembership 记录时，才允许从旧单租户字段迁移。
    // 注意：严禁把新用户/未知用户“直落库进 default-tenant”。
    const tenantId = fallbackTenantId
    if (!tenantId || tenantId === DEFAULT_TENANT_ID) {
        throw new AuthError("未分配可用租户")
    }

    const existingTenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, firmId: true },
    })

    const firmId = existingTenant?.firmId || tenantId
    const existingFirm = await prisma.firm.findUnique({ where: { id: firmId }, select: { name: true } })

    const tenantName = existingTenant?.name || tenantId
    const firmName = existingFirm?.name || existingTenant?.name || tenantId

    await prisma.firm.upsert({
        where: { id: firmId },
        update: {},
        create: { id: firmId, name: firmName },
    })
    await prisma.tenant.upsert({
        where: { id: tenantId },
        update: {},
        create: { id: tenantId, firmId, name: tenantName },
    })

    const role: TenantMembershipRole =
        user.role === "PARTNER"
            ? TenantMembershipRole.OWNER
            : user.role === "ADMIN"
              ? TenantMembershipRole.ADMIN
              : user.role === "CLIENT"
                ? TenantMembershipRole.VIEWER
                : TenantMembershipRole.MEMBER

    try {
        await prisma.tenantMembership.create({
            data: {
                id: `tm:${tenantId}:${user.id}`,
                tenantId,
                userId: user.id,
                role,
                status: TenantMembershipStatus.ACTIVE,
            },
        })
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            // 并发/竞态下的幂等保护：若唯一约束命中，说明记录已存在，继续后续流程即可。
        } else {
            throw error
        }
    }

    await prisma.firmMembership.upsert({
        where: { firmId_userId: { firmId, userId: user.id } },
        update: { role },
        create: {
            id: `fm:${firmId}:${user.id}`,
            firmId,
            userId: user.id,
            role,
            status: TenantMembershipStatus.ACTIVE,
        },
    })

    return prisma.user.update({
        where: { id: user.id },
        data: { activeTenantId: tenantId },
    })
}
