import type { ReactNode } from "react"
import Link from "next/link"
import { Activity, Briefcase, Calendar, CheckSquare, FileText, Users, Wrench } from "lucide-react"
import { addDays, startOfDay, startOfWeek } from "date-fns"
import { getDashboardData } from "@/actions/cases"
import { getCaseKanbanCards } from "@/actions/case-kanban"
import { getActiveTimer, getMyTimeSummary } from "@/actions/timelogs-crud"
import { FirmOverviewWidget } from "@/components/dashboard/widgets/FirmOverviewWidget"
import { MyTasksWidget } from "@/components/dashboard/widgets/MyTasksWidget"
import { RecentDocumentsWidget } from "@/components/dashboard/widgets/RecentDocumentsWidget"
import { TeamActivityWidget } from "@/components/dashboard/widgets/TeamActivityWidget"
import { TimeSummaryWidget } from "@/components/dashboard/widgets/TimeSummaryWidget"
import { UpcomingEventsWidget } from "@/components/dashboard/widgets/UpcomingEventsWidget"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { LegoDeck } from "@/components/layout/LegoDeck"
import { CaseKanban } from "@/components/features/CaseKanban"
import { NewCaseWizard } from "@/components/features/NewCaseWizard"
import { hasTenantPermission } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

function QuickActionCard(props: { title: string; description: string; href: string; icon: ReactNode }) {
    return (
        <Link href={props.href} className="block h-full">
            <div className="h-full rounded-lg border border-border/60 bg-card/50 p-3 hover:bg-card/70 transition-colors">
                <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        {props.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{props.title}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{props.description}</div>
                    </div>
                </div>
            </div>
        </Link>
    )
}

export default async function Dashboard() {
    const now = new Date()
    const todayFrom = startOfDay(now)
    const todayTo = addDays(todayFrom, 1)
    const weekFrom = startOfWeek(now, { weekStartsOn: 1 })
    const weekTo = addDays(weekFrom, 7)

    const [dashboardRes, activeTimer] = await Promise.all([getDashboardData(), getActiveTimer()])

    const { user, tasks, events, membershipRole } = dashboardRes.data
    const permCtx = { user, membership: { role: membershipRole } }

    const canViewCases = hasTenantPermission(permCtx, "case:view")
    const canViewDocuments = hasTenantPermission(permCtx, "document:view")
    const canViewDashboard = hasTenantPermission(permCtx, "dashboard:view")
    const canViewTasks = hasTenantPermission(permCtx, "task:view")
    const canViewTeam = hasTenantPermission(permCtx, "team:view")
    const canViewCrm = hasTenantPermission(permCtx, "crm:view")

    const [kanbanRes, todaySummaryRes, weekSummaryRes] = await Promise.all([
        canViewCases ? getCaseKanbanCards({ take: 200 }) : Promise.resolve({ success: true as const, data: [] }),
        canViewCases ? getMyTimeSummary({ from: todayFrom.toISOString(), to: todayTo.toISOString() }) : Promise.resolve(null),
        canViewCases ? getMyTimeSummary({ from: weekFrom.toISOString(), to: weekTo.toISOString() }) : Promise.resolve(null),
    ])

    const kanbanCases = kanbanRes.success ? kanbanRes.data : []

    const quickActionsCatalog: SectionCatalogItem[] = [
        ...(canViewCases
            ? [
                  {
                      id: "a_cases",
                      title: "案件中心",
                      chrome: "none" as const,
                      defaultSize: { w: 4, h: 3, minW: 3, minH: 3 },
                      content: (
                          <QuickActionCard
                              title="案件中心"
                              description="浏览在办/归档案件，进入案件详情与协作链路"
                              href="/cases"
                              icon={<Briefcase className="h-4 w-4" />}
                          />
                      ),
                  },
              ]
            : []),
        ...(canViewTasks
            ? [
                  {
                      id: "a_tasks",
                      title: "任务中心",
                      chrome: "none" as const,
                      defaultSize: { w: 4, h: 3, minW: 3, minH: 3 },
                      content: (
                          <QuickActionCard
                              title="任务中心"
                              description="看板拖拽、任务分配、计时联动与到期跟踪"
                              href="/tasks"
                              icon={<CheckSquare className="h-4 w-4" />}        
                          />
                      ),
                  },
              ]
            : []),
        ...(canViewDocuments
            ? [
                  {
                      id: "a_documents",
                      title: "文档中心",
                      chrome: "none" as const,
                      defaultSize: { w: 4, h: 3, minW: 3, minH: 3 },
                      content: (
                              <QuickActionCard
                              title="文档中心"
                              description="上传/预览/版本历史/规则审阅，按权限过滤"
                              href="/documents"
                              icon={<FileText className="h-4 w-4" />}
                          />
                      ),
                  },
              ]
            : []),
        ...(canViewTeam
            ? [
                  {
                      id: "a_calendar",
                      title: "日程安排",
                      chrome: "none" as const,
                      defaultSize: { w: 4, h: 3, minW: 3, minH: 3 },
                      content: (
                          <QuickActionCard
                              title="日程安排"
                              description="支持 30-300 人规模排期与可用性推荐"
                              href="/calendar"
                              icon={<Calendar className="h-4 w-4" />}
                          />
                      ),
                  },
                  {
                      id: "a_dispatch",
                      title: "调度中心",
                      chrome: "none" as const,
                      defaultSize: { w: 4, h: 3, minW: 3, minH: 3 },
                      content: (
                          <QuickActionCard
                              title="调度中心"
                              description="案件池与调度看板，支持分屏与浮窗"
                              href="/dispatch"
                              icon={<Activity className="h-4 w-4" />}
                          />
                      ),
                  },
              ]
            : []),
        ...(canViewCrm
            ? [
                  {
                      id: "a_crm",
                      title: "客户管理",
                      chrome: "none" as const,
                      defaultSize: { w: 4, h: 3, minW: 3, minH: 3 },
                      content: (
                          <QuickActionCard
                              title="客户管理"
                              description="客户详情、关联案件与合同文书"
                              href="/crm/customers"
                              icon={<Users className="h-4 w-4" />}
                          />
                      ),
                  },
              ]
            : []),
        ...(canViewDashboard
            ? [
                  {
                      id: "a_tools",
                      title: "工具箱",
                      chrome: "none" as const,
                      defaultSize: { w: 4, h: 3, minW: 3, minH: 3 },
                      content: (
                          <QuickActionCard
                              title="工具箱"
                              description="工具模块、调用记录与 WebHook 触发"
                              href="/tools"
                              icon={<Wrench className="h-4 w-4" />}
                          />
                      ),
                  },
              ]
            : []),
    ]

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_welcome",
            title: "欢迎与快捷入口",
            pinned: true,
            defaultSize: { w: 12, h: 6, minW: 8, minH: 5 },
            content: (
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-xs text-muted-foreground">欢迎回来</div>
                            <div className="text-xl font-semibold tracking-tight truncate">{user?.name || "用户"}</div>
                        </div>
                        <div className="flex items-center gap-2">
                            {hasTenantPermission(permCtx, "case:create") ? <NewCaseWizard /> : null}
                        </div>
                    </div>
                    {quickActionsCatalog.length ? (
                        <LegoDeck
                            title="快捷入口（可拖拽）"
                            sectionId="dashboard_quick_actions"
                            rowHeight={28}
                            margin={[12, 12]}
                            catalog={quickActionsCatalog}
                        />
                    ) : (
                        <div className="text-xs text-muted-foreground">暂无可用入口</div>
                    )}
                </div>
            ),
        },
        ...(canViewCases
            ? ([
                  {
                      id: "b_cases_kanban",
                      title: "案件看板",
                      defaultSize: { w: 8, h: 12, minW: 6, minH: 8 },
                      content: <CaseKanban cases={kanbanCases} />,
                  },
              ] satisfies SectionCatalogItem[])
            : []),
        {
            id: "b_my_tasks",
            title: "我的任务",
            defaultSize: { w: 4, h: 6, minW: 3, minH: 4 },
            content: <MyTasksWidget tasks={tasks} />,
        },
        {
            id: "b_upcoming_events",
            title: "近期日程",
            defaultSize: { w: 4, h: 6, minW: 3, minH: 4 },
            content: <UpcomingEventsWidget events={events} />,
        },
        ...(canViewCases
            ? ([
                  {
                      id: "b_time_summary",
                      title: "工时与计时",
                      defaultSize: { w: 6, h: 5, minW: 4, minH: 4 },
                      content: (
                          <TimeSummaryWidget
                              today={todaySummaryRes?.data || { totalHours: 0, billableHours: 0, count: 0 }}
                              week={weekSummaryRes?.data || { totalHours: 0, billableHours: 0, count: 0 }}
                              activeTimer={activeTimer}
                          />
                      ),
                  },
              ] satisfies SectionCatalogItem[])
            : []),
        ...(canViewDocuments
            ? ([
                  {
                      id: "b_recent_documents",
                      title: "最近文档",
                      defaultSize: { w: 4, h: 7, minW: 3, minH: 4 },
                      content: <RecentDocumentsWidget />,
                  },
              ] satisfies SectionCatalogItem[])
            : []),
        ...(canViewDashboard
            ? ([
                  {
                      id: "b_firm_overview",
                      title: "工作区概览",
                      defaultSize: { w: 6, h: 7, minW: 4, minH: 5 },
                      content: <FirmOverviewWidget />,
                  },
              ] satisfies SectionCatalogItem[])
            : []),
        ...(canViewTeam
            ? ([
                  {
                      id: "b_team_activity",
                      title: "团队动态",
                      defaultSize: { w: 6, h: 9, minW: 4, minH: 6 },
                      content: <TeamActivityWidget />,
                  },
              ] satisfies SectionCatalogItem[])
            : []),
    ]

    return (
        <div className="space-y-6">
            {!dashboardRes.success ? (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                    {dashboardRes.error}
                </div>
            ) : null}
            <SectionWorkspace title="仪表盘" catalog={catalog} />
        </div>
    )
}
