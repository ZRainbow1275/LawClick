import { getCases } from "@/actions/cases"
import { CaseListClient } from "@/components/cases/CaseListClient"

export default async function CasesPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams
    const query = typeof params.q === 'string' ? params.q : undefined
    const status = typeof params.status === 'string' ? params.status : undefined
    const type = typeof params.type === 'string' ? params.type : undefined

    const dbCases = await getCases(query, status, type)

    const cases = dbCases.map((c) => {
        return {
            id: c.id,
            caseCode: c.caseCode,
            title: c.title,
            clientName: c.client?.name || "未知客户",
            status: c.status,
            caseType: c.serviceType,
            contractValue: c.contractValue ?? 0,
            progress: c.taskStats.progress,
            updatedAt: c.updatedAt,
        }
    })

    return <CaseListClient initialCases={cases} />
}
