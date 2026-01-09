import { notFound } from "next/navigation"
import { getDocumentById } from "@/actions/documents"
import { getToolModules } from "@/actions/tool-actions"
import { DocumentWorkbenchWorkspaceClient } from "@/components/documents/DocumentWorkbenchWorkspaceClient"

export default async function DocumentWorkbenchPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    const docRes = await getDocumentById(id)
    if (!docRes.success || !docRes.data) {
        notFound()
    }

    const modulesRes = await getToolModules("workbench")
    const workbenchModule =
        modulesRes.success && modulesRes.data.length
            ? modulesRes.data.find((m) => Boolean(m.url)) || null
            : null

    return (
        <DocumentWorkbenchWorkspaceClient
            document={{
                id: docRes.data.id,
                title: docRes.data.title,
                case: docRes.data.case,
                category: docRes.data.category ?? null,
                tags: Array.isArray(docRes.data.tags) ? docRes.data.tags : null,
                isConfidential: Boolean(docRes.data.isConfidential),
                versionCount: Array.isArray(docRes.data.versions) ? docRes.data.versions.length : 0,
            }}
            module={
                workbenchModule && workbenchModule.url
                    ? { name: workbenchModule.name, url: workbenchModule.url }
                    : null
            }
        />
    )
}
