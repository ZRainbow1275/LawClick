"use client"

import {
    finalizePresignedDocumentUpload,
    initPresignedDocumentUpload,
    uploadDocument,
} from "@/actions/documents"

type PresignedUpload = {
    intentId: string
    uploadUrl: string
    key: string
    caseId: string | null
    documentId: string
    expectedVersion: number
    expectedFileSize: number
    expectedContentType: string
    title: string | null
    category: string | null
    notes: string | null
    filename: string
}

type InitPresignedUploadResult = { success: true; upload: PresignedUpload } | { success: false; error: string }

type FinalizePresignedUploadResult =
    | { success: true; documentId: string }
    | { success: false; error: string }

type UploadDocumentFallbackResult =
    | { success: true; documentId: string }
    | { success: true; document: { id: string } }
    | { success: false; error: string }

export type DocumentUploadInput = {
    file: File
    caseId?: string | null
    documentId?: string | null
    title?: string | null
    category?: string | null
    notes?: string | null
}

export type DocumentUploadResult =
    | { success: true; documentId: string; usedFallback: boolean }
    | { success: false; error: string; usedFallback: boolean }

function normalizeString(value: unknown): string | null {
    if (typeof value !== "string") return null
    const trimmed = value.trim()
    return trimmed ? trimmed : null
}

async function uploadDocumentViaServer(input: DocumentUploadInput): Promise<DocumentUploadResult> {
    const formData = new FormData()
    formData.set("file", input.file)
    const caseId = normalizeString(input.caseId)
    const documentId = normalizeString(input.documentId)
    const title = normalizeString(input.title)
    const category = normalizeString(input.category)
    const notes = normalizeString(input.notes)

    if (caseId) formData.set("caseId", caseId)
    if (documentId) formData.set("documentId", documentId)
    if (title) formData.set("title", title)
    if (category) formData.set("category", category)
    if (notes) formData.set("notes", notes)

    const res = (await uploadDocument(formData)) as UploadDocumentFallbackResult
    if (!res || typeof res !== "object") {
        return { success: false, error: "上传失败", usedFallback: true }
    }
    if (!("success" in res) || typeof (res as { success?: unknown }).success !== "boolean") {
        return { success: false, error: "上传失败", usedFallback: true }
    }
    if (!res.success) {
        return { success: false, error: "error" in res && typeof res.error === "string" ? res.error : "上传失败", usedFallback: true }
    }

    const documentIdValue =
        "documentId" in res && typeof res.documentId === "string"
            ? res.documentId
            : "document" in res && res.document && typeof res.document.id === "string"
              ? res.document.id
              : null

    if (!documentIdValue) {
        return { success: false, error: "上传失败", usedFallback: true }
    }
    return { success: true, documentId: documentIdValue, usedFallback: true }
}

export async function uploadDocumentWithPresignedUrl(input: DocumentUploadInput): Promise<DocumentUploadResult> {
    const file = input.file
    const filename = file.name || "document"
    const fileSize = file.size || 0
    const contentType = normalizeString(file.type)

    const initRes = (await initPresignedDocumentUpload({
        caseId: normalizeString(input.caseId),
        documentId: normalizeString(input.documentId),
        title: normalizeString(input.title),
        category: normalizeString(input.category),
        notes: normalizeString(input.notes),
        filename,
        fileSize,
        contentType,
    })) as InitPresignedUploadResult

    if (!initRes || typeof initRes !== "object") {
        return { success: false, error: "初始化上传失败", usedFallback: false }
    }
    if (!initRes.success) {
        return { success: false, error: initRes.error || "初始化上传失败", usedFallback: false }
    }

    const upload = initRes.upload
    const headerContentType = normalizeString(upload.expectedContentType) || contentType || "application/octet-stream"

    try {
        const putRes = await fetch(upload.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": headerContentType },
            body: file,
        })

        if (!putRes.ok) {
            return await uploadDocumentViaServer(input)
        }
    } catch {
        return await uploadDocumentViaServer(input)
    }

    const finalizeRes = (await finalizePresignedDocumentUpload({
        intentId: upload.intentId,
        caseId: upload.caseId,
        documentId: upload.documentId,
        expectedVersion: upload.expectedVersion,
        key: upload.key,
        filename: upload.filename,
        expectedFileSize: upload.expectedFileSize,
        expectedContentType: upload.expectedContentType,
        title: upload.title,
        category: upload.category,
        notes: upload.notes,
    })) as FinalizePresignedUploadResult

    if (!finalizeRes || typeof finalizeRes !== "object") {
        return { success: false, error: "确认上传失败", usedFallback: false }
    }
    if (!finalizeRes.success) {
        return { success: false, error: finalizeRes.error || "确认上传失败", usedFallback: false }
    }

    return { success: true, documentId: finalizeRes.documentId, usedFallback: false }
}
