import "server-only"

import { Readable } from "node:stream"

import type { HeadObjectOutput } from "@/lib/s3"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export async function buildUploadBody(file: File) {
    const fromWeb = (Readable as unknown as { fromWeb?: unknown }).fromWeb
    if (typeof fromWeb === "function") {
        return (fromWeb as (stream: ReadableStream<Uint8Array>) => Readable)(file.stream() as ReadableStream<Uint8Array>)
    }
    return Buffer.from(await file.arrayBuffer())
}

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export const ALLOWED_UPLOAD_MIME_TYPES = new Set<string>([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
])

function inferMimeTypeFromFilename(filename: string): string | null {
    const name = filename.trim().toLowerCase()
    const ext = name.includes(".") ? name.split(".").pop() : null
    if (!ext) return null

    if (ext === "pdf") return "application/pdf"
    if (ext === "doc") return "application/msword"
    if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    if (ext === "txt") return "text/plain"
    return null
}

export function resolveUploadMimeType(file: File): { ok: true; mime: string } | { ok: false; error: string } {
    const declared = (file.type || "").trim()
    if (declared && ALLOWED_UPLOAD_MIME_TYPES.has(declared)) {
        return { ok: true, mime: declared }
    }

    const inferred = inferMimeTypeFromFilename(file.name || "")
    if (inferred && ALLOWED_UPLOAD_MIME_TYPES.has(inferred)) {
        return { ok: true, mime: inferred }
    }

    return { ok: false, error: "不支持的文件类型（仅支持 PDF/DOC/DOCX/TXT）" }
}

export function normalizeContentType(value: string | null | undefined): string | null {
    const raw = (value || "").trim()
    if (!raw) return null
    const normalized = raw.split(";")[0]?.trim() || ""
    return normalized ? normalized : null
}

export function resolveUploadMimeTypeFromMeta(input: {
    filename: string
    contentType: string | null | undefined
}): { ok: true; mime: string } | { ok: false; error: string } {
    const declared = normalizeContentType(input.contentType)
    if (declared && ALLOWED_UPLOAD_MIME_TYPES.has(declared)) {
        return { ok: true, mime: declared }
    }

    const inferred = inferMimeTypeFromFilename(input.filename || "")
    if (inferred && ALLOWED_UPLOAD_MIME_TYPES.has(inferred)) {
        return { ok: true, mime: inferred }
    }

    return { ok: false, error: "不支持的文件类型（仅支持 PDF/DOC/DOCX/TXT）" }
}

export function getPrismaErrorCode(error: unknown): string | null {
    if (!error || typeof error !== "object") return null
    const code = (error as { code?: unknown }).code
    return typeof code === "string" ? code : null
}

export async function createUploadIntentOrThrow(data: Prisma.UploadIntentUncheckedCreateInput) {
    try {
        return await prisma.uploadIntent.create({ data, select: { id: true } })
    } catch (error) {
        if (getPrismaErrorCode(error) === "P2002") {
            const tenantId = typeof data.tenantId === "string" ? data.tenantId.trim() : ""
            const existing = tenantId
                ? await prisma.uploadIntent.findFirst({
                      where: { key: data.key, tenantId },
                      select: { id: true },
                  })
                : null
            if (existing) return existing
        }
        throw error
    }
}

export async function headObjectWithRetry(
    storage: { headObject: (key: string) => Promise<HeadObjectOutput | null> },
    key: string
): Promise<HeadObjectOutput | null> {
    const maxAttempts = 3
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const object = await storage.headObject(key)
        if (object) return object
        if (attempt < maxAttempts) {
            const delayMs = 250 * attempt
            await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
        }
    }
    return null
}

