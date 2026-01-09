export type DocumentReviewStatus = "PASS" | "WARN" | "FAIL"

export type DocumentReviewItem = {
    id: string
    title: string
    status: DocumentReviewStatus
    detail?: string | null
}

export type DocumentReviewDoc = {
    id: string
    title: string
    version: number
    fileUrl?: string | null
    fileType?: string | null
    fileSize?: number | null
    category?: string | null
    tags?: string[] | null
    notes?: string | null
    summary?: string | null
    isConfidential: boolean
    case: { id: string; title: string; caseCode?: string | null }
}

