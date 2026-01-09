"use server"

import type { Prisma } from "@prisma/client"
import { ProjectRole, ProjectStatus, ProjectType } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { getActiveTenantContextOrThrow, getProjectListAccessWhereOrThrow, requireProjectAccess, requireTenantPermission } from "@/lib/server-auth"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { ensureUsersInTenant } from "@/lib/tenant-guards"
import { PROJECTS_TAKE_DEFAULT, PROJECTS_TAKE_MAX } from "@/lib/query-limits"
import { NullableNonEmptyString, OptionalNonEmptyString, PositiveInt, UuidSchema } from "@/lib/zod"

const PROJECT_LIST_SELECT = {
    id: true,
    projectCode: true,
    title: true,
    description: true,
    status: true,
    type: true,
    updatedAt: true,
    owner: { select: { id: true, name: true, email: true, avatarUrl: true } },
    _count: { select: { members: true, tasks: true } },
    members: {
        take: 3,
        orderBy: { joinedAt: "asc" },
        select: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    },
} as const satisfies Prisma.ProjectSelect

export type ProjectListItem = Prisma.ProjectGetPayload<{ select: typeof PROJECT_LIST_SELECT }> & {
    openTasksCount: number
}

const PROJECT_TYPE_CODE_MAP: Record<ProjectType, string> = {
    ADMIN: "AD",
    HR: "HR",
    MARKETING: "MK",
    IT: "IT",
    BUSINESS: "BZ",
    OTHER: "OT",
}

async function generateProjectCode(tenantId: string, type: ProjectType, tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getFullYear()
    const typeCode = PROJECT_TYPE_CODE_MAP[type] || "OT"
    const prefix = `PRJ-${year}-${typeCode}`

    const last = await tx.project.findFirst({
        where: { tenantId, projectCode: { startsWith: prefix } },
        orderBy: { projectCode: "desc" },
        select: { projectCode: true },
    })

    let nextNum = 1
    if (last?.projectCode) {
        const parts = last.projectCode.split("-")
        const lastNum = Number.parseInt(parts[3] || "0", 10)
        if (Number.isFinite(lastNum) && lastNum > 0) nextNum = lastNum + 1
    }

    return `${prefix}-${String(nextNum).padStart(3, "0")}`
}

const CreateProjectSchema = z
    .object({
        title: OptionalNonEmptyString(200),
        description: NullableNonEmptyString(10_000),
        type: z.nativeEnum(ProjectType).optional(),
        status: z.nativeEnum(ProjectStatus).optional(),
        memberIds: z.array(UuidSchema).max(50).optional(),
    })
    .strict()

export async function createProject(input: unknown) {
    try {
        const parsed = CreateProjectSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:create")
        const rate = await enforceRateLimit({ ctx, action: "projects.create", limit: 120 })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { user, tenantId } = ctx

        const payload = parsed.data
        const result = await prisma.$transaction(async (tx) => {
            const projectCode = await generateProjectCode(tenantId, payload.type || "OTHER", tx)
            const project = await tx.project.create({
                data: {
                    tenantId,
                    projectCode,
                    title: payload.title || "未命名项目",
                    description: payload.description ?? null,
                    type: payload.type || "OTHER",
                    status: payload.status || "ACTIVE",
                    ownerId: user.id,
                },
                select: { id: true, projectCode: true, title: true },
            })

            await tx.projectMember.create({
                data: { projectId: project.id, userId: user.id, role: ProjectRole.OWNER },
            })

            const memberIds = (payload.memberIds || []).filter((id) => id !== user.id)
            if (memberIds.length) {
                const membersOk = await ensureUsersInTenant({ tenantId, userIds: memberIds, db: tx })
                if (!membersOk) {
                    throw new Error("项目成员不存在或不在当前租户")
                }
                await tx.projectMember.createMany({
                    data: memberIds.map((userId) => ({ projectId: project.id, userId, role: ProjectRole.MEMBER })),
                    skipDuplicates: true,
                })
            }

            return project
        })

        revalidatePath("/projects")
        return { success: true as const, error: null, data: result }
    } catch (error) {
        logger.error("创建项目失败", error)
        return { success: false as const, error: getPublicActionErrorMessage(error, "创建项目失败，请稍后重试") }
    }
}

const ListProjectsSchema = z
    .object({
        query: z.string().trim().min(1).max(200).optional(),
        status: z.nativeEnum(ProjectStatus).optional(),
        type: z.nativeEnum(ProjectType).optional(),
        take: z.number().int().min(1).max(200).optional(),
    })
    .strict()

export async function getProjects(input?: unknown) {
    try {
        const parsed = ListProjectsSchema.safeParse(input ?? {})
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败", data: [] as const }
        }

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:view")
        const rate = await enforceRateLimit({ ctx, action: "projects.list", limit: 600 })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [] as const }
        }
        const { user, tenantId } = ctx

        const accessWhere = getProjectListAccessWhereOrThrow(user, "task:view")
        const where: Prisma.ProjectWhereInput = { ...accessWhere }

        if (parsed.data.query) {
            where.OR = [
                { title: { contains: parsed.data.query, mode: "insensitive" } },
                { projectCode: { contains: parsed.data.query, mode: "insensitive" } },
            ]
        }
        if (parsed.data.status) where.status = parsed.data.status
        if (parsed.data.type) where.type = parsed.data.type

        const projects = await prisma.project.findMany({
            where,
            orderBy: { updatedAt: "desc" },
            take: parsed.data.take || 50,
            select: PROJECT_LIST_SELECT,
        })

        const ids = projects.map((p) => p.id)
        const openTaskAgg = ids.length
            ? await prisma.task.groupBy({
                  by: ["projectId"],
                  where: { tenantId, projectId: { in: ids }, status: { not: "DONE" } },
                  _count: { _all: true },
              })
            : []
        const openByProject = new Map(openTaskAgg.map((r) => [r.projectId, r._count._all]))

        const data: ProjectListItem[] = projects.map((p) => ({
            ...p,
            openTasksCount: openByProject.get(p.id) || 0,
        }))

        return { success: true as const, error: null, data }
    } catch (error) {
        logger.error("获取项目列表失败", error)
        return { success: false as const, error: "获取项目列表失败", data: [] as const }
    }
}

const ListProjectsListPageSchema = z
    .object({
        query: z.string().trim().min(1).max(200).optional(),
        status: z.nativeEnum(ProjectStatus).optional(),
        type: z.nativeEnum(ProjectType).optional(),
        page: z.number().int().min(0).optional(),
        take: PositiveInt().max(PROJECTS_TAKE_MAX).optional(),
    })
    .strict()
    .optional()

export async function getProjectsListPage(input?: unknown) {
    const parsed = ListProjectsListPageSchema.safeParse(input)
    if (!parsed.success) {
        return {
            success: false as const,
            error: parsed.error.issues[0]?.message || "输入校验失败",
            data: [] as const,
            total: 0,
            page: 0,
            take: PROJECTS_TAKE_DEFAULT,
            hasMore: false,
        }
    }
    const params = parsed.data

    try {
        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:view")
        const rate = await enforceRateLimit({ ctx, action: "projects.listPage", limit: 600 })
        if (!rate.allowed) {
            return {
                success: false as const,
                error: rate.error,
                data: [] as const,
                total: 0,
                page: 0,
                take: PROJECTS_TAKE_DEFAULT,
                hasMore: false,
            }
        }
        const { user, tenantId } = ctx

        const accessWhere = getProjectListAccessWhereOrThrow(user, "task:view")
        const where: Prisma.ProjectWhereInput = { ...accessWhere }

        const search = (params?.query || "").trim()
        if (search) {
            where.OR = [
                { title: { contains: search, mode: "insensitive" } },
                { projectCode: { contains: search, mode: "insensitive" } },
            ]
        }
        if (params?.status) where.status = params.status
        if (params?.type) where.type = params.type

        const take = Math.max(10, Math.min(PROJECTS_TAKE_MAX, params?.take ?? PROJECTS_TAKE_DEFAULT))
        const page = Math.max(0, params?.page ?? 0)
        const skip = page * take

        const [total, projects] = await prisma.$transaction([
            prisma.project.count({ where }),
            prisma.project.findMany({ where, orderBy: { updatedAt: "desc" }, take, skip, select: PROJECT_LIST_SELECT }),
        ])

        const ids = projects.map((p) => p.id)
        const openTaskAgg = ids.length
            ? await prisma.task.groupBy({
                  by: ["projectId"],
                  where: { tenantId, projectId: { in: ids }, status: { not: "DONE" } },
                  _count: { _all: true },
              })
            : []
        const openByProject = new Map(openTaskAgg.map((r) => [r.projectId, r._count._all]))

        const data: ProjectListItem[] = projects.map((p) => ({
            ...p,
            openTasksCount: openByProject.get(p.id) || 0,
        }))

        const hasMore = skip + projects.length < total
        return { success: true as const, error: null, data, total, page, take, hasMore }
    } catch (error) {
        logger.error("获取项目列表失败", error)
        return {
            success: false as const,
            error: getPublicActionErrorMessage(error, "获取项目列表失败，请稍后重试"),
            data: [] as const,
            total: 0,
            page: 0,
            take: PROJECTS_TAKE_DEFAULT,
            hasMore: false,
        }
    }
}

export async function getProjectDetails(projectId: string) {
    try {
        const parsedId = UuidSchema.safeParse(projectId)
        if (!parsedId.success) {
            return { success: false as const, error: "输入校验失败", data: null }
        }
        projectId = parsedId.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:view")
        const rate = await enforceRateLimit({ ctx, action: "projects.get", limit: 600, extraKey: projectId })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: null }
        }
        const { user, tenantId } = ctx
        await requireProjectAccess(projectId, user, "task:view")

        const project = await prisma.project.findFirst({
            where: { id: projectId, tenantId, deletedAt: null },
            select: {
                id: true,
                projectCode: true,
                title: true,
                description: true,
                status: true,
                type: true,
                ownerId: true,
                updatedAt: true,
                owner: { select: { id: true, name: true, email: true, avatarUrl: true } },
                members: {
                    orderBy: { joinedAt: "asc" },
                    select: { id: true, role: true, user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
                },
            },
        })

        if (!project) return { success: false as const, error: "项目不存在", data: null }
        return { success: true as const, error: null, data: project }
    } catch (error) {
        logger.error("获取项目详情失败", error)
        return { success: false as const, error: "获取项目详情失败", data: null }
    }
}

const UpdateProjectSchema = z
    .object({
        projectId: UuidSchema,
        title: OptionalNonEmptyString(200),
        description: NullableNonEmptyString(10_000),
        status: z.nativeEnum(ProjectStatus).optional(),
        type: z.nativeEnum(ProjectType).optional(),
    })
    .strict()

export async function updateProject(input: unknown) {
    try {
        const parsed = UpdateProjectSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        const payload = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:edit")
        const rate = await enforceRateLimit({ ctx, action: "projects.update", limit: 120, extraKey: payload.projectId })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { user, tenantId } = ctx

        const existing = await prisma.project.findFirst({
            where: { id: payload.projectId, tenantId },
            select: { id: true, ownerId: true, deletedAt: true },
        })
        if (!existing) return { success: false as const, error: "项目不存在" }
        if (existing.deletedAt) return { success: false as const, error: "项目已删除" }

        await requireProjectAccess(payload.projectId, user, "task:edit")

        const isPrivileged = user.role === "PARTNER" || user.role === "ADMIN"
        if (!isPrivileged && existing.ownerId !== user.id) {
            return { success: false as const, error: "只有项目负责人或管理员可以编辑项目" }
        }

        const data: Prisma.ProjectUpdateManyMutationInput = {}
        if (typeof payload.title !== "undefined") data.title = payload.title
        if (typeof payload.description !== "undefined") data.description = payload.description ?? null
        if (typeof payload.status !== "undefined") data.status = payload.status
        if (typeof payload.type !== "undefined") data.type = payload.type

        if (Object.keys(data).length === 0) {
            return { success: false as const, error: "没有可更新字段" }
        }

        const updated = await prisma.project.updateMany({
            where: { id: payload.projectId, tenantId, deletedAt: null },
            data,
        })
        if (updated.count === 0) {
            return { success: false as const, error: "项目不存在或已删除" }
        }

        revalidatePath("/projects")
        revalidatePath(`/projects/${payload.projectId}`)
        revalidatePath("/tasks")
        return { success: true as const }
    } catch (error) {
        logger.error("更新项目失败", error)
        return { success: false as const, error: "更新项目失败" }
    }
}

export async function deleteProject(projectId: string) {
    try {
        const parsed = UuidSchema.safeParse(projectId)
        if (!parsed.success) {
            return { success: false as const, error: "输入校验失败" }
        }
        projectId = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:edit")
        const rate = await enforceRateLimit({ ctx, action: "projects.delete", limit: 60, extraKey: projectId })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { user, tenantId } = ctx

        const existing = await prisma.project.findFirst({
            where: { id: projectId, tenantId },
            select: { id: true, ownerId: true, deletedAt: true },
        })
        if (!existing) return { success: false as const, error: "项目不存在" }
        if (existing.deletedAt) return { success: true as const }

        const isPrivileged = user.role === "PARTNER" || user.role === "ADMIN"
        if (!isPrivileged && existing.ownerId !== user.id) {
            return { success: false as const, error: "只有项目负责人或管理员可以删除项目" }
        }

        const deleted = await prisma.project.updateMany({
            where: { id: projectId, tenantId, deletedAt: null },
            data: {
                deletedAt: new Date(),
                deletedById: user.id,
                status: ProjectStatus.ARCHIVED,
            },
        })
        if (deleted.count === 0) {
            return { success: false as const, error: "项目不存在或已删除" }
        }

        revalidatePath("/projects")
        revalidatePath(`/projects/${projectId}`)
        revalidatePath("/tasks")
        return { success: true as const }
    } catch (error) {
        logger.error("删除项目失败", error, { projectId })
        return { success: false as const, error: "删除项目失败" }
    }
}

const AddProjectMemberSchema = z
    .object({
        projectId: UuidSchema,
        email: z.string().trim().email(),
        role: z.nativeEnum(ProjectRole).optional(),
    })
    .strict()

export async function addProjectMember(input: unknown) {
    try {
        const parsed = AddProjectMemberSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:edit")
        const rate = await enforceRateLimit({
            ctx,
            action: "projects.members.add",
            limit: 120,
            extraKey: `${parsed.data.projectId}:${parsed.data.email}`,
        })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { user, tenantId } = ctx

        await requireProjectAccess(parsed.data.projectId, user, "task:edit")

        const project = await prisma.project.findFirst({
            where: { id: parsed.data.projectId, tenantId },
            select: { id: true, ownerId: true },
        })
        if (!project) return { success: false as const, error: "项目不存在" }

        const isPrivileged = user.role === "PARTNER" || user.role === "ADMIN"
        if (!isPrivileged && project.ownerId !== user.id) {
            return { success: false as const, error: "只有项目负责人或管理员可以添加成员" }
        }

        const member = await prisma.tenantMembership.findFirst({
            where: {
                tenantId,
                status: "ACTIVE",
                user: { email: { equals: parsed.data.email, mode: "insensitive" } },
            },
            select: { userId: true },
        })
        if (!member) return { success: false as const, error: "未找到该邮箱对应的用户（或不属于该租户）" }

        await prisma.projectMember.upsert({
            where: { projectId_userId: { projectId: parsed.data.projectId, userId: member.userId } },
            update: { role: parsed.data.role || ProjectRole.MEMBER },
            create: {
                projectId: parsed.data.projectId,
                userId: member.userId,
                role: parsed.data.role || ProjectRole.MEMBER,
            },
        })

        revalidatePath(`/projects/${parsed.data.projectId}`)
        return { success: true as const }
    } catch (error) {
        logger.error("添加项目成员失败", error)
        return { success: false as const, error: "添加项目成员失败" }
    }
}

export async function removeProjectMember(projectId: string, userId: string) {
    try {
        const parsed = z.object({ projectId: UuidSchema, userId: UuidSchema }).strict().safeParse({ projectId, userId })
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        projectId = parsed.data.projectId
        userId = parsed.data.userId

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "task:edit")
        const rate = await enforceRateLimit({ ctx, action: "projects.members.remove", limit: 120, extraKey: `${projectId}:${userId}` })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { user, tenantId } = ctx
        await requireProjectAccess(projectId, user, "task:edit")

        const project = await prisma.project.findFirst({ where: { id: projectId, tenantId }, select: { ownerId: true } })
        if (!project) return { success: false as const, error: "项目不存在" }

        const isPrivileged = user.role === "PARTNER" || user.role === "ADMIN"
        if (!isPrivileged && project.ownerId !== user.id && userId !== user.id) {
            return { success: false as const, error: "没有权限移除成员" }
        }

        if (userId === project.ownerId) {
            return { success: false as const, error: "不允许移除项目负责人" }
        }

        await prisma.projectMember.deleteMany({ where: { projectId, userId } })

        revalidatePath(`/projects/${projectId}`)
        return { success: true as const }
    } catch (error) {
        logger.error("移除项目成员失败", error)
        return { success: false as const, error: "移除项目成员失败" }
    }
}
