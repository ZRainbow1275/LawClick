import { notFound, redirect } from "next/navigation"

import { getCaseDetails, getCases } from "@/actions/cases"
import { getMyCasesUiPreferences } from "@/actions/ui-settings"
import { CaseIntakeDetailPanel } from "@/components/cases/CaseIntakeDetailPanel"
import { IntakeCasesWorkspaceClient } from "@/components/cases/IntakeCasesWorkspaceClient"
import { Card, CardContent } from "@/components/ui/Card"
import { UserFacingError } from "@/lib/action-errors"
import { AuthError, PermissionError } from "@/lib/server-auth"
import { UuidSchema } from "@/lib/zod"

export default async function IntakeCasesPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    type DbCase = Awaited<ReturnType<typeof getCases>>[number]
    const params = await props.searchParams

    const query = typeof params.q === "string" ? params.q : undefined
    const viewParam = typeof params.view === "string" ? params.view : undefined
    const rawCaseId = typeof params.caseId === "string" ? params.caseId : undefined

    const parsedCaseId = rawCaseId ? UuidSchema.safeParse(rawCaseId) : null
    const caseId = parsedCaseId?.success ? parsedCaseId.data : null

    const prefRes = await getMyCasesUiPreferences()
    const defaultView = prefRes.success ? prefRes.data.intakeViewMode : "split"
    const viewMode = viewParam === "split" || viewParam === "list" ? viewParam : defaultView

    let dbCases: DbCase[] = []
    try {
        dbCases = await getCases(query)
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        if (error instanceof PermissionError) notFound()
        throw error
    }

    const intakeCases = dbCases.filter((c) => c.status === "INTAKE" || c.status === "LEAD")

    const cases = intakeCases.map((c: DbCase) => {
        return {
            id: c.id,
            caseCode: c.caseCode,
            title: c.title,
            status: c.status,
            clientName: c.client?.name || "未知客户",
            progress: c.taskStats.progress,
            updatedAt: c.updatedAt,
        }
    })

    let caseItem: Awaited<ReturnType<typeof getCaseDetails>> | null = null
    let caseDetailError: string | null = null
    if (viewMode === "split" && caseId) {
        try {
            caseItem = await getCaseDetails(caseId)
        } catch (error) {
            if (error instanceof AuthError) redirect("/auth/login")
            if (error instanceof PermissionError) notFound()
            if (error instanceof UserFacingError) {
                caseDetailError = error.message
            } else {
                throw error
            }
        }
    }

    const detailPanel =
        viewMode !== "split" ? null : !caseId ? (
            <Card className="bg-card shadow-sm">
                <CardContent className="p-6 text-sm text-muted-foreground">
                    请选择左侧案件以进行分屏预览；也可切换为“列表”模式进入完整详情页。
                </CardContent>
            </Card>
        ) : caseDetailError ? (
            <Card className="border-destructive/20 bg-destructive/10">
                <CardContent className="p-4 text-sm text-destructive">{caseDetailError}</CardContent>
            </Card>
        ) : caseItem ? (
            <CaseIntakeDetailPanel caseItem={caseItem} />
        ) : (
            <Card className="border-destructive/20 bg-destructive/10">
                <CardContent className="p-4 text-sm text-destructive">未找到案件或无访问权限。</CardContent>
            </Card>
        )

    return (
        <IntakeCasesWorkspaceClient
            initialCases={cases}
            selectedCaseId={caseId}
            viewMode={viewMode}
            detailPanel={detailPanel}
        />
    )
}
