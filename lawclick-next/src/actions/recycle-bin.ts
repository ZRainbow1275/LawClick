"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import type { CaseStatus, ContractStatus, CustomerGrade, CustomerStage, ProjectStatus, ProjectType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getActiveTenantContextOrThrow, requireTenantPermission } from "@/lib/server-auth"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { logger } from "@/lib/logger"
import { UuidSchema } from "@/lib/zod"

export type RecycleBinCaseItem = {
    id: string
    caseCode: string
    title: string
    status: CaseStatus
    deletedAt: string
    deletedBy: { id: string; name: string | null } | null
}

export type RecycleBinProjectItem = {
    id: string
    projectCode: string
    title: string
    status: ProjectStatus
    type: ProjectType
    deletedAt: string
    deletedBy: { id: string; name: string | null } | null
}

export type RecycleBinContractItem = {
    id: string
    contractNo: string
    title: string
    status: ContractStatus
    deletedAt: string
    deletedBy: { id: string; name: string | null } | null
    case: { id: string; title: string; caseCode: string } | null
}

export type RecycleBinContactItem = {
    id: string
    name: string
    type: string
    stage: CustomerStage
    grade: CustomerGrade
    deletedAt: string
    deletedBy: { id: string; name: string | null } | null
}

export type RecycleBinSnapshot = {
    cases: RecycleBinCaseItem[]
    projects: RecycleBinProjectItem[]
    contracts: RecycleBinContractItem[]
    contacts: RecycleBinContactItem[]
}

const RestoreRecycleBinItemSchema = z
    .object({
        type: z.enum(["case", "project", "contract", "contact"]),
        id: UuidSchema,
    })
    .strict()

function toIso(value: Date) {
    return value.toISOString()
}

export async function getRecycleBinSnapshot() {
    const empty: RecycleBinSnapshot = { cases: [], projects: [], contracts: [], contacts: [] }

    try {
        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "admin:settings")
        const rate = await enforceRateLimit({ ctx, action: "recycleBin.snapshot.get", limit: 120 })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: empty }
        }
        const { tenantId } = ctx

        const [cases, projects, contracts, contacts] = await Promise.all([
            prisma.case.findMany({
                where: { tenantId, deletedAt: { not: null } },
                orderBy: { deletedAt: "desc" },
                take: 200,
                select: {
                    id: true,
                    caseCode: true,
                    title: true,
                    status: true,
                    deletedAt: true,
                    deletedBy: { select: { id: true, name: true } },
                },
            }),
            prisma.project.findMany({
                where: { tenantId, deletedAt: { not: null } },
                orderBy: { deletedAt: "desc" },
                take: 200,
                select: {
                    id: true,
                    projectCode: true,
                    title: true,
                    status: true,
                    type: true,
                    deletedAt: true,
                    deletedBy: { select: { id: true, name: true } },
                },
            }),
            prisma.contract.findMany({
                where: { tenantId, deletedAt: { not: null } },
                orderBy: { deletedAt: "desc" },
                take: 200,
                select: {
                    id: true,
                    contractNo: true,
                    title: true,
                    status: true,
                    deletedAt: true,
                    deletedBy: { select: { id: true, name: true } },
                    case: { select: { id: true, title: true, caseCode: true } },
                },
            }),
            prisma.contact.findMany({
                where: { tenantId, deletedAt: { not: null } },
                orderBy: { deletedAt: "desc" },
                take: 200,
                select: {
                    id: true,
                    name: true,
                    type: true,
                    stage: true,
                    grade: true,
                    deletedAt: true,
                    deletedBy: { select: { id: true, name: true } },
                },
            }),
        ])

        return {
            success: true as const,
            data: {
                cases: cases
                    .filter((c): c is typeof c & { deletedAt: Date } => c.deletedAt instanceof Date)
                    .map((c) => ({
                        id: c.id,
                        caseCode: c.caseCode,
                        title: c.title,
                        status: c.status,
                        deletedAt: toIso(c.deletedAt),
                        deletedBy: c.deletedBy ? { id: c.deletedBy.id, name: c.deletedBy.name ?? null } : null,
                    })),
                projects: projects
                    .filter((p): p is typeof p & { deletedAt: Date } => p.deletedAt instanceof Date)
                    .map((p) => ({
                        id: p.id,
                        projectCode: p.projectCode,
                        title: p.title,
                        status: p.status,
                        type: p.type,
                        deletedAt: toIso(p.deletedAt),
                        deletedBy: p.deletedBy ? { id: p.deletedBy.id, name: p.deletedBy.name ?? null } : null,
                    })),
                contracts: contracts
                    .filter((c): c is typeof c & { deletedAt: Date } => c.deletedAt instanceof Date)
                    .map((c) => ({
                        id: c.id,
                        contractNo: c.contractNo,
                        title: c.title,
                        status: c.status,
                        deletedAt: toIso(c.deletedAt),
                        deletedBy: c.deletedBy ? { id: c.deletedBy.id, name: c.deletedBy.name ?? null } : null,
                        case: c.case?.caseCode ? { id: c.case.id, title: c.case.title, caseCode: c.case.caseCode } : null,
                    })),
                contacts: contacts
                    .filter((c): c is typeof c & { deletedAt: Date } => c.deletedAt instanceof Date)
                    .map((c) => ({
                        id: c.id,
                        name: c.name,
                        type: c.type,
                        stage: c.stage,
                        grade: c.grade,
                        deletedAt: toIso(c.deletedAt),
                        deletedBy: c.deletedBy ? { id: c.deletedBy.id, name: c.deletedBy.name ?? null } : null,
                    })),
            } satisfies RecycleBinSnapshot,
        }
    } catch (error) {
        logger.error("获取回收站失败", error)
        return { success: false as const, error: "获取回收站失败", data: empty }
    }
}

export async function restoreRecycleBinItem(input: unknown) {
    try {
        const parsed = RestoreRecycleBinItemSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false as const, error: "输入校验失败" }
        }
        const request = parsed.data

        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "admin:settings")
        const rate = await enforceRateLimit({ ctx, action: "recycleBin.restore", limit: 60, extraKey: request.id })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error }
        }
        const { tenantId, user } = ctx

        let updated = 0
        if (request.type === "case") {
            const res = await prisma.case.updateMany({
                where: { id: request.id, tenantId, deletedAt: { not: null } },
                data: { deletedAt: null, deletedById: null },
            })
            updated = res.count
            if (updated) {
                revalidatePath("/cases")
                revalidatePath("/tasks")
                revalidatePath("/dashboard")
                revalidatePath("/dispatch")
            }
        }

        if (request.type === "project") {
            const res = await prisma.project.updateMany({
                where: { id: request.id, tenantId, deletedAt: { not: null } },
                data: { deletedAt: null, deletedById: null },
            })
            updated = res.count
            if (updated) {
                revalidatePath("/projects")
                revalidatePath("/tasks")
                revalidatePath("/dashboard")
            }
        }

        if (request.type === "contract") {
            const res = await prisma.contract.updateMany({
                where: { id: request.id, tenantId, deletedAt: { not: null } },
                data: { deletedAt: null, deletedById: null },
            })
            updated = res.count
            if (updated) {
                revalidatePath("/admin/finance")
                revalidatePath("/cases")
                revalidatePath("/dashboard")
            }
        }

        if (request.type === "contact") {
            const res = await prisma.contact.updateMany({
                where: { id: request.id, tenantId, deletedAt: { not: null } },
                data: { deletedAt: null, deletedById: null },
            })
            updated = res.count
            if (updated) {
                revalidatePath("/crm/customers")
                revalidatePath("/cases")
                revalidatePath("/dashboard")
            }
        }

        if (!updated) {
            return { success: false as const, error: "记录不存在或未处于已删除状态" }
        }

        logger.info("回收站已恢复", { type: request.type, id: request.id, tenantId, actorId: user.id })
        return { success: true as const }
    } catch (error) {
        logger.error("恢复回收站记录失败", error)
        return { success: false as const, error: "恢复失败" }
    }
}
