"use server"

import {
    addDocumentTagImpl,
    deleteDocumentImpl,
    getDocumentByIdImpl,
    getDocumentsImpl,
    removeDocumentTagImpl,
    toggleDocumentFavoriteImpl,
    updateDocumentImpl,
} from "@/lib/documents/actions/document-crud"
import { uploadDocumentImpl } from "@/lib/documents/actions/document-upload-direct"
import { finalizePresignedDocumentUploadImpl, initPresignedDocumentUploadImpl } from "@/lib/documents/actions/document-upload-presigned"
import { draftStageDocumentFromTemplateImpl, generateDocumentImpl } from "@/lib/documents/actions/document-template-draft"

export async function getDocuments(options?: {
    caseId?: string
    category?: string
    query?: string
    onlyFavorites?: boolean
    take?: number
    cursor?: { updatedAt: string | Date; id: string } | null
}) {
    return getDocumentsImpl(options)
}

export async function getDocumentById(id: string) {
    return getDocumentByIdImpl(id)
}

export async function updateDocument(
    id: string,
    data: {
        title?: string
        category?: string
        notes?: string
        tags?: string[]
        isConfidential?: boolean
    }
) {
    return updateDocumentImpl(id, data)
}

export async function deleteDocument(id: string) {
    return deleteDocumentImpl(id)
}

export async function toggleDocumentFavorite(id: string) {
    return toggleDocumentFavoriteImpl(id)
}

export async function addDocumentTag(id: string, tag: string) {
    return addDocumentTagImpl(id, tag)
}

export async function removeDocumentTag(id: string, tag: string) {
    return removeDocumentTagImpl(id, tag)
}

export async function generateDocument(caseId: string, templateCode: string, data: Record<string, string>) {
    return generateDocumentImpl(caseId, templateCode, data)
}

export async function draftStageDocumentFromTemplate(input: {
    documentId: string
    templateCode?: string
    mode?: "replace" | "append"
    data: Record<string, string>
}) {
    return draftStageDocumentFromTemplateImpl(input)
}

export async function uploadDocument(formData: FormData) {
    return uploadDocumentImpl(formData)
}

export async function initPresignedDocumentUpload(input: {
    caseId: string | null
    documentId: string | null
    title: string | null
    category: string | null
    notes: string | null
    filename: string
    fileSize: number
    contentType?: string | null
}) {
    return initPresignedDocumentUploadImpl(input)
}

export async function finalizePresignedDocumentUpload(input: {
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
    return finalizePresignedDocumentUploadImpl(input)
}
