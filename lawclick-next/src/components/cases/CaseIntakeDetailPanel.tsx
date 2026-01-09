import Link from "next/link"
import { Calendar, ExternalLink, ListTodo, Users } from "lucide-react"
import type { CaseDetailsPayload } from "@/lib/cases/case-detail-view-model"
import { getCaseStatusMeta } from "@/lib/cases/case-status-meta"
import { TASK_STATUS_LABELS } from "@/lib/tasks/task-status-labels"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar"
import { Badge } from "@/components/ui/Badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { LegoDeck } from "@/components/layout/LegoDeck"
import { Separator } from "@/components/ui/Separator"
import { cn } from "@/lib/utils"

export function CaseIntakeDetailPanel(props: { caseItem: CaseDetailsPayload }) {
    const { caseItem } = props

    const status = getCaseStatusMeta(caseItem.status)
    const now = new Date()

    const openTotal = caseItem.taskStats.openTotal
    const openTasks = caseItem.openTasksPreview || []
    const openBadgeText =
        openTotal > openTasks.length ? `${openTasks.length}/${openTotal}` : `${openTotal}`

    const upcomingEvents = (caseItem.events || [])
        .filter((e) => e.status === "SCHEDULED" && new Date(e.startTime).getTime() >= now.getTime())
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
        .slice(0, 6)

    const members = (caseItem.members || []).map((m) => m.user).filter(Boolean)

    return (
        <LegoDeck
            title="立案详情（可拖拽）"
            sectionId="case_intake_detail_panel"
            entityId={caseItem.id}
            rowHeight={30}
            margin={[12, 12]}
            catalog={[
                {
                    id: "b_case_intake_summary",
                    title: "案件信息",
                    pinned: true,
                    chrome: "none",
                    defaultSize: { w: 12, h: 10, minW: 6, minH: 8 },
                    content: (
                        <Card className="h-full bg-card shadow-sm">
                            <CardHeader className="space-y-2">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-xs text-muted-foreground">
                                            {caseItem.caseCode || "—"}
                                        </div>
                                        <CardTitle className="text-lg truncate">{caseItem.title}</CardTitle>
                                        <div className="mt-1 text-sm text-muted-foreground truncate">
                                            客户：{caseItem.client?.name || "未知客户"}
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-2 shrink-0">
                                        <Badge variant={status.badgeVariant}>{status.label}</Badge>
                                        <Link
                                            href={`/cases/${caseItem.id}`}
                                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                        >
                                            打开完整详情 <ExternalLink className="h-3 w-3" />
                                        </Link>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground space-y-2">
                                {caseItem.description ? (
                                    <div className="whitespace-pre-wrap">{caseItem.description}</div>
                                ) : null}
                                <div className="text-xs">
                                    最近更新：{new Date(caseItem.updatedAt).toLocaleString("zh-CN")}
                                </div>
                            </CardContent>
                        </Card>
                    ),
                },
                {
                    id: "b_case_intake_open_tasks",
                    title: "待办任务",
                    pinned: true,
                    chrome: "none",
                    defaultSize: { w: 6, h: 12, minW: 6, minH: 10 },
                    content: (
                        <Card className="h-full bg-card shadow-sm">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <ListTodo className="h-4 w-4 text-primary" />
                                    待办任务
                                    <Badge variant="secondary" className="text-xs">
                                        {openBadgeText}
                                    </Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {openTasks.length === 0 ? (
                                    <div className="text-sm text-muted-foreground">暂无待办任务</div>
                                ) : (
                                    openTasks.map((t) => (
                                        <div key={t.id} className="rounded-lg border bg-card/50 px-3 py-2">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium truncate">{t.title}</div>
                                                    {t.dueDate ? (
                                                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                                            <Calendar className="h-3 w-3" />
                                                            {new Date(t.dueDate).toLocaleDateString("zh-CN")}
                                                        </div>
                                                    ) : null}
                                                </div>
                                                <Badge variant="outline" className="text-[10px] shrink-0">
                                                    {TASK_STATUS_LABELS[t.status] || t.status}
                                                </Badge>
                                            </div>
                                        </div>
                                    ))
                                )}
                                {openTotal > openTasks.length ? (
                                    <Link
                                        href={`/cases/${caseItem.id}?tab=tasks`}
                                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline pt-2"
                                    >
                                        查看全部任务 <ExternalLink className="h-3 w-3" />
                                    </Link>
                                ) : null}
                            </CardContent>
                        </Card>
                    ),
                },
                {
                    id: "b_case_intake_upcoming_events",
                    title: "近期日程",
                    pinned: true,
                    chrome: "none",
                    defaultSize: { w: 6, h: 12, minW: 6, minH: 10 },
                    content: (
                        <Card className="h-full bg-card shadow-sm">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-info" />
                                    近期日程
                                    <Badge variant="secondary" className="text-xs">
                                        {upcomingEvents.length}
                                    </Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {upcomingEvents.length === 0 ? (
                                    <div className="text-sm text-muted-foreground">暂无近期日程</div>
                                ) : (
                                    upcomingEvents.map((e) => (
                                        <div key={e.id} className="rounded-lg border bg-card/50 px-3 py-2">
                                            <div className="text-sm font-medium truncate">{e.title}</div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                {new Date(e.startTime).toLocaleString("zh-CN", {
                                                    month: "2-digit",
                                                    day: "2-digit",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                })}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </CardContent>
                        </Card>
                    ),
                },
                {
                    id: "b_case_intake_members",
                    title: "团队成员",
                    pinned: true,
                    chrome: "none",
                    defaultSize: { w: 12, h: 12, minW: 6, minH: 10 },
                    content: (
                        <Card className="h-full bg-card shadow-sm">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Users className="h-4 w-4 text-success" />
                                    团队成员
                                    <Badge variant="secondary" className="text-xs">
                                        {members.length}
                                    </Badge>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {members.length === 0 ? (
                                    <div className="text-sm text-muted-foreground">暂无成员</div>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {members.slice(0, 12).map((u) => (
                                            <div
                                                key={u.id}
                                                className="flex items-center gap-2 rounded-full border bg-card px-2 py-1"
                                            >
                                                <Avatar className="h-6 w-6">
                                                    <AvatarImage src={u.avatarUrl || undefined} />
                                                    <AvatarFallback>{(u.name || u.email)[0]?.toUpperCase() || "U"}</AvatarFallback>
                                                </Avatar>
                                                <div className="text-xs text-muted-foreground truncate max-w-28">
                                                    {u.name || u.email.split("@")[0]}
                                                </div>
                                            </div>
                                        ))}
                                        {members.length > 12 ? (
                                            <div className={cn("text-xs text-muted-foreground flex items-center px-2")}>
                                                +{members.length - 12}
                                            </div>
                                        ) : null}
                                    </div>
                                )}
                                <Separator className="my-4" />
                                <div className="text-xs text-muted-foreground">
                                    提示：立案审查阶段建议先完成利益冲突检查、明确承办人与团队成员，再推进阶段任务与文书模板初始化。
                                </div>
                            </CardContent>
                        </Card>
                    ),
                },
            ]}
        />
    )
}
