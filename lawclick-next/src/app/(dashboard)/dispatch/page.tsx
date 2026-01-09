import { redirect } from "next/navigation"
import { Bell } from "lucide-react"

import { getCaseKanbanCards } from "@/actions/case-kanban"
import { getUnassignedTasksForDispatch } from "@/actions/dispatch-tasks"
import { getMyInvites, getTeamStatus } from "@/actions/collaboration-actions"
import { getMyDispatchUiPreferences } from "@/actions/ui-settings"
import { AuthError, PermissionError, getActiveTenantContextWithPermissionOrThrow, requireTenantPermission } from "@/lib/server-auth"

import { DispatchScheduleBoardClient } from "@/components/dispatch/DispatchScheduleBoardClient"
import { DispatchTaskPoolClient } from "@/components/dispatch/DispatchTaskPoolClient"
import { PendingInvitesPanel } from "@/components/dispatch/PendingInvitesPanel"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { TeamHeatmap } from "@/components/features/TeamHeatmap"
import type { TeamMember } from "@/components/features/TeamHeatmap"
import { CaseKanban } from "@/components/features/CaseKanban"
import { Badge } from "@/components/ui/Badge"

export default async function DispatchPage() {
    let viewerId: string
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("task:edit")
        requireTenantPermission(ctx, "team:view")
        requireTenantPermission(ctx, "case:view")
        viewerId = ctx.user.id
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        if (error instanceof PermissionError) {
            return <div className="p-6 text-sm text-muted-foreground">无权限访问</div>
        }
        throw error
    }

    const [kanbanRes, unassignedRes, teamResult, invitesResult, dispatchUiRes] = await Promise.all([
        getCaseKanbanCards({ status: ["LEAD", "INTAKE"], take: 300 }),
        getUnassignedTasksForDispatch({ take: 120 }),
        getTeamStatus(),
        getMyInvites("received"),
        getMyDispatchUiPreferences(),
    ])

    const kanbanCases = kanbanRes.success ? kanbanRes.data : []
    const unassignedTasks = unassignedRes.success ? unassignedRes.data : []

    const teamMembers: TeamMember[] = teamResult.success ? teamResult.data : []
    const invites = invitesResult.success ? invitesResult.data : []
    const pendingInvites = invites.filter((i) => i.status === "PENDING")

    const scheduleMembers = teamMembers.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        avatarUrl: m.avatarUrl,
        status: m.status,
    }))

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_heatmap",
            title: "团队状态 · Live Heatmap",
            pinned: true,
            defaultSize: { w: 12, h: 9, minW: 8, minH: 7 },
            content: (
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                                {teamMembers.length} 在线
                            </Badge>
                            {pendingInvites.length > 0 ? (
                                <Badge variant="secondary" className="bg-primary/10 text-primary">
                                    <Bell className="h-3 w-3 mr-1" />
                                    {pendingInvites.length} 待处理邀请
                                </Badge>
                            ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">支持 30-300 人规模（分页 + 虚拟渲染）</div>
                    </div>
                    <TeamHeatmap members={teamMembers} myUserId={viewerId} />
                </div>
            ),
        },
        {
            id: "b_schedule",
            title: "团队日程调度板",
            defaultSize: { w: 12, h: 12, minW: 8, minH: 10 },
            content: (
                <DispatchScheduleBoardClient
                    members={scheduleMembers}
                    currentUserId={viewerId}
                    initialSelectedIds={
                        dispatchUiRes.success ? dispatchUiRes.data.schedule.selectedUserIds : undefined
                    }
                />
            ),
        },
        {
            id: "b_pending_invites",
            title: "待处理协作邀请",
            defaultSize: { w: 12, h: 6, minW: 6, minH: 5 },
            content: <PendingInvitesPanel invites={invites} />,
        },
        {
            id: "b_task_pool",
            title: "待分配任务池",
            defaultSize: { w: 12, h: 8, minW: 6, minH: 6 },
            content: <DispatchTaskPoolClient tasks={unassignedTasks} />,
        },
        {
            id: "b_case_pool",
            title: "待分配案件池",
            defaultSize: { w: 12, h: 14, minW: 8, minH: 12 },
            content: (
                <div className="h-full min-h-0 flex flex-col">
                    <div className="mb-3 text-xs text-muted-foreground">
                        先在案件池选择卡片，再到上方热力图为成员分配承办人/执行人。
                    </div>
                    <div className="flex-1 min-h-0 overflow-hidden">
                        <CaseKanban cases={kanbanCases} enableDispatchSelection />
                    </div>
                </div>
            ),
        },
    ]

    return <SectionWorkspace title="调度中心" catalog={catalog} className="h-full" />
}
