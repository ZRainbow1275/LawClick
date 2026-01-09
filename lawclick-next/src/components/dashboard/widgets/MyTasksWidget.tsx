import Link from "next/link"
import type { getDashboardData } from "@/actions/cases"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Clock, ListTodo } from "lucide-react"

type DashboardTask = Awaited<ReturnType<typeof getDashboardData>>["data"]["tasks"][number]

function formatPriority(priority?: string | null) {
    switch (priority) {
        case "P0_URGENT":
            return { label: "紧急", variant: "destructive" as const }
        case "P1_HIGH":
            return { label: "高", variant: "outline" as const }
        case "P2_MEDIUM":
            return { label: "中", variant: "secondary" as const }
        case "P3_LOW":
            return { label: "低", variant: "secondary" as const }
        default:
            return { label: "—", variant: "secondary" as const }
    }
}

export function MyTasksWidget({
    tasks,
}: {
    tasks: DashboardTask[]
}) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <ListTodo className="h-4 w-4" />
                    <span>今日待办（未完成）</span>
                </div>
                <Button asChild variant="ghost" size="sm">
                    <Link href="/tasks">查看全部</Link>
                </Button>
            </div>

            <div className="space-y-2">
                {tasks.length === 0 ? (
                    <div className="text-sm text-muted-foreground">暂无待办</div>
                ) : (
                    tasks.map((t) => {
                        const p = formatPriority(t.priority)
                        return (
                            <div key={t.id} className="flex items-start justify-between gap-3 rounded-lg border bg-card/50 px-3 py-2">
                                <div className="min-w-0">
                                    <div className="text-sm font-medium truncate">{t.title}</div>
                                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                        {t.dueDate ? (
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {new Date(t.dueDate).toLocaleString()}
                                            </span>
                                        ) : (
                                            <span>未设置截止时间</span>
                                        )}
                                        {t.case?.title ? <span className="truncate">• {t.case.title}</span> : null}
                                    </div>
                                </div>
                                <Badge variant={p.variant} className="shrink-0">
                                    {p.label}
                                </Badge>
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}
