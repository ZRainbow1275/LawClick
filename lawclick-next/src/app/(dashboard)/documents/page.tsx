import { getDocuments as getDocumentsFromActions } from "@/actions/documents"
import { getCases } from "@/actions/cases"
import { DocumentListClient } from "@/components/documents/DocumentListClient"
import { getDocumentCapabilities } from "@/lib/capabilities/document-capabilities"
import { logger } from "@/lib/logger"
import { AuthError, PermissionError, getActiveTenantContextWithPermissionOrThrow } from "@/lib/server-auth"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function DocumentsPage() {
    let capabilities: ReturnType<typeof getDocumentCapabilities>
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("document:view")
        capabilities = getDocumentCapabilities(ctx)
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        if (error instanceof PermissionError) {
            return <div className="p-6 text-sm text-muted-foreground">无权限访问</div>
        }
        throw error
    }

    type DbCase = Awaited<ReturnType<typeof getCases>>[number]
    type DbDocument = Awaited<ReturnType<typeof getDocumentsFromActions>> extends { data: (infer T)[] } ? T : never
    type CaseOption = Parameters<typeof DocumentListClient>[0]["cases"][number]
    type DocumentItem = Parameters<typeof DocumentListClient>[0]["initialDocuments"][number]

    const docsResult = await getDocumentsFromActions()

    let cases: DbCase[] = []
    let casesError: string | null = null
    if (capabilities.canUpload) {
        try {
            cases = await getCases()
        } catch (error) {
            logger.error("获取案件列表失败", error)
            casesError = "获取案件列表失败"
        }
    }

    const caseOptions: CaseOption[] = cases.map((c: DbCase) => ({
        id: c.id,
        title: c.title,
    }))

    const documents: DocumentItem[] = docsResult.success
        ? docsResult.data.map((d: DbDocument) => ({
              id: d.id,
              title: d.title,
              fileUrl: d.fileUrl,
              fileType: d.fileType,
              fileSize: d.fileSize || 0,
              updatedAt: d.updatedAt,
              case: {
                  title: d.case?.title || "未关联",
                  caseCode: d.case?.caseCode || "-",
              },
              tags: d.tags || [],
              notes: d.notes ?? undefined,
              summary: d.summary ?? undefined,
              category: d.category ?? undefined,
              version: d.version?.toString(),
              isFavorite: d.isFavorite,
              isConfidential: d.isConfidential,
          }))
        : []

    const initialError = [
        docsResult.success ? null : docsResult.error || "获取文档列表失败",
        casesError,
    ]
        .filter(Boolean)
        .join("；") || null

    return <DocumentListClient initialDocuments={documents} cases={caseOptions} capabilities={capabilities} initialError={initialError} />
}
