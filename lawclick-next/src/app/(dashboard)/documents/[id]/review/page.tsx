import { getDocumentById } from "@/actions/documents"
import { DocumentReviewClient } from "@/components/documents/DocumentReviewClient"
import { buildDocumentReviewItems } from "@/lib/documents/document-review"
import type { DocumentReviewDoc } from "@/lib/documents/document-review-types"
import { notFound } from "next/navigation"

export default async function DocumentReviewPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    const result = await getDocumentById(id)
    if (!result.success || !result.data) {
        notFound()
    }

    const doc = result.data
    const document: DocumentReviewDoc = {
        id: doc.id,
        title: doc.title,
        version: doc.version,
        fileUrl: doc.fileUrl,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        category: doc.category,
        tags: doc.tags,
        notes: doc.notes,
        summary: doc.summary,
        isConfidential: doc.isConfidential,
        case: {
            id: doc.case.id,
            title: doc.case.title,
            caseCode: doc.case.caseCode,
        },
    }

    const items = buildDocumentReviewItems(document)

    return <DocumentReviewClient document={document} items={items} />
}

