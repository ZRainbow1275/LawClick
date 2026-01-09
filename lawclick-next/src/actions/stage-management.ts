"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { getActiveTenantContextWithPermissionOrThrow, requireCaseAccess } from "@/lib/server-auth"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { TenantSignalKind, type Prisma } from "@prisma/client"
import { z } from "zod"
import { buildCaseVisibilityWhere } from "@/lib/case-visibility"
import type { ActionResponse } from "@/lib/action-response"
import { touchTenantSignal } from "@/lib/realtime/tenant-signal"
import { logger } from "@/lib/logger"
import {
    LitigationStages,
    LitigationStage,
    LITIGATION_STAGE_ORDER,
    LITIGATION_STAGE_CONFIGS,
    getStageConfig,
    getStageIndex,
    getNextStage,
    isLastStage
} from "@/lib/litigation-stages"
import {
    NonLitigationStages,
    NonLitigationStage,
    NON_LITIGATION_STAGE_ORDER,
    NON_LITIGATION_STAGE_CONFIGS,
    getNonLitigationStageConfig,
    getNonLitigationStageIndex,
} from "@/lib/non-litigation-stages"
import { OptionalNonEmptyString, UuidSchema } from "@/lib/zod"

// ==============================================================================
// Types
// ==============================================================================

export interface StageProgressInfo {
    currentStage: string | null
    stageIndex: number
    totalStages: number
    serviceType: 'LITIGATION' | 'NON_LITIGATION'
    stages: Array<{
        stage: string
        name: string
        description: string
        icon: string
        color: string
        isCompleted: boolean
        isCurrent: boolean
        documentsTotal: number
        documentsCompleted: number
        tasksTotal: number
        tasksCompleted: number
    }>
}

// ==============================================================================
// 获取案件阶段进度
// ==============================================================================

type TaskPriorityValue = "P0_URGENT" | "P1_HIGH" | "P2_MEDIUM" | "P3_LOW"

const TaskPriorityValues = new Set<TaskPriorityValue>(["P0_URGENT", "P1_HIGH", "P2_MEDIUM", "P3_LOW"])

const TemplateDocSchema = z
    .object({
        docType: z.string().trim().min(1).max(200),
        name: z.string().trim().min(1).max(200),
        isRequired: z.boolean().optional(),
    })
    .strict()

const TemplateTaskObjectSchema = z
    .object({
        title: z.string().trim().min(1).max(200),
        stage: z.string().optional(),
        priority: z.string().optional(),
    })
    .strict()

const TemplateTaskItemSchema = z.union([z.string().trim().min(1).max(200), TemplateTaskObjectSchema])

const TemplateStageSchema = z
    .object({
        stage: z.string().trim().min(1).max(200),
        requiredDocs: z.unknown().optional(),
        defaultTasks: z.unknown().optional(),
    })
    .strict()

function parseArrayItems<T>(schema: z.ZodType<T>, value: unknown, meta: Record<string, unknown>): T[] {
    if (!Array.isArray(value)) return []
    const out: T[] = []
    value.forEach((item, index) => {
        const parsed = schema.safeParse(item)
        if (parsed.success) {
            out.push(parsed.data)
            return
        }
        logger.warn("case template parse failed", { ...meta, index, issues: parsed.error.flatten() })
    })
    return out
}

function normalizePriority(value: unknown): TaskPriorityValue {
    const cleaned = typeof value === "string" ? value.trim() : ""
    if (cleaned && TaskPriorityValues.has(cleaned as TaskPriorityValue)) {
        return cleaned as TaskPriorityValue
    }
    return "P2_MEDIUM"
}

function extractTemplateDocs(
    template: { id: string; stages: unknown; requiredDocs: unknown },
    fallbackStage: string | null
) {
    const docs: Array<{ stage: string | null; documentType: string; title: string; isRequired: boolean }> = []

    const stages = parseArrayItems(TemplateStageSchema, template.stages, { templateId: template.id, field: "stages" })
    for (const stage of stages) {
        const requiredDocs = parseArrayItems(TemplateDocSchema, stage.requiredDocs, {
            templateId: template.id,
            field: `stages.${stage.stage}.requiredDocs`,
        })
        for (const doc of requiredDocs) {
            docs.push({
                stage: stage.stage,
                documentType: doc.docType,
                title: doc.name,
                isRequired: doc.isRequired ?? true,
            })
        }
    }

    if (!docs.length) {
        const requiredDocs = parseArrayItems(TemplateDocSchema, template.requiredDocs, {
            templateId: template.id,
            field: "requiredDocs",
        })
        for (const doc of requiredDocs) {
            docs.push({
                stage: fallbackStage,
                documentType: doc.docType,
                title: doc.name,
                isRequired: doc.isRequired ?? true,
            })
        }
    }

    return docs
}

function extractTemplateTasks(
    template: { id: string; stages: unknown; defaultTasks: unknown },
    fallbackStage: string | null
) {
    const tasks: Array<{ stage: string | null; title: string; priority: TaskPriorityValue }> = []

    const stages = parseArrayItems(TemplateStageSchema, template.stages, { templateId: template.id, field: "stages" })
    for (const stage of stages) {
        const stageTasks = parseArrayItems(TemplateTaskItemSchema, stage.defaultTasks, {
            templateId: template.id,
            field: `stages.${stage.stage}.defaultTasks`,
        })
        for (const item of stageTasks) {
            if (typeof item === "string") {
                tasks.push({ stage: stage.stage, title: item, priority: "P2_MEDIUM" })
                continue
            }
            const stageValue = typeof item.stage === "string" && item.stage.trim() ? item.stage.trim() : stage.stage
            tasks.push({
                stage: stageValue,
                title: item.title,
                priority: normalizePriority(item.priority),
            })
        }
    }

    if (!tasks.length) {
        const rootTasks = parseArrayItems(TemplateTaskItemSchema, template.defaultTasks, {
            templateId: template.id,
            field: "defaultTasks",
        })
        for (const item of rootTasks) {
            if (typeof item === "string") {
                tasks.push({ stage: fallbackStage, title: item, priority: "P2_MEDIUM" })
                continue
            }
            const stageValue =
                typeof item.stage === "string" && item.stage.trim() ? item.stage.trim() : fallbackStage
            tasks.push({
                stage: stageValue,
                title: item.title,
                priority: normalizePriority(item.priority),
            })
        }
    }

    return tasks
}

export async function getCaseStageProgress(caseId: string): Promise<StageProgressInfo | null> {
    try {
        const parsedId = UuidSchema.safeParse(caseId)
        if (!parsedId.success) {
            logger.warn("getCaseStageProgress input validation failed", { issues: parsedId.error.flatten() })
            return null
        }
        caseId = parsedId.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("case:view")
        const rate = await enforceRateLimit({ ctx, action: "case.stage.progress.get", limit: 240, extraKey: caseId })
        if (!rate.allowed) {
            return null
        }
        const { tenantId, viewer } = ctx
        await requireCaseAccess(caseId, viewer, "case:view")

        const caseItem = await prisma.case.findFirst({
            where: { id: caseId, tenantId },
            include: {
                documents: {
                    select: { id: true, stage: true, isCompleted: true }
                },
                tasks: {
                    where: { tenantId },
                    select: { id: true, stage: true, status: true }
                }
            }
        })

        if (!caseItem) return null

        // 根据案件类型选择阶段配置
        const isLitigation = caseItem.serviceType === 'LITIGATION' || caseItem.serviceType === 'ARBITRATION'

        if (isLitigation) {
            const currentStage = (caseItem.currentStage as LitigationStage) || LitigationStages.INTAKE_CONSULTATION
            const currentIndex = getStageIndex(currentStage)

            const stages = LITIGATION_STAGE_ORDER.map((stage, index) => {
                const config = getStageConfig(stage)!
                const stageDocuments = caseItem.documents.filter(d => d.stage === stage)
                const stageTasks = caseItem.tasks.filter(t => t.stage === stage)

                return {
                    stage,
                    name: config.name,
                    description: config.description,
                    icon: config.icon,
                    color: config.color,
                    isCompleted: index + 1 < currentIndex,
                    isCurrent: stage === currentStage,
                    documentsTotal: stageDocuments.length,
                    documentsCompleted: stageDocuments.filter(d => d.isCompleted).length,
                    tasksTotal: stageTasks.length,
                    tasksCompleted: stageTasks.filter(t => t.status === 'DONE').length,
                }
            })

            return {
                currentStage,
                stageIndex: currentIndex,
                totalStages: LITIGATION_STAGE_ORDER.length,
                serviceType: 'LITIGATION',
                stages
            }
        } else {
            // 非诉案件
            const currentStage = (caseItem.currentStage as NonLitigationStage) || NonLitigationStages.DUE_DILIGENCE
            const currentIndex = getNonLitigationStageIndex(currentStage)

            const stages = NON_LITIGATION_STAGE_ORDER.map((stage, index) => {
                const config = getNonLitigationStageConfig(stage)!
                const stageDocuments = caseItem.documents.filter(d => d.stage === stage)
                const stageTasks = caseItem.tasks.filter(t => t.stage === stage)

                return {
                    stage,
                    name: config.name,
                    description: config.description,
                    icon: config.icon,
                    color: config.color,
                    isCompleted: index + 1 < currentIndex,
                    isCurrent: stage === currentStage,
                    documentsTotal: stageDocuments.length,
                    documentsCompleted: stageDocuments.filter(d => d.isCompleted).length,
                    tasksTotal: stageTasks.length,
                    tasksCompleted: stageTasks.filter(t => t.status === 'DONE').length,
                }
            })

            return {
                currentStage,
                stageIndex: currentIndex,
                totalStages: NON_LITIGATION_STAGE_ORDER.length,
                serviceType: 'NON_LITIGATION',
                stages
            }
        }
    } catch (error) {
        logger.error("get case stage progress failed", error)
        return null
    }
}

// ==============================================================================
// 推进案件到下一阶段
// ==============================================================================

export async function advanceCaseStage(caseId: string): Promise<ActionResponse<{ newStage: LitigationStage }>> {
    try {
        const parsedId = UuidSchema.safeParse(caseId)
        if (!parsedId.success) {
            return { success: false, error: "输入校验失败" }
        }
        caseId = parsedId.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("case:edit")
        const rate = await enforceRateLimit({ ctx, action: "case.stage.advance", limit: 60, extraKey: caseId })
        if (!rate.allowed) {
            return { success: false, error: rate.error }
        }
        const { tenantId, viewer } = ctx
        await requireCaseAccess(caseId, viewer, "case:edit")

        const caseItem = await prisma.case.findFirst({
            where: { id: caseId, tenantId }
        })

        if (!caseItem) {
            return { success: false, error: '案件不存在' }
        }

        const currentStage = (caseItem.currentStage as LitigationStage) || LitigationStages.INTAKE_CONSULTATION

        if (isLastStage(currentStage)) {
            return { success: false, error: '已是最后阶段' }
        }

        const nextStage = getNextStage(currentStage)
        if (!nextStage) {
            return { success: false, error: '无法获取下一阶段' }
        }

        // 更新案件阶段（tenant-scope）
        const updated = await prisma.case.updateMany({
            where: { id: caseId, tenantId },
            data: { currentStage: nextStage },
        })
        if (updated.count === 0) {
            return { success: false, error: "案件不存在" }
        }

        revalidatePath(`/cases/${caseId}`)

        return { success: true, newStage: nextStage }
    } catch (error) {
        logger.error("advance stage failed", error)
        return { success: false, error: '推进阶段失败' }
    }
}

// ==============================================================================
// 获取指定阶段的文书清单
// ==============================================================================

export async function getStageDocuments(caseId: string, stage?: string) {
    try {
        const parsed = z
            .object({ caseId: UuidSchema, stage: OptionalNonEmptyString(64) })
            .strict()
            .safeParse({ caseId, stage })
        if (!parsed.success) {
            return {
                success: false as const,
                error: parsed.error.issues[0]?.message || "输入校验失败",
                data: [] as const,
            }
        }
        caseId = parsed.data.caseId
        stage = parsed.data.stage

        const ctx = await getActiveTenantContextWithPermissionOrThrow("case:view")
        const rate = await enforceRateLimit({
            ctx,
            action: "case.stage.documents.list",
            limit: 600,
            extraKey: `${caseId}:${stage ?? "all"}`,
        })
        if (!rate.allowed) {
            return { success: false as const, error: rate.error, data: [] as const }
        }
        await requireCaseAccess(caseId, ctx.viewer, "case:view")
        const documents = await prisma.document.findMany({
            where: {
                caseId,
                ...(stage ? { stage } : {})
            },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                title: true,
                fileUrl: true,
                fileType: true,
                fileSize: true,
                stage: true,
                documentType: true,
                isRequired: true,
                isCompleted: true,
                tags: true,
                notes: true,
            },
            take: 500,
        })

        return { success: true as const, data: documents }
    } catch (error) {
        logger.error("get stage documents failed", error)
        return { success: false as const, error: "获取阶段文书失败", data: [] as const }
    }
}

// ==============================================================================
// 初始化阶段文书模板
// ==============================================================================

export async function initializeStageDocuments(
    caseId: string
): Promise<ActionResponse<{ created: number }, { created: number }>> {
    try {
        const parsedId = UuidSchema.safeParse(caseId)
        if (!parsedId.success) {
            return { success: false, created: 0, error: "输入校验失败" }
        }
        caseId = parsedId.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("case:edit")
        const rate = await enforceRateLimit({ ctx, action: "case.stage.documents.initialize", limit: 30, extraKey: caseId })
        if (!rate.allowed) {
            return { success: false, created: 0, error: rate.error }
        }
        const { tenantId, viewer } = ctx
        await requireCaseAccess(caseId, viewer, "case:edit")

        const caseItem = await prisma.case.findFirst({
            where: { id: caseId, tenantId },
            include: {
                documents: true,
                template: { select: { id: true, stages: true, requiredDocs: true, defaultTasks: true } },
            }
        })

        if (!caseItem) {
            return { success: false, created: 0, error: '案件不存在' }
        }

        const existingTypes = new Set(
            caseItem.documents
                .map((d) => (typeof d.documentType === "string" ? d.documentType.trim() : ""))
                .filter((v) => v.length > 0)
        )

        const fallbackStage =
            caseItem.currentStage ||
            (caseItem.serviceType === "NON_LITIGATION"
                ? NonLitigationStages.DUE_DILIGENCE
                : caseItem.serviceType === "LITIGATION" || caseItem.serviceType === "ARBITRATION"
                    ? LitigationStages.INTAKE_CONSULTATION
                    : null)

        const templateDocs =
            caseItem.templateId && caseItem.template
                ? extractTemplateDocs(
                      {
                          id: caseItem.template.id,
                          stages: caseItem.template.stages,
                          requiredDocs: caseItem.template.requiredDocs,
                      },
                      fallbackStage
                  )
                : []

        const documentsToCreate: Prisma.DocumentCreateManyInput[] = []

        if (templateDocs.length > 0) {
            for (const doc of templateDocs) {
                if (existingTypes.has(doc.documentType)) continue

                documentsToCreate.push({
                    caseId,
                    title: doc.title,
                    fileUrl: null,
                    fileType: null,
                    stage: doc.stage,
                    documentType: doc.documentType,
                    isRequired: doc.isRequired,
                    isCompleted: false,
                })
            }
        } else if (caseItem.serviceType === "LITIGATION" || caseItem.serviceType === "ARBITRATION") {
            for (const stageConfig of LITIGATION_STAGE_CONFIGS) {
                for (const docConfig of stageConfig.documents) {
                    if (existingTypes.has(docConfig.type)) continue

                    documentsToCreate.push({
                        caseId,
                        title: docConfig.name,
                        fileUrl: null,
                        fileType: null,
                        stage: stageConfig.stage,
                        documentType: docConfig.type,
                        isRequired: docConfig.isRequired,
                        isCompleted: false,
                    })
                }
            }
        } else if (caseItem.serviceType === "NON_LITIGATION") {
            for (const stageConfig of NON_LITIGATION_STAGE_CONFIGS) {
                for (const docConfig of stageConfig.documents) {
                    if (existingTypes.has(docConfig.type)) continue

                    documentsToCreate.push({
                        caseId,
                        title: docConfig.name,
                        fileUrl: null,
                        fileType: null,
                        stage: stageConfig.stage,
                        documentType: docConfig.type,
                        isRequired: docConfig.isRequired,
                        isCompleted: false,
                    })
                }
            }
        } else {
            return { success: false, created: 0, error: "当前案件类型不支持阶段文书初始化" }
        }

        if (documentsToCreate.length > 0) {
            await prisma.document.createMany({
                data: documentsToCreate
            })
        }

        revalidatePath(`/cases/${caseId}`)

        return { success: true, created: documentsToCreate.length }
    } catch (error) {
        logger.error("initialize stage documents failed", error)
        return { success: false, created: 0, error: '初始化失败' }
    }
}

// ==============================================================================
// 标记文书完成
// ==============================================================================

export async function completeDocument(documentId: string, isCompleted: boolean): Promise<ActionResponse> {
    try {
        const parsed = z
            .object({ documentId: UuidSchema, isCompleted: z.boolean() })
            .strict()
            .safeParse({ documentId, isCompleted })
        if (!parsed.success) {
            return { success: false, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }
        documentId = parsed.data.documentId
        isCompleted = parsed.data.isCompleted

        const ctx = await getActiveTenantContextWithPermissionOrThrow("case:edit")
        const rate = await enforceRateLimit({ ctx, action: "case.stage.documents.complete", limit: 120, extraKey: documentId })
        if (!rate.allowed) {
            return { success: false, error: rate.error }
        }

        const accessWhere = buildCaseVisibilityWhere({
            userId: ctx.viewer.id,
            role: ctx.viewer.role,
            tenantId: ctx.tenantId,
        })

        const existing = await prisma.document.findFirst({
            where: { id: documentId, case: accessWhere },
            select: { caseId: true },
        })
        if (!existing) {
            return { success: false, error: "文书不存在或无权限" }
        }

        const updated = await prisma.document.updateMany({
            where: { id: documentId, case: accessWhere },
            data: { isCompleted },
        })
        if (updated.count === 0) {
            return { success: false, error: "文书不存在或无权限" }
        }

        revalidatePath(`/cases/${existing.caseId}`)

        return { success: true }
    } catch (error) {
        logger.error("update document completion state failed", error)
        return { success: false, error: '更新失败' }
    }
}

// ==============================================================================
// 初始化阶段默认任务
// ==============================================================================

export async function initializeStageTasks(caseId: string): Promise<ActionResponse<{ created: number }, { created: number }>> {
    try {
        const parsedId = UuidSchema.safeParse(caseId)
        if (!parsedId.success) {
            return { success: false, created: 0, error: "输入校验失败" }
        }
        caseId = parsedId.data

        const ctx = await getActiveTenantContextWithPermissionOrThrow("case:edit")
        const rate = await enforceRateLimit({ ctx, action: "case.stage.tasks.initialize", limit: 30, extraKey: caseId })
        if (!rate.allowed) {
            return { success: false, created: 0, error: rate.error }
        }
        const { tenantId, viewer } = ctx
        await requireCaseAccess(caseId, viewer, "case:edit")

        const caseItem = await prisma.case.findFirst({
            where: { id: caseId, tenantId },
            include: {
                tasks: true,
                template: { select: { id: true, stages: true, requiredDocs: true, defaultTasks: true } },
            }
        })

        if (!caseItem) {
            return { success: false, created: 0, error: '案件不存在' }
        }

        const existingKeys = new Set(
            caseItem.tasks.map((t) => `${typeof t.stage === "string" ? t.stage : ""}::${t.title}`)
        )

        const fallbackStage =
            caseItem.currentStage ||
            (caseItem.serviceType === "NON_LITIGATION"
                ? NonLitigationStages.DUE_DILIGENCE
                : caseItem.serviceType === "LITIGATION" || caseItem.serviceType === "ARBITRATION"
                    ? LitigationStages.INTAKE_CONSULTATION
                    : null)

        const templateTasks =
            caseItem.templateId && caseItem.template
                ? extractTemplateTasks(
                      {
                          id: caseItem.template.id,
                          stages: caseItem.template.stages,
                          defaultTasks: caseItem.template.defaultTasks,
                      },
                      fallbackStage
                  )
                : []

        const tasksToCreate: Prisma.TaskCreateManyInput[] = []
        let order = caseItem.tasks.length

        if (templateTasks.length > 0) {
            for (const task of templateTasks) {
                const key = `${task.stage ?? ""}::${task.title}`
                if (existingKeys.has(key)) continue

                tasksToCreate.push({
                    tenantId,
                    caseId,
                    title: task.title,
                    stage: task.stage,
                    status: "TODO",
                    priority: task.priority,
                    order: order++,
                })
            }
        } else if (caseItem.serviceType === "LITIGATION" || caseItem.serviceType === "ARBITRATION") {
            for (const stageConfig of LITIGATION_STAGE_CONFIGS) {
                for (const taskTitle of stageConfig.defaultTasks) {
                    const key = `${stageConfig.stage}::${taskTitle}`
                    if (existingKeys.has(key)) continue

                    tasksToCreate.push({
                        tenantId,
                        caseId,
                        title: taskTitle,
                        stage: stageConfig.stage,
                        status: "TODO",
                        priority: "P2_MEDIUM",
                        order: order++,
                    })
                }
            }
        } else if (caseItem.serviceType === "NON_LITIGATION") {
            for (const stageConfig of NON_LITIGATION_STAGE_CONFIGS) {
                for (const taskTitle of stageConfig.defaultTasks) {
                    const key = `${stageConfig.stage}::${taskTitle}`
                    if (existingKeys.has(key)) continue

                    tasksToCreate.push({
                        tenantId,
                        caseId,
                        title: taskTitle,
                        stage: stageConfig.stage,
                        status: "TODO",
                        priority: "P2_MEDIUM",
                        order: order++,
                    })
                }
            }
        } else {
            return { success: false, created: 0, error: "当前案件类型不支持阶段任务初始化" }
        }

        if (tasksToCreate.length > 0) {
            await prisma.task.createMany({
                data: tasksToCreate
            })

            try {
                await touchTenantSignal({
                    tenantId,
                    kind: TenantSignalKind.TASKS_CHANGED,
                    payload: {
                        action: "bulk_created",
                        taskCount: tasksToCreate.length,
                        caseId,
                        projectId: null,
                    } satisfies Prisma.InputJsonValue,
                })
            } catch (error) {
                logger.error("touch tenant signal failed", error)
            }
        }

        revalidatePath(`/cases/${caseId}`)

        return { success: true, created: tasksToCreate.length }
    } catch (error) {
        logger.error("initialize stage tasks failed", error)
        return { success: false, created: 0, error: '初始化失败' }
    }
}
