import { getCases, getDashboardData } from "@/actions/cases"
import { getMyTimeLogs } from "@/actions/timelogs-crud"
import { TimeTrackingClient } from "@/components/timelog/TimeTrackingClient"
import { unstable_noStore as noStore } from "next/cache"

export default async function TimePage() {
    noStore()
    const dashboardRes = await getDashboardData()
    const { user } = dashboardRes.data
    const cases = await getCases()

    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0)

    const logsRes = await getMyTimeLogs({
        from: from.toISOString(),
        to: to.toISOString(),
        status: ["COMPLETED", "APPROVED", "BILLED"],
        take: 300,
    })

    const caseOptions = cases.map((c) => ({
        id: c.id,
        title: c.title,
        caseCode: c.caseCode,
    }))

    return (
        <div className="space-y-4">
            {!dashboardRes.success ? (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                    {dashboardRes.error}
                </div>
            ) : null}
            <TimeTrackingClient
                userId={user.id}
                userRole={user.role}
                cases={caseOptions}
                initialLogs={logsRes.success ? logsRes.data : []}
            />
        </div>
    )
}
