import { getDocumentById } from "@/actions/documents"
import { DocumentDetailClient } from "@/components/documents/DocumentDetailClient"
import { notFound } from "next/navigation"

export default async function DocumentDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params
    const result = await getDocumentById(id)

    if (!result.success || !result.data) {
        notFound()
    }

    return <DocumentDetailClient document={result.data} />
}
