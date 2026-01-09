export function sanitizeFilename(filename: string) {
    return (filename || "")
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, " ")
        .trim()
}

export function buildObjectKey(input: {
    caseId: string
    documentId: string
    version: number
    filename: string
}) {
    const safeFilename = sanitizeFilename(input.filename || "document")
    const ts = new Date().toISOString().replace(/[:.]/g, "-")
    return `cases/${input.caseId}/documents/${input.documentId}/v${input.version}/${ts}-${safeFilename}`
}

export function buildUploadKeyPrefix(input: { caseId: string; documentId: string; expectedVersion: number }) {
    return `cases/${input.caseId}/documents/${input.documentId}/v${input.expectedVersion}/`
}

