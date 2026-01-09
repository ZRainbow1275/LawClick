import { redirect } from "next/navigation"

import { getAllDocumentTemplates } from "@/actions/document-templates"
import { DocumentTemplatesWorkspaceClient } from "@/components/admin/DocumentTemplatesWorkspaceClient"
import { AuthError, PermissionError } from "@/lib/server-auth"
import type { DocumentTemplateListItem } from "@/lib/templates/types"

export const dynamic = "force-dynamic"

export default async function DocumentTemplatesPage() {
    let templates: DocumentTemplateListItem[] = []
    let errorMessage: string | null = null

    try {
        const result = await getAllDocumentTemplates({ includeInactive: true })
        if (!result.success) errorMessage = result.error || "请稍后重试"
        else templates = result.data
    } catch (error) {
        if (error instanceof AuthError) {
            redirect("/auth/login")
        }
        if (error instanceof PermissionError) {
            errorMessage = "无权限访问"
        } else {
            throw error
        }
    }

    if (errorMessage) {
        return <div className="p-6 text-sm text-muted-foreground">加载失败：{errorMessage}</div>
    }

    return <DocumentTemplatesWorkspaceClient initialTemplates={templates} />
}
