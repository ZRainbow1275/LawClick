import Link from "next/link"
import { Button } from "@/components/ui/Button"
import { Badge } from "@/components/ui/Badge"
import { OpenTimerWindowButton } from "@/components/dashboard/widgets/OpenTimerWindowButton"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Clock, TimerReset } from "lucide-react"

export function TimeSummaryWidget({
    today,
    week,
    activeTimer,
}: {
    today: { totalHours: number; billableHours: number; count: number }
    week: { totalHours: number; billableHours: number; count: number }
    activeTimer: {
        description?: string | null
        status: string
        case?: { title?: string | null } | null
    } | null
}) {
    const catalog: SectionCatalogItem[] = [
        {
            id: "b_time_summary_header",
            title: "操作栏",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 3, minW: 6, minH: 2 },
            content: (
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>工时概览</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <OpenTimerWindowButton label="浮窗" variant="outline" />
                        <Button asChild variant="ghost" size="sm">
                            <Link href="/time">进入工时</Link>
                        </Button>
                    </div>
                </div>
            ),
        },
        {
            id: "b_time_summary_today",
            title: "今日",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
            content: (
                <div className="rounded-lg border bg-card/50 p-3 h-full">
                    <div className="text-xs text-muted-foreground">今日</div>
                    <div className="mt-1 flex items-end justify-between">
                        <div className="text-2xl font-bold">{today.totalHours.toFixed(2)}h</div>
                        <Badge variant="secondary">{today.count} 条</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                        可计费 {today.billableHours.toFixed(2)}h
                    </div>
                </div>
            ),
        },
        {
            id: "b_time_summary_week",
            title: "本周",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
            content: (
                <div className="rounded-lg border bg-card/50 p-3 h-full">
                    <div className="text-xs text-muted-foreground">本周</div>
                    <div className="mt-1 flex items-end justify-between">
                        <div className="text-2xl font-bold">{week.totalHours.toFixed(2)}h</div>
                        <Badge variant="secondary">{week.count} 条</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                        可计费 {week.billableHours.toFixed(2)}h
                    </div>
                </div>
            ),
        },
        {
            id: "b_time_summary_active_timer",
            title: "当前计时",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 6, minW: 6, minH: 4 },
            content: (
                <div className="rounded-lg border bg-muted/30 p-3 h-full">
                    <div className="flex items-center gap-2 text-sm">
                        <TimerReset className="h-4 w-4 text-primary" />
                        <span className="font-medium">当前计时</span>
                    </div>
                    {activeTimer ? (
                        <div className="mt-2 space-y-1">
                            <div className="text-sm">{activeTimer.description || "未命名计时"}</div>
                            <div className="text-xs text-muted-foreground">
                                {activeTimer.case?.title ? `案件：${activeTimer.case.title}` : "未关联案件"} •{" "}
                                {activeTimer.status}
                            </div>
                        </div>
                    ) : (
                        <div className="mt-2 text-sm text-muted-foreground">
                            当前没有进行中的计时。建议从任务卡/案件入口开始计时。
                        </div>
                    )}
                </div>
            ),
        },
    ]

    return (
        <SectionWorkspace
            title=""
            sectionId="time_summary_widget"
            headerVariant="compact"
            catalog={catalog}
        />
    )
}
