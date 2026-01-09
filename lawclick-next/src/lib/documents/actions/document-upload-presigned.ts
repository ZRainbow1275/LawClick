import "server-only"

import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"

import { UploadIntentStatus } from "@prisma/client"
import { z } from "zod"

import { enforceActionRateLimit } from "@/lib/action-rate-limit"
import { logger } from "@/lib/logger"
import { prisma } from "@/lib/prisma"
import { getStorageProvider } from "@/lib/s3"
import { getActiveTenantContextOrThrow, requireCaseAccess, requireTenantPermission } from "@/lib/server-auth"
import { buildObjectKey, buildUploadKeyPrefix } from "@/lib/document-upload-keys"
import { NullableNonEmptyString, UuidSchema } from "@/lib/zod"
import {
    ALLOWED_UPLOAD_MIME_TYPES,
    MAX_UPLOAD_BYTES,
    createUploadIntentOrThrow,
    getPrismaErrorCode,
    headObjectWithRetry,
    normalizeContentType,
    resolveUploadMimeTypeFromMeta,
} from "@/lib/documents/actions/document-upload-utils"

const InitPresignedUploadInputSchema = z
    .object({
        caseId: UuidSchema.nullable(),
        documentId: UuidSchema.nullable(),
        title: NullableNonEmptyString(200),
        category: NullableNonEmptyString(64),
        notes: NullableNonEmptyString(20_000),
        filename: z.string().trim().min(1).max(256),
        fileSize: z.number().int().positive(),
        contentType: z.string().trim().min(1).max(128).nullable().optional(),
    })
    .strict()
    .refine((v) => v.documentId || v.caseId, { message: "必须选择关联案件或指定文档" })

const FinalizePresignedUploadInputSchema = z
    .object({
        intentId: UuidSchema.nullable().optional(),
        caseId: UuidSchema.nullable(),
        documentId: UuidSchema,
        expectedVersion: z.number().int().min(1).max(10_000),
        key: z.string().trim().min(1).max(1024),
        filename: z.string().trim().min(1).max(256),
        expectedFileSize: z.number().int().positive().max(MAX_UPLOAD_BYTES).optional(),
        expectedContentType: z.string().trim().min(1).max(128).nullable().optional(),
        title: NullableNonEmptyString(200),
        category: NullableNonEmptyString(64),
        notes: NullableNonEmptyString(20_000),
    })
    .strict()

const PRESIGNED_UPLOAD_EXPIRES_SECONDS = 10 * 60

export async function initPresignedDocumentUploadImpl(input: {
    caseId: string | null
    documentId: string | null
    title: string | null
    category: string | null
    notes: string | null
    filename: string
    fileSize: number
    contentType?: string | null
}) {
    try {
        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "document:upload")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "documents.upload.presign.init",
            limit: 60,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false as const, error: rate.error }

        const parsed = InitPresignedUploadInputSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }

        const { caseId, documentId, title, category, notes, filename, fileSize } = parsed.data

        const expiresAt = new Date(Date.now() + PRESIGNED_UPLOAD_EXPIRES_SECONDS * 1000)

        if (fileSize <= 0) {
            return { success: false as const, error: "文件为空" }
        }
        if (fileSize > MAX_UPLOAD_BYTES) {
            return {
                success: false as const,
                error: `文件过大（最大 ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB）`,
            }
        }

        const mime = resolveUploadMimeTypeFromMeta({ filename, contentType: parsed.data.contentType || null })
        if (!mime.ok) {
            return { success: false as const, error: mime.error }
        }
        const storage = getStorageProvider()

        if (documentId) {
            const existing = await prisma.document.findFirst({
                where: { id: documentId, case: { tenantId } },
                select: { id: true, caseId: true, title: true, version: true, fileUrl: true },
            })
            if (!existing) {
                return { success: false as const, error: "文档不存在" }
            }

            await requireCaseAccess(existing.caseId, user, "case:view")

            const isFirstUpload = !existing.fileUrl
            const nextVersion = isFirstUpload ? 1 : existing.version + 1
            const key = buildObjectKey({
                caseId: existing.caseId,
                documentId: existing.id,
                version: nextVersion,
                filename: filename || title || existing.title,
            })

            const signed = await storage.presignPutObject({
                key,
                contentType: mime.mime,
                expiresInSeconds: PRESIGNED_UPLOAD_EXPIRES_SECONDS,
            })

            const intent = await createUploadIntentOrThrow({
                tenantId,
                kind: "DOCUMENT",
                createdById: user.id,
                caseId: existing.caseId,
                documentId: existing.id,
                key,
                filename,
                contentType: mime.mime,
                expectedFileSize: fileSize,
                expectedVersion: nextVersion,
                status: UploadIntentStatus.INITIATED,
                expiresAt,
                result: {
                    ...(title ? { title } : {}),
                    ...(category ? { category } : {}),
                    ...(notes ? { notes } : {}),
                },
            })

            return {
                success: true as const,
                upload: {
                    intentId: intent.id,
                    uploadUrl: signed.url,
                    key,
                    caseId: existing.caseId,
                    documentId: existing.id,
                    expectedVersion: nextVersion,
                    expectedFileSize: fileSize,
                    expectedContentType: mime.mime,
                    title,
                    category,
                    notes,
                    filename,
                },
            }
        }

        if (!caseId) {
            return { success: false as const, error: "必须选择关联案件" }
        }
        await requireCaseAccess(caseId, user, "case:view")

        const newDocumentId = randomUUID()
        const version = 1
        const key = buildObjectKey({
            caseId,
            documentId: newDocumentId,
            version,
            filename: filename || title || "document",
        })

        const signed = await storage.presignPutObject({
            key,
            contentType: mime.mime,
            expiresInSeconds: PRESIGNED_UPLOAD_EXPIRES_SECONDS,
        })

        const intent = await createUploadIntentOrThrow({
            tenantId,
            kind: "DOCUMENT",
            createdById: user.id,
            caseId,
            documentId: newDocumentId,
            key,
            filename,
            contentType: mime.mime,
            expectedFileSize: fileSize,
            expectedVersion: version,
            status: UploadIntentStatus.INITIATED,
            expiresAt,
            result: {
                ...(title ? { title } : {}),
                ...(category ? { category } : {}),
                ...(notes ? { notes } : {}),
            },
        })

        return {
            success: true as const,
            upload: {
                intentId: intent.id,
                uploadUrl: signed.url,
                key,
                caseId,
                documentId: newDocumentId,
                expectedVersion: version,
                expectedFileSize: fileSize,
                expectedContentType: mime.mime,
                title,
                category,
                notes,
                filename,
            },
        }
    } catch (error) {
        logger.error("Init Presigned Upload Failed", error)
        return { success: false as const, error: "初始化上传失败" }
    }
}

export async function finalizePresignedDocumentUploadImpl(input: {
    intentId?: string | null
    caseId: string | null
    documentId: string
    expectedVersion: number
    key: string
    filename: string
    expectedFileSize?: number
    expectedContentType?: string | null
    title: string | null
    category: string | null
    notes: string | null
}) {
    try {
        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "document:upload")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "documents.upload.presign.finalize",
            limit: 60,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false as const, error: rate.error }

        const parsed = FinalizePresignedUploadInputSchema.safeParse(input)
        if (!parsed.success) {
            return { success: false as const, error: parsed.error.issues[0]?.message || "输入校验失败" }
        }

        const { documentId, expectedVersion, key, filename, title, category, notes } = parsed.data
        const intentId = (parsed.data.intentId || "").trim() || null
        const expectedFileSize = parsed.data.expectedFileSize
        const expectedContentType = normalizeContentType(parsed.data.expectedContentType || null)

        const intent = intentId
            ? await prisma.uploadIntent.findFirst({
                  where: { id: intentId, tenantId },
                  select: { id: true, tenantId: true, key: true, caseId: true, documentId: true, expectedVersion: true, status: true },
              })
            : await prisma.uploadIntent.findFirst({
                  where: { key, tenantId },
                  select: { id: true, tenantId: true, key: true, caseId: true, documentId: true, expectedVersion: true, status: true },
              })

        if (intentId && !intent) {
            return { success: false as const, error: "上传会话不存在或已失效，请重新初始化上传" }
        }

        if (intent && (intent.key !== key || intent.documentId !== documentId || intent.expectedVersion !== expectedVersion)) {
            await prisma.uploadIntent.updateMany({
                where: { id: intent.id, tenantId, status: { not: UploadIntentStatus.FINALIZED } },
                data: {
                    status: UploadIntentStatus.FAILED,
                    lastError: "上传会话校验失败（key/document/version 不匹配）",
                    result: {
                        error: "UPLOAD_INTENT_MISMATCH",
                        message: "上传会话校验失败（key/document/version 不匹配）",
                        failedAt: new Date().toISOString(),
                    },
                },
            })
            return { success: false as const, error: "上传会话校验失败，请重新初始化上传" }
        }

        const recordIntentFailure = async (message: string) => {
            if (!intent) return
            await prisma.uploadIntent.updateMany({
                where: { id: intent.id, tenantId, status: { not: UploadIntentStatus.FINALIZED } },
                data: {
                    status: UploadIntentStatus.FAILED,
                    lastError: message,
                    result: {
                        ...(title ? { title } : {}),
                        ...(category ? { category } : {}),
                        ...(notes ? { notes } : {}),
                        error: message,
                        failedAt: new Date().toISOString(),
                    },
                },
            })
        }

        const storage = getStorageProvider()
        const object = await headObjectWithRetry(storage, key)
        if (!object) {
            if (intent) {
                await prisma.uploadIntent.updateMany({
                    where: { id: intent.id, tenantId, status: { not: UploadIntentStatus.FINALIZED } },
                    data: { lastError: "文件不存在或尚未上传完成" },
                })
            }
            return { success: false as const, error: "文件不存在或尚未上传完成" }
        }

        const fileSize = object.contentLength
        if (fileSize <= 0) {
            await recordIntentFailure("文件为空")
            return { success: false as const, error: "文件为空" }
        }
        if (fileSize > MAX_UPLOAD_BYTES) {
            const message = `文件过大（最大 ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB）`
            await recordIntentFailure(message)
            return { success: false as const, error: message }
        }
        if (typeof expectedFileSize === "number" && expectedFileSize > 0 && fileSize !== expectedFileSize) {
            await recordIntentFailure("文件大小不匹配，请重新上传")
            return { success: false as const, error: "文件大小不匹配，请重新上传" }
        }

        const storedType = normalizeContentType(object.contentType || null) || expectedContentType
        if (!storedType || !ALLOWED_UPLOAD_MIME_TYPES.has(storedType)) {
            await recordIntentFailure("不支持的文件类型（仅支持 PDF/DOC/DOCX/TXT）")
            return { success: false as const, error: "不支持的文件类型（仅支持 PDF/DOC/DOCX/TXT）" }
        }

        const tryMarkIntentFinalized = async (input: { caseId: string; documentId: string; documentVersionId: string | null }) => {
            if (!intent) return
            try {
                const finalizedAt = new Date()
                await prisma.uploadIntent.updateMany({
                    where: { id: intent.id, tenantId, status: { not: UploadIntentStatus.FINALIZED } },
                    data: {
                        status: UploadIntentStatus.FINALIZED,
                        finalizedAt,
                        ...(input.documentVersionId ? { documentVersionId: input.documentVersionId } : {}),
                        lastError: null,
                        result: {
                            ...(title ? { title } : {}),
                            ...(category ? { category } : {}),
                            ...(notes ? { notes } : {}),
                            caseId: input.caseId,
                            documentId: input.documentId,
                            ...(input.documentVersionId ? { documentVersionId: input.documentVersionId } : {}),
                            key,
                            fileSize,
                            contentType: storedType,
                            finalizedAt: finalizedAt.toISOString(),
                        },
                    },
                })
            } catch (error) {
                logger.error("Finalize upload intent update failed", error)
            }
        }

        const existing = await prisma.document.findFirst({
            where: { id: documentId, case: { tenantId } },
            select: { id: true, caseId: true, title: true, version: true, fileUrl: true },
        })

        if (existing) {
            await requireCaseAccess(existing.caseId, user, "case:view")

            if (intent && intent.caseId !== existing.caseId) {
                await recordIntentFailure("上传会话与案件不匹配")
                return { success: false as const, error: "上传会话与案件不匹配" }
            }

            if (existing.version === expectedVersion && existing.fileUrl === key) {
                const existingVersion = await prisma.documentVersion.findUnique({
                    where: { documentId_version: { documentId: existing.id, version: expectedVersion } },
                    select: { id: true, fileKey: true },
                })
                const versionId = existingVersion?.fileKey === key ? existingVersion.id : null
                await tryMarkIntentFinalized({ caseId: existing.caseId, documentId: existing.id, documentVersionId: versionId })
                return { success: true as const, documentId: existing.id }
            }

            const isFirstUpload = !existing.fileUrl
            const nextVersion = isFirstUpload ? 1 : existing.version + 1
            if (expectedVersion !== nextVersion) {
                const existingVersion = await prisma.documentVersion.findUnique({
                    where: { documentId_version: { documentId: existing.id, version: expectedVersion } },
                    select: { id: true, fileKey: true },
                })
                if (existingVersion?.fileKey === key) {
                    await tryMarkIntentFinalized({ caseId: existing.caseId, documentId: existing.id, documentVersionId: existingVersion.id })
                    return { success: true as const, documentId: existing.id }
                }
                await recordIntentFailure("文档版本已变更，请刷新后重试")
                return { success: false as const, error: "文档版本已变更，请刷新后重试" }
            }

            const keyPrefix = buildUploadKeyPrefix({ caseId: existing.caseId, documentId: existing.id, expectedVersion })
            if (!key.startsWith(keyPrefix)) {
                await recordIntentFailure("上传 key 不匹配")
                return { success: false as const, error: "上传 key 不匹配" }
            }

            try {
                const finalizedAt = new Date()
                await prisma.$transaction(async (tx) => {
                    const createdVersion = await tx.documentVersion.create({
                        data: {
                            documentId: existing.id,
                            version: expectedVersion,
                            fileKey: key,
                            fileType: storedType,
                            fileSize,
                            uploaderId: user.id,
                        },
                        select: { id: true },
                    })

                    const updated = await tx.document.updateMany({
                        where: { id: existing.id, case: { tenantId } },
                        data: {
                            title: title || undefined,
                            category: category || undefined,
                            notes: notes || undefined,
                            fileUrl: key,
                            fileType: storedType,
                            fileSize,
                            version: expectedVersion,
                            uploaderId: user.id,
                        },
                    })
                    if (updated.count === 0) {
                        throw new Error("文档不存在或无权限")
                    }

                    if (intent) {
                        await tx.uploadIntent.updateMany({
                            where: { id: intent.id, tenantId, status: { not: UploadIntentStatus.FINALIZED } },
                            data: {
                                status: UploadIntentStatus.FINALIZED,
                                finalizedAt,
                                documentVersionId: createdVersion.id,
                                lastError: null,
                                result: {
                                    ...(title ? { title } : {}),
                                    ...(category ? { category } : {}),
                                    ...(notes ? { notes } : {}),
                                    caseId: existing.caseId,
                                    documentId: existing.id,
                                    documentVersionId: createdVersion.id,
                                    key,
                                    fileSize,
                                    contentType: storedType,
                                    finalizedAt: finalizedAt.toISOString(),
                                },
                            },
                        })
                    }
                })
            } catch (error) {
                if (getPrismaErrorCode(error) === "P2002") {
                    const existingVersion = await prisma.documentVersion.findUnique({
                        where: { documentId_version: { documentId: existing.id, version: expectedVersion } },
                        select: { id: true, fileKey: true },
                    })
                    if (existingVersion?.fileKey === key) {
                        await tryMarkIntentFinalized({ caseId: existing.caseId, documentId: existing.id, documentVersionId: existingVersion.id })
                        return { success: true as const, documentId: existing.id }
                    }
                    await recordIntentFailure("文档版本已变更，请刷新后重试")
                    return { success: false as const, error: "文档版本已变更，请刷新后重试" }
                }
                throw error
            }

            revalidatePath("/documents")
            revalidatePath(`/documents/${existing.id}`)
            revalidatePath(`/cases/${existing.caseId}`)

            return { success: true as const, documentId: existing.id }
        }

        const createCaseId = parsed.data.caseId
        if (!createCaseId) {
            await recordIntentFailure("必须选择关联案件")
            return { success: false as const, error: "必须选择关联案件" }
        }
        if (expectedVersion !== 1) {
            await recordIntentFailure("文档版本不合法")
            return { success: false as const, error: "文档版本不合法" }
        }

        await requireCaseAccess(createCaseId, user, "case:view")

        if (intent && intent.caseId !== createCaseId) {
            await recordIntentFailure("上传会话与案件不匹配")
            return { success: false as const, error: "上传会话与案件不匹配" }
        }

        const keyPrefix = buildUploadKeyPrefix({ caseId: createCaseId, documentId, expectedVersion })
        if (!key.startsWith(keyPrefix)) {
            await recordIntentFailure("上传 key 不匹配")
            return { success: false as const, error: "上传 key 不匹配" }
        }

        const docTitle = title || filename || "未命名文档"

        try {
            const finalizedAt = new Date()
            await prisma.$transaction(async (tx) => {
                await tx.document.create({
                    data: {
                        id: documentId,
                        title: docTitle,
                        fileUrl: key,
                        fileType: storedType,
                        fileSize,
                        version: expectedVersion,
                        caseId: createCaseId,
                        category: category || undefined,
                        tags: [],
                        notes: notes || undefined,
                        uploaderId: user.id,
                    },
                })

                const createdVersion = await tx.documentVersion.create({
                    data: {
                        documentId,
                        version: expectedVersion,
                        fileKey: key,
                        fileType: storedType,
                        fileSize,
                        uploaderId: user.id,
                    },
                    select: { id: true },
                })

                if (intent) {
                    await tx.uploadIntent.updateMany({
                        where: { id: intent.id, tenantId, status: { not: UploadIntentStatus.FINALIZED } },
                        data: {
                            status: UploadIntentStatus.FINALIZED,
                            finalizedAt,
                            documentVersionId: createdVersion.id,
                            lastError: null,
                            result: {
                                ...(title ? { title } : {}),
                                ...(category ? { category } : {}),
                                ...(notes ? { notes } : {}),
                                caseId: createCaseId,
                                documentId,
                                documentVersionId: createdVersion.id,
                                key,
                                fileSize,
                                contentType: storedType,
                                finalizedAt: finalizedAt.toISOString(),
                            },
                        },
                    })
                }
            })
        } catch (error) {
            if (getPrismaErrorCode(error) === "P2002") {
                const doc = await prisma.document.findFirst({
                    where: { id: documentId, case: { tenantId } },
                    select: { id: true, fileUrl: true, version: true, caseId: true },
                })
                if (doc?.fileUrl === key && doc.version === expectedVersion) {
                    const existingVersion = await prisma.documentVersion.findUnique({
                        where: { documentId_version: { documentId: doc.id, version: expectedVersion } },
                        select: { id: true, fileKey: true },
                    })
                    const versionId = existingVersion?.fileKey === key ? existingVersion.id : null
                    await tryMarkIntentFinalized({ caseId: doc.caseId, documentId: doc.id, documentVersionId: versionId })
                    return { success: true as const, documentId: doc.id }
                }
                await recordIntentFailure("文档已存在或版本冲突，请刷新后重试")
                return { success: false as const, error: "文档已存在或版本冲突，请刷新后重试" }
            }
            throw error
        }

        revalidatePath("/documents")
        revalidatePath(`/documents/${documentId}`)
        revalidatePath(`/cases/${createCaseId}`)

        return { success: true as const, documentId }
    } catch (error) {
        logger.error("Finalize Presigned Upload Failed", error)
        return { success: false as const, error: "确认上传失败" }
    }
}
