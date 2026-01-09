"use server"

import { prisma } from "@/lib/prisma"
import { PartyType, PartyRelation, type Party } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { getActiveTenantContextWithPermissionOrThrow, requireCaseAccess } from "@/lib/server-auth"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { z } from "zod"
import type { ActionResponse } from "@/lib/action-response"
import { NullableNonEmptyString, OptionalNonEmptyString, UuidSchema } from "@/lib/zod"
import { logger } from "@/lib/logger"

// ==============================================================================
// Types
// ==============================================================================

const PartyInputSchema = z
    .object({
        caseId: UuidSchema,
        name: z.string().trim().min(1, "当事人名称不能为空").max(200),
        type: z.nativeEnum(PartyType),
        relation: z.nativeEnum(PartyRelation),
        entityType: z.enum(["INDIVIDUAL", "COMPANY"]).optional(),
        idType: NullableNonEmptyString(50),
        idNumber: NullableNonEmptyString(120),
        phone: NullableNonEmptyString(50),
        email: z.string().trim().email("邮箱格式不正确").optional(),
        address: NullableNonEmptyString(500),
        attorney: NullableNonEmptyString(200),
        attorneyPhone: NullableNonEmptyString(50),
        notes: OptionalNonEmptyString(5000),
    })
    .strict()

export type PartyInput = z.infer<typeof PartyInputSchema>

const UpdatePartyInputSchema = PartyInputSchema.omit({ caseId: true })
    .partial()
    .strict()
    .refine((v) => Object.values(v).some((value) => value !== undefined), { message: "没有需要更新的字段" })

export type UpdatePartyInput = z.infer<typeof UpdatePartyInputSchema>

// ==============================================================================
// 获取案件当事人列表
// ==============================================================================

export async function getCaseParties(caseId: string): Promise<ActionResponse<{ data: Party[] }, { data: Party[] }>> {
    try {
        const parsedId = UuidSchema.safeParse(caseId)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败", data: [] }
        }
        caseId = parsedId.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("case:view")
        const rate = await enforceRateLimit({ ctx, action: "case.parties.list", limit: 600, extraKey: caseId })
        if (!rate.allowed) {
            return { success: false, error: rate.error, data: [] }
        }
        await requireCaseAccess(caseId, ctx.viewer, "case:view")

        const parties = await prisma.party.findMany({
            where: { caseId },
            orderBy: [
                { relation: 'asc' }, // CLIENT优先
                { type: 'asc' },
                { name: 'asc' }
            ],
            take: 200,
        })

        return { success: true, data: parties }
    } catch (error) {
        logger.error("获取当事人失败", error)
        return { success: false, error: '获取当事人失败', data: [] }
    }
}

// ==============================================================================
// 添加当事人
// ==============================================================================

export async function addParty(input: PartyInput): Promise<ActionResponse<{ data: Party }>> {
    try {
        const parsed = PartyInputSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        input = parsed.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("case:edit")
        const rate = await enforceRateLimit({ ctx, action: "case.parties.create", limit: 120, extraKey: input.caseId })
        if (!rate.allowed) {
            return { success: false, error: rate.error }
        }
        await requireCaseAccess(input.caseId, ctx.viewer, "case:edit")

        const party = await prisma.party.create({
            data: {
                caseId: input.caseId,
                name: input.name,
                type: input.type,
                relation: input.relation,
                entityType: input.entityType,
                idType: input.idType,
                idNumber: input.idNumber,
                phone: input.phone,
                email: input.email,
                address: input.address,
                attorney: input.attorney,
                attorneyPhone: input.attorneyPhone,
                notes: input.notes,
            }
        })

        revalidatePath(`/cases/${input.caseId}`)
        return { success: true, data: party }
    } catch (error) {
        logger.error("添加当事人失败", error)
        return { success: false, error: '添加当事人失败' }
    }
}

// ==============================================================================
// 更新当事人
// ==============================================================================

export async function updateParty(id: string, input: UpdatePartyInput): Promise<ActionResponse<{ data: Party }>> {
    try {
        const parsed = z
            .object({ id: UuidSchema, input: UpdatePartyInputSchema })
            .strict()
            .safeParse({ id, input })
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        id = parsed.data.id
        input = parsed.data.input

        const ctx = await getActiveTenantContextWithPermissionOrThrow("case:edit")
        const rate = await enforceRateLimit({ ctx, action: "case.parties.update", limit: 120, extraKey: id })
        if (!rate.allowed) {
            return { success: false, error: rate.error }
        }

        const existing = await prisma.party.findFirst({ where: { id, case: { tenantId: ctx.tenantId } } })
        if (!existing) {
            return { success: false, error: '当事人不存在' }
        }

        await requireCaseAccess(existing.caseId, ctx.viewer, "case:edit")

        const party = await prisma.party.update({
            where: { id },
            data: {
                name: input.name,
                type: input.type,
                relation: input.relation,
                entityType: input.entityType,
                idType: input.idType,
                idNumber: input.idNumber,
                phone: input.phone,
                email: input.email,
                address: input.address,
                attorney: input.attorney,
                attorneyPhone: input.attorneyPhone,
                notes: input.notes,
            }
        })

        revalidatePath(`/cases/${existing.caseId}`)
        return { success: true, data: party }
    } catch (error) {
        logger.error("更新当事人失败", error)
        return { success: false, error: '更新当事人失败' }
    }
}

// ==============================================================================
// 删除当事人
// ==============================================================================

export async function deleteParty(id: string): Promise<ActionResponse> {
    try {
        const parsedId = UuidSchema.safeParse(id)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败" }
        }
        id = parsedId.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("case:edit")
        const rate = await enforceRateLimit({ ctx, action: "case.parties.delete", limit: 120, extraKey: id })
        if (!rate.allowed) {
            return { success: false, error: rate.error }
        }

        const existing = await prisma.party.findFirst({ where: { id, case: { tenantId: ctx.tenantId } } })
        if (!existing) {
            return { success: false, error: '当事人不存在' }
        }

        await requireCaseAccess(existing.caseId, ctx.viewer, "case:edit")

        await prisma.party.delete({ where: { id } })

        revalidatePath(`/cases/${existing.caseId}`)
        return { success: true }
    } catch (error) {
        logger.error("删除当事人失败", error)
        return { success: false, error: '删除当事人失败' }
    }
}

// ==============================================================================
// 获取当事人详情
// ==============================================================================

export async function getPartyById(id: string): Promise<ActionResponse<{ data: Party }>> {
    try {
        const parsedId = UuidSchema.safeParse(id)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败" }
        }
        id = parsedId.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("case:view")
        const rate = await enforceRateLimit({ ctx, action: "case.parties.get", limit: 600, extraKey: id })
        if (!rate.allowed) {
            return { success: false, error: rate.error }
        }

        const party = await prisma.party.findFirst({ where: { id, case: { tenantId: ctx.tenantId } } })
        if (!party) {
            return { success: false, error: '当事人不存在' }
        }

        await requireCaseAccess(party.caseId, ctx.viewer, "case:view")

        return { success: true, data: party }
    } catch (error) {
        logger.error("获取当事人详情失败", error)
        return { success: false, error: '获取当事人详情失败' }
    }
}

// 当事人类型/关系的显示文案已迁移到 `src/lib/party-labels.ts`（避免 Next.js 16 对 "use server" 文件的导出限制）
