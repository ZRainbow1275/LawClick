import { notFound, redirect } from "next/navigation"
import { getCaseDetails } from "@/actions/cases"
import { CaseDetailClient } from "@/components/cases/CaseDetailClient"
import { UserFacingError } from "@/lib/action-errors"
import { AuthError, PermissionError, getSessionUser } from "@/lib/server-auth"
import { buildCaseDetailViewModel } from "@/lib/cases/case-detail-view-model"

export default async function CaseDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params

    let caseItem: Awaited<ReturnType<typeof getCaseDetails>> | null = null
    let currentUser: Awaited<ReturnType<typeof getSessionUser>> | null = null

    try {
        caseItem = await getCaseDetails(id)
        currentUser = await getSessionUser()
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        if (error instanceof PermissionError) notFound()
        if (error instanceof UserFacingError) {
            return (
                <div className="p-6 text-sm text-muted-foreground">
                    {error.message}
                </div>
            )
        }
        throw error
    }

    if (!caseItem) notFound()

    const { viewModel, currentUser: safeCurrentUser } = buildCaseDetailViewModel({ caseItem, currentUser })
    return <CaseDetailClient caseItem={viewModel} currentUser={safeCurrentUser} />
}
