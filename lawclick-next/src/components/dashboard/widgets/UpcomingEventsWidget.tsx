import Link from "next/link"
import type { ReactNode } from "react"
import type { getDashboardData } from "@/actions/cases"
import { Button } from "@/components/ui/Button"
import { CalendarDays } from "lucide-react"

type DashboardEvent = Awaited<ReturnType<typeof getDashboardData>>["data"]["events"][number]

export function UpcomingEventsWidget({
    events,
    toolbar,
    loading = false,
    error,
}: {
    events: DashboardEvent[]
    toolbar?: ReactNode
    loading?: boolean
    error?: string | null
}) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarDays className="h-4 w-4" />
                    <span>近期日程</span>
                    {loading ? <span className="text-xs">加载中…</span> : null}
                </div>
                <div className="flex items-center gap-2">
                    {toolbar}
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/calendar">打开日历</Link>
                    </Button>
                </div>
            </div>

            <div className="space-y-2">
                {error ? (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                        {error}
                    </div>
                ) : loading ? (
                    <div className="text-sm text-muted-foreground">加载中...</div>
                ) : events.length === 0 ? (
                    <div className="text-sm text-muted-foreground">暂无日程</div>
                ) : (
                    events.map((e) => (
                        <div key={e.id} className="rounded-lg border bg-card/50 px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-sm font-medium truncate">{e.title}</div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                        {new Date(e.startTime).toLocaleString()} -{" "}
                                        {new Date(e.endTime).toLocaleTimeString()}
                                        {e.case?.title ? <span className="ml-2">• {e.case.title}</span> : null}
                                    </div>
                                </div>
                                <div className="text-xs text-muted-foreground shrink-0">{e.type}</div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
