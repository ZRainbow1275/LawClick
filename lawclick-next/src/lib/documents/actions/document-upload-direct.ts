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
import { buildObjectKey } from "@/lib/document-upload-keys"
import { NullableNonEmptyString, UuidSchema } from "@/lib/zod"
import {
    MAX_UPLOAD_BYTES,
    buildUploadBody,
    createUploadIntentOrThrow,
    getPrismaErrorCode,
    resolveUploadMimeType,
} from "@/lib/documents/actions/document-upload-utils"

const UploadDocumentFieldsSchema = z
    .object({
        caseId: UuidSchema.nullable(),
        documentId: UuidSchema.nullable(),
        title: NullableNonEmptyString(200),
        category: NullableNonEmptyString(64),
        notes: NullableNonEmptyString(20_000),
    })
    .strict()
    .refine((v) => v.documentId || v.caseId, { message: "必须选择关联案件或指定文档" })

export async function uploadDocumentImpl(formData: FormData) {
    try {
        const ctx = await getActiveTenantContextOrThrow()
        requireTenantPermission(ctx, "document:upload")
        const { user, tenantId } = ctx

        const rate = await enforceActionRateLimit({
            tenantId,
            userId: user.id,
            action: "documents.upload",
            limit: 30,
            windowMs: 60_000,
        })
        if (!rate.allowed) return { success: false as const, error: rate.error }

        const fileValue = formData.get("file")
        const file = fileValue instanceof File ? fileValue : null

        const fields = UploadDocumentFieldsSchema.safeParse({
            caseId: (typeof formData.get("caseId") === "string" ? String(formData.get("caseId")).trim() : "") || null,
            documentId:
                (typeof formData.get("documentId") === "string" ? String(formData.get("documentId")).trim() : "") ||
                null,
            title: (typeof formData.get("title") === "string" ? String(formData.get("title")).trim() : "") || null,
            category:
                (typeof formData.get("category") === "string" ? String(formData.get("category")).trim() : "") || null,
            notes: (typeof formData.get("notes") === "string" ? String(formData.get("notes")).trim() : "") || null,
        })

        if (!fields.success) {
            return { success: false as const, error: fields.error.issues[0]?.message || "输入校验失败" }
        }

        const caseId = fields.data.caseId
        const documentId = fields.data.documentId
        const titleInput = fields.data.title || null
        const category = fields.data.category || null
        const notes = fields.data.notes || null

        if (!file) {
            return { success: false as const, error: "缺少文件" }
        }

        const fileSize = file.size || 0
        if (fileSize <= 0) {
            return { success: false as const, error: "文件为空" }
        }
        if (fileSize > MAX_UPLOAD_BYTES) {
            return {
                success: false as const,
                error: `文件过大（最大 ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB）`,
            }
        }

        const mime = resolveUploadMimeType(file)
        if (!mime.ok) {
            return { success: false as const, error: mime.error }
        }
        const fileType = mime.mime
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
            const title = titleInput || existing.title

            const key = buildObjectKey({
                caseId: existing.caseId,
                documentId: existing.id,
                version: nextVersion,
                filename: file.name || title,
            })

            const uploadIntent = await createUploadIntentOrThrow({
                tenantId,
                kind: "DOCUMENT",
                createdById: user.id,
                caseId: existing.caseId,
                documentId: existing.id,
                key,
                filename: file.name || title,
                contentType: fileType,
                expectedFileSize: fileSize,
                expectedVersion: nextVersion,
                status: UploadIntentStatus.INITIATED,
                expiresAt: new Date(),
                result: {
                    channel: "server",
                    ...(titleInput ? { title: titleInput } : {}),
                    ...(category ? { category } : {}),
                    ...(notes ? { notes } : {}),
                },
            })

            try {
                await storage.putObject({
                    key,
                    body: await buildUploadBody(file),
                    contentType: fileType,
                    contentLength: fileSize,
                })
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                await prisma.uploadIntent.updateMany({
                    where: { id: uploadIntent.id, tenantId, status: { not: UploadIntentStatus.FINALIZED } },
                    data: {
                        status: UploadIntentStatus.FAILED,
                        lastError: message,
                        result: {
                            channel: "server",
                            error: message,
                            failedAt: new Date().toISOString(),
                        },
                    },
                })
                throw new Error("上传存储失败，请稍后重试")
            }

            try {
                const finalizedAt = new Date()
                await prisma.$transaction(async (tx) => {
                    const versionRow = await tx.documentVersion.create({
                        data: {
                            documentId: existing.id,
                            version: nextVersion,
                            fileKey: key,
                            fileType,
                            fileSize,
                            uploaderId: user.id,
                        },
                        select: { id: true },
                    })

                    const updated = await tx.document.updateMany({
                        where: { id: existing.id, case: { tenantId } },
                        data: {
                            title: titleInput || undefined,
                            category: category || undefined,
                            notes: notes || undefined,
                            fileUrl: key,
                            fileType,
                            fileSize,
                            version: nextVersion,
                            uploaderId: user.id,
                        },
                    })
                    if (updated.count === 0) {
                        throw new Error("文档不存在或无权限")
                    }

                    await tx.uploadIntent.updateMany({
                        where: { id: uploadIntent.id, tenantId, status: { not: UploadIntentStatus.FINALIZED } },
                        data: {
                            status: UploadIntentStatus.FINALIZED,
                            finalizedAt,
                            documentVersionId: versionRow.id,
                            lastError: null,
                            result: {
                                channel: "server",
                                ...(titleInput ? { title: titleInput } : {}),
                                ...(category ? { category } : {}),
                                ...(notes ? { notes } : {}),
                                documentId: existing.id,
                                documentVersionId: versionRow.id,
                                key,
                                fileSize,
                                contentType: fileType,
                                finalizedAt: finalizedAt.toISOString(),
                            },
                        },
                    })
                })
            } catch (error) {
                const code = getPrismaErrorCode(error)
                const message =
                    code === "P2002"
                        ? "文档版本已变更，请刷新后重试"
                        : error instanceof Error
                          ? error.message
                          : String(error)
                await prisma.uploadIntent.updateMany({
                    where: { id: uploadIntent.id, tenantId, status: { not: UploadIntentStatus.FINALIZED } },
                    data: {
                        status: UploadIntentStatus.FAILED,
                        lastError: message,
                        result: {
                            channel: "server",
                            error: message,
                            failedAt: new Date().toISOString(),
                        },
                    },
                })
                throw new Error(message)
            }

            revalidatePath("/documents")
            revalidatePath(`/documents/${existing.id}`)
            revalidatePath(`/cases/${existing.caseId}`)

            return { success: true as const, documentId: existing.id }
        }

        if (!caseId) {
            return { success: false as const, error: "必须选择关联案件" }
        }
        await requireCaseAccess(caseId, user, "case:view")

        const title = titleInput || file.name || "未命名文档"
        const newDocumentId = randomUUID()
        const version = 1

        const key = buildObjectKey({
            caseId,
            documentId: newDocumentId,
            version,
            filename: file.name || title,
        })

        const uploadIntent = await createUploadIntentOrThrow({
            tenantId,
            kind: "DOCUMENT",
            createdById: user.id,
            caseId,
            documentId: newDocumentId,
            key,
            filename: file.name || title,
            contentType: fileType,
            expectedFileSize: fileSize,
            expectedVersion: version,
            status: UploadIntentStatus.INITIATED,
            expiresAt: new Date(),
            result: {
                channel: "server",
                ...(titleInput ? { title: titleInput } : {}),
                ...(category ? { category } : {}),
                ...(notes ? { notes } : {}),
            },
        })

        try {
            await storage.putObject({
                key,
                body: await buildUploadBody(file),
                contentType: fileType,
                contentLength: fileSize,
            })
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            await prisma.uploadIntent.updateMany({
                where: { id: uploadIntent.id, tenantId, status: { not: UploadIntentStatus.FINALIZED } },
                data: {
                    status: UploadIntentStatus.FAILED,
                    lastError: message,
                    result: {
                        channel: "server",
                        error: message,
                        failedAt: new Date().toISOString(),
                    },
                },
            })
            throw new Error("上传存储失败，请稍后重试")
        }

        let document: { id: string }
        try {
            const finalizedAt = new Date()
            document = await prisma.$transaction(async (tx) => {
                const created = await tx.document.create({
                    data: {
                        id: newDocumentId,
                        title,
                        fileUrl: key,
                        fileType,
                        fileSize,
                        caseId,
                        category: category || undefined,
                        tags: [],
                        notes: notes || undefined,
                        uploaderId: user.id,
                        version,
                    },
                    select: { id: true },
                })

                const versionRow = await tx.documentVersion.create({
                    data: {
                        documentId: created.id,
                        version,
                        fileKey: key,
                        fileType,
                        fileSize,
                        uploaderId: user.id,
                    },
                    select: { id: true },
                })

                await tx.uploadIntent.updateMany({
                    where: { id: uploadIntent.id, tenantId, status: { not: UploadIntentStatus.FINALIZED } },
                    data: {
                        status: UploadIntentStatus.FINALIZED,
                        finalizedAt,
                        documentVersionId: versionRow.id,
                        lastError: null,
                        result: {
                            channel: "server",
                            ...(titleInput ? { title: titleInput } : {}),
                            ...(category ? { category } : {}),
                            ...(notes ? { notes } : {}),
                            documentId: created.id,
                            documentVersionId: versionRow.id,
                            key,
                            fileSize,
                            contentType: fileType,
                            finalizedAt: finalizedAt.toISOString(),
                        },
                    },
                })

                return created
            })
        } catch (error) {
            const code = getPrismaErrorCode(error)
            const message =
                code === "P2002"
                    ? "文档已存在或版本冲突，请刷新后重试"
                    : error instanceof Error
                      ? error.message
                      : String(error)
            await prisma.uploadIntent.updateMany({
                where: { id: uploadIntent.id, tenantId, status: { not: UploadIntentStatus.FINALIZED } },
                data: {
                    status: UploadIntentStatus.FAILED,
                    lastError: message,
                    result: {
                        channel: "server",
                        error: message,
                        failedAt: new Date().toISOString(),
                    },
                },
            })
            throw new Error(message)
        }

        revalidatePath("/documents")
        revalidatePath(`/documents/${document.id}`)
        revalidatePath(`/cases/${caseId}`)

        return { success: true as const, document }
    } catch (error) {
        logger.error("Upload Failed", error)
        const message = error instanceof Error ? error.message : String(error)
        return { success: false as const, error: message }
    }
}
