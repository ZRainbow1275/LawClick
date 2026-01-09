import "server-only"

import type { Prisma } from "@prisma/client"
import { BillingMode, ChatThreadType, ServiceType } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { NonNegativeNumber, OptionalNonEmptyString, UuidSchema } from "@/lib/zod"
import type { ActionResponse } from "@/lib/action-response"

// ==============================================================================
// Types
// ==============================================================================

export interface CreateCaseInput {
    // 基本信息
    title: string
    serviceType: ServiceType
    billingMode: BillingMode
    description?: string
    contractValue?: number

    // 客户信息
    clientId?: string // 现有客户ID
    newClient?: {
        // 或新建客户
        name: string
        type: "COMPANY" | "INDIVIDUAL"
        email?: string
        phone?: string
        industry?: string
    }
    opposingParties?: string[] // 对方当事人名称（用于冲突检查）

    // 团队配置
    originatorId?: string // 案源律师
    handlerId: string // 承办律师
    memberIds?: string[] // 其他成员

    // 模板配置
    templateId?: string // 使用的模板
}

export interface UpdateCaseInput {
    title?: string
    description?: string | null
    billingMode?: BillingMode
    contractValue?: number | null
    handlerId?: string | null
    originatorId?: string | null
    templateId?: string | null
    currentStage?: string | null
}

export type CreateCaseConflictCheck = {
    hasConflict: boolean
    details: Array<{
        entityType: string
        entityId: string
        entityName: string
        reason: string
    }>
}

export type CreateCaseResult = ActionResponse<{
    caseId: string
    caseCode: string
    conflictCheck: CreateCaseConflictCheck
}>

// ==============================================================================
// Input Schemas
// ==============================================================================

const NewClientSchema = z
    .object({
        name: z.string().trim().min(1, "客户名称不能为空").max(200),
        type: z.enum(["COMPANY", "INDIVIDUAL"]),
        email: z.string().trim().email("邮箱格式不正确").optional(),
        phone: OptionalNonEmptyString(50),
        industry: OptionalNonEmptyString(200),
    })
    .strict()

export const CreateCaseInputSchema = z
    .object({
        title: z.string().trim().min(1, "案件标题不能为空").max(200),
        serviceType: z.nativeEnum(ServiceType),
        billingMode: z.nativeEnum(BillingMode),
        description: OptionalNonEmptyString(10_000),
        contractValue: NonNegativeNumber().optional(),
        clientId: UuidSchema.optional(),
        newClient: NewClientSchema.optional(),
        opposingParties: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
        originatorId: UuidSchema.optional(),
        handlerId: UuidSchema,
        memberIds: z.array(UuidSchema).max(200).optional(),
        templateId: OptionalNonEmptyString(200),
    })
    .strict()
    .refine((v) => Boolean(v.clientId) !== Boolean(v.newClient), {
        message: "必须且只能指定一个：clientId 或 newClient",
    })

// ==============================================================================
// 案号生成
// ==============================================================================

const SERVICE_TYPE_CODE_MAP: Record<ServiceType, string> = {
    LITIGATION: "LT",
    NON_LITIGATION: "NL",
    ADVISORY: "AD",
    ARBITRATION: "AR",
}

export async function generateCaseCode(
    tenantId: string,
    serviceType: ServiceType,
    tx: Prisma.TransactionClient
): Promise<string> {
    const year = new Date().getFullYear()
    const typeCode = SERVICE_TYPE_CODE_MAP[serviceType]
    const prefix = `LC-${year}-${typeCode}`

    // 查询当年该类型最后一个案号
    const lastCase = await tx.case.findFirst({
        where: {
            tenantId,
            caseCode: { startsWith: prefix },
        },
        orderBy: { caseCode: "desc" },
    })

    let nextNum = 1
    if (lastCase) {
        const parts = lastCase.caseCode.split("-")
        const lastNum = parseInt(parts[3] || "0")
        nextNum = lastNum + 1
    }

    return `${prefix}-${String(nextNum).padStart(3, "0")}`
}

// ==============================================================================
// 利益冲突检查
// ==============================================================================

export async function checkConflict(
    tenantId: string,
    clientId: string,
    opposingParties: string[] | undefined,
    tx: Prisma.TransactionClient
): Promise<CreateCaseConflictCheck> {
    const conflicts: CreateCaseConflictCheck["details"] = []
    if (opposingParties && opposingParties.length > 0) {
        // 检查对方当事人是否为现有客户
        for (const partyName of opposingParties) {
            const existingClient = await tx.contact.findFirst({
                where: {
                    tenantId,
                    name: { contains: partyName, mode: "insensitive" },
                },
            })

            if (existingClient) {
                // 检查该客户是否有在办案件
                const activeCases = await tx.case.findMany({
                    where: {
                        tenantId,
                        clientId: existingClient.id,
                        status: { in: ["INTAKE", "ACTIVE"] },
                    },
                    take: 1,
                })

                if (activeCases.length > 0) {
                    conflicts.push({
                        entityType: "CLIENT",
                        entityId: existingClient.id,
                        entityName: existingClient.name,
                        reason: `对方当事人"${partyName}"是本所现有客户，存在利益冲突风险`,
                    })
                }
            }
        }
    }

    return {
        hasConflict: conflicts.length > 0,
        details: conflicts,
    }
}

// ==============================================================================
// 案件团队/群聊一致性（用于 handler 变更后同步）
// ==============================================================================

export async function syncCaseHandlerMembershipAndChat(input: {
    caseId: string
    caseCode: string
    handlerId: string
    actorId: string
    tenantId: string
}) {
    const { caseId, caseCode, handlerId, actorId, tenantId } = input

    await prisma.caseMember.upsert({
        where: { caseId_userId: { caseId, userId: handlerId } },
        create: { caseId, userId: handlerId, role: "HANDLER" },
        update: { role: "HANDLER" },
    })

    await prisma.caseMember.updateMany({
        where: { caseId, role: "HANDLER", userId: { not: handlerId } },
        data: { role: "MEMBER" },
    })

    const thread = await prisma.chatThread.upsert({
        where: { tenantId_key: { tenantId, key: `CASE:${caseId}` } },
        update: { title: `案件群聊｜${caseCode}`, caseId, tenantId },
        create: {
            tenantId,
            key: `CASE:${caseId}`,
            type: ChatThreadType.CASE,
            title: `案件群聊｜${caseCode}`,
            caseId,
            createdById: actorId,
        },
        select: { id: true },
    })

    await prisma.chatParticipant.upsert({
        where: { threadId_userId: { threadId: thread.id, userId: handlerId } },
        update: {},
        create: { threadId: thread.id, userId: handlerId },
    })
}
