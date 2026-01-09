import { addDays, startOfWeek } from "date-fns"
import { redirect } from "next/navigation"

import { getEventOccurrencesInRange } from "@/actions/event-actions"
import { getTeamDirectory } from "@/actions/team-directory"
import { getMyDispatchUiPreferences } from "@/actions/ui-settings"
import { CanvasCalendar } from "@/components/calendar/CanvasCalendar"
import { DispatchScheduleBoardClient } from "@/components/dispatch/DispatchScheduleBoardClient"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { AuthError, PermissionError, getActiveTenantContextWithPermissionOrThrow } from "@/lib/server-auth"

export default async function CalendarPage() {
    let userId: string
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("team:view")
        userId = ctx.user.id
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        if (error instanceof PermissionError) {
            return <div className="p-6 text-sm text-muted-foreground">无权限访问</div>
        }
        throw error
    }

    const now = new Date()
    const from = startOfWeek(now, { weekStartsOn: 1 })
    const to = addDays(from, 7)

    const [occRes, teamRes, dispatchUiRes] = await Promise.all([
        getEventOccurrencesInRange({ from, to, userIds: [userId] }),
        getTeamDirectory({ take: 300 }),
        getMyDispatchUiPreferences(),
    ])

    const seen = new Set<string>()
    const initialEvents = occRes.success
        ? occRes.data
              .map((o) => o.event)
              .filter((e) => {
                  if (seen.has(e.id)) return false
                  seen.add(e.id)
                  return true
              })
        : []

    const teamMembers = teamRes.success
        ? teamRes.data.map((m) => ({ id: m.id, name: m.name || m.email, avatarUrl: m.avatarUrl || null }))
        : []

    const scheduleMembers = teamRes.success
        ? teamRes.data.map((m) => ({
              id: m.id,
              name: m.name || m.email,
              role: m.title || m.role,
              avatarUrl: m.avatarUrl || null,
              status: m.status,
          }))
        : []

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_my_calendar",
            title: "我的日历",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 18, minW: 8, minH: 12 },
            content: (
                <div className="h-full min-h-0">
                    <CanvasCalendar initialEvents={initialEvents} currentUserId={userId} teamMembers={teamMembers} />
                </div>
            ),
        },
        {
            id: "b_team_schedule",
            title: "团队日程（调度视图）",
            chrome: "none",
            defaultSize: { w: 12, h: 16, minW: 8, minH: 10 },
            content: (
                <DispatchScheduleBoardClient
                    members={scheduleMembers}
                    currentUserId={userId}
                    initialSelectedIds={
                        dispatchUiRes.success ? dispatchUiRes.data.schedule.selectedUserIds : undefined
                    }
                />
            ),
        },
    ]

    return <SectionWorkspace title="日程安排" sectionId="calendar" catalog={catalog} className="h-full" />
}
