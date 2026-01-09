"use client"

import * as React from "react"
import type { Role } from "@/lib/prisma-browser"
import { useRouter } from "next/navigation"
import { Timer } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { TimeApprovalClient } from "@/components/timelog/TimeApprovalClient"
import { TimeLogClient } from "@/components/timelog/TimeLogClient"
import { TimerWidget } from "@/components/timelog/TimerWidget"
import { hasPermission } from "@/lib/permissions"
import { useFloatStore } from "@/store/float-store"

type CaseOption = { id: string; title: string; caseCode: string }
type TimeLogItem = Parameters<typeof TimeLogClient>[0]["initialLogs"][number]

export function TimeTrackingClient({
    userId,
    userRole,
    cases,
    initialLogs,
}: {
    userId: string
    userRole: Role
    cases: CaseOption[]
    initialLogs: TimeLogItem[]
}) {
    const router = useRouter()
    const { openWindow } = useFloatStore()
    const canApprove = hasPermission(userRole, "timelog:approve")

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_time_header",
            title: "导航",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 4, minW: 8, minH: 3 },
            content: (
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">工时追踪</h1>
                        <p className="text-muted-foreground">案件/任务 → 计时 → 复盘/计费</p>
                    </div>
                    <Button variant="outline" onClick={() => openWindow("timer", "TIMER", "计时器")}>
                        <Timer className="h-4 w-4 mr-2" />
                        打开计时器
                    </Button>
                </div>
            ),
        },
        {
            id: "b_time_timer_widget",
            title: "计时器（内嵌）",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 8, minW: 6, minH: 6 },
            content: (
                <TimerWidget
                    cases={cases}
                    onTimerChanged={() => {
                        router.refresh()
                    }}
                />
            ),
        },
        {
            id: "b_time_logs",
            title: "我的工时记录",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 16, minW: 6, minH: 10 },
            content: <TimeLogClient initialLogs={initialLogs} userId={userId} cases={cases} />,
        },
        ...(canApprove
            ? ([
                  {
                      id: "b_time_approvals",
                      title: "审批",
                      pinned: false,
                      chrome: "none",
                      defaultSize: { w: 12, h: 14, minW: 6, minH: 10 },
                      content: (
                          <TimeApprovalClient
                              enabled={true}
                              onChanged={() => {
                                  router.refresh()
                              }}
                          />
                      ),
                  },
              ] satisfies SectionCatalogItem[])
            : []),
    ]

    return <SectionWorkspace sectionId="time_tracking" catalog={catalog} className="h-full" />
}
