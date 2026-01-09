import { getCases } from "@/actions/cases"
import { CaseListClient } from "@/components/cases/CaseListClient"

export default async function ActiveCasesPage() {
    type DbCase = Awaited<ReturnType<typeof getCases>>[number]
    type CaseListItem = Parameters<typeof CaseListClient>[0]["initialCases"][number]

    const dbCases = await getCases()
    const activeCases = dbCases.filter((c) => c.status === "ACTIVE")

    // Transform to match CaseListClient interface
    const cases: CaseListItem[] = activeCases.map((c: DbCase) => {
        return {
            id: c.id,
            caseCode: c.caseCode,
            title: c.title,
            status: c.status,
            clientName: c.client?.name || "未知客户",
            caseType: c.serviceType,
            contractValue: typeof c.contractValue === "number" ? c.contractValue : 0,
            progress: c.taskStats.progress,
            updatedAt: c.updatedAt,
        }
    })

    return <CaseListClient initialCases={cases} title="我的案件" description="当前正在进行的案件列表" />
}
