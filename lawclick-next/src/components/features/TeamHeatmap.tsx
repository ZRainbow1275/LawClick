"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { GlassPanel } from "@/components/ui/GlassPanel"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/HoverCard"
import { Input } from "@/components/ui/Input"
import { Progress } from "@/components/ui/Progress"
import { Separator } from "@/components/ui/Separator"
import { useDispatchStore } from "@/store/dispatch-store"
import type { UserStatus } from "@/store/user-status-store"
import { cn } from "@/lib/utils"
import { assignCaseHandler } from "@/actions/cases-crud"
import { assignTask } from "@/actions/tasks-crud"
import { getToneRingClassName, getToneSoftClassName, getToneSolidClassName } from "@/lib/ui/tone"
import { USER_STATUS_CONFIG, getUserStatusMeta } from "@/lib/ui/user-status"
import { logger } from "@/lib/logger"
import { emitDispatchRefresh } from "@/lib/dispatch-refresh"
import { Briefcase, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "sonner"

export type TeamMember = {
    id: string
    name: string
    role: string
    avatarUrl?: string | null
    status: UserStatus
    statusMessage?: string | null
    currentTask?: string | null
    currentCase?: string | null
    todayHours?: number
    weeklyHours?: number
    activeCases?: number
    completedToday?: number
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n))
}

function computeLoadScore(member: TeamMember) {
    const todayHours = member.todayHours || 0
    const weeklyHours = member.weeklyHours || 0
    const activeCases = member.activeCases || 0
    const completedToday = member.completedToday || 0

    const timeScore = clamp(Math.round((todayHours / 8) * 55), 0, 55)
    const caseScore = clamp(activeCases * 5, 0, 25)
    const doneScore = clamp(completedToday * 3, 0, 15)
    const intensity = member.status === "AVAILABLE" || member.status === "OFFLINE" ? 0 : 10
    const weeklyPenalty = weeklyHours > 45 ? 10 : 0

    return clamp(timeScore + caseScore + doneScore + intensity + weeklyPenalty, 0, 100)
}

function MemberHoverCard({ member, children }: { member: TeamMember; children: React.ReactNode }) {
    const config = getUserStatusMeta(member.status || "AVAILABLE")
    const loadScore = computeLoadScore(member)

    return (
        <HoverCard openDelay={300} closeDelay={100}>
            <HoverCardTrigger asChild>{children}</HoverCardTrigger>
            <HoverCardContent className="w-72" side="right" align="start">
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                            <AvatarImage src={member.avatarUrl || undefined} />
                            <AvatarFallback>{member.name?.[0] || "U"}</AvatarFallback>
                        </Avatar>
                        <div>
                            <p className="font-semibold">{member.name}</p>
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[10px]">
                                    {member.role}
                                </Badge>
                                <Badge variant={config.tone} className="text-[10px]">
                                    {config.label}
                                </Badge>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">当前状态</p>
                        {member.currentTask ? (
                            <div className="space-y-1">
                                <p className="text-sm font-medium">{member.currentTask}</p>
                                {member.currentCase ? (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Briefcase className="h-3 w-3" />
                                        {member.currentCase}
                                    </p>
                                ) : null}
                                {member.statusMessage ? (
                                    <p className="text-xs text-muted-foreground">{member.statusMessage}</p>
                                ) : null}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">暂无进行中任务</p>
                        )}
                    </div>

                    <Separator />

                    <div className="grid gap-3 [grid-template-columns:repeat(2,minmax(0,1fr))]">
                        <div>
                            <p className="text-xs text-muted-foreground">今日工时</p>
                            <p className="text-sm font-medium">{member.todayHours || 0}h</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">本周工时</p>
                            <p className="text-sm font-medium">{member.weeklyHours || 0}h</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">活跃案件</p>
                            <p className="text-sm font-medium">{member.activeCases || 0} 件</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">今日完成</p>
                            <p className="text-sm font-medium">{member.completedToday || 0} 项</p>
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <p className="text-xs text-muted-foreground">工作负载</p>
                            <p className="text-xs font-medium">{loadScore}%</p>
                        </div>
                        <Progress value={loadScore} className="h-1.5" />
                    </div>

                    <div className="flex justify-end">
                        <Button asChild size="sm" variant="outline">
                            <Link href={`/team/${member.id}/card`}>查看名片</Link>
                        </Button>
                    </div>
                </div>
            </HoverCardContent>
        </HoverCard>
    )
}

export function TeamHeatmap({ members, myUserId }: { members: TeamMember[]; myUserId?: string }) {
    const router = useRouter()
    const { selection, clearSelection } = useDispatchStore()
    const [query, setQuery] = React.useState("")
    const [statusFilter, setStatusFilter] = React.useState<UserStatus | "ALL">("ALL")
    const [page, setPage] = React.useState(0)
    const [assigningTo, setAssigningTo] = React.useState<string | null>(null)

    const pageSize = members.length > 80 ? 60 : 10_000

    const filteredOrdered = React.useMemo(() => {
        const q = query.trim().toLowerCase()
        const list = members
            .filter((m) => {
                if (statusFilter !== "ALL" && m.status !== statusFilter) return false
                if (!q) return true
                const hay = `${m.name || ""} ${m.role || ""} ${m.statusMessage || ""}`.toLowerCase()
                return hay.includes(q)
            })
            .slice()

        list.sort((a, b) => {
            if (myUserId && a.id === myUserId) return -1
            if (myUserId && b.id === myUserId) return 1
            return a.name.localeCompare(b.name)
        })
        return list
    }, [members, myUserId, query, statusFilter])

    const totalPages = Math.max(1, Math.ceil(filteredOrdered.length / pageSize))
    const safePage = Math.max(0, Math.min(page, totalPages - 1))
    const pagedMembers = filteredOrdered.slice(safePage * pageSize, safePage * pageSize + pageSize)

    React.useEffect(() => {
        if (page !== safePage) setPage(safePage)
    }, [page, safePage])

    const doAssign = async (member: TeamMember) => {
        if (!selection) {
            toast.info("请先选择一个卡片", { description: "可从下方案件池选择要分配的案件（或后续扩展任务）。" })
            return
        }

        setAssigningTo(member.id)
        try {
            if (selection.type === "CASE") {
                const res = await assignCaseHandler(selection.id, member.id)
                if (!res.success) {
                    toast.error("分配失败", { description: res.error })
                    return
                }
                toast.success(`已分配承办人：${member.name}`, { description: selection.title })
            } else {
                const res = await assignTask(selection.id, member.id)
                if (!res.success) {
                    toast.error("分配失败", { description: res.error })
                    return
                }
                toast.success(`已分配任务：${member.name}`, { description: selection.title })
            }

            clearSelection()
            emitDispatchRefresh("assignment")
            router.refresh()
        } catch (error) {
            logger.error("调度分配失败", error, { assignTo: member.id, selection })
            toast.error("分配失败", { description: "操作失败，请稍后重试。" })
        } finally {
            setAssigningTo(null)
        }
    }

    const handleAssign = (member: TeamMember) => {
        if (!selection) {
            toast.info("请先选择一个卡片", { description: "即刻分配：请先在下方案件池中选择一个卡片。" })
            return
        }

        if (assigningTo) return

        const run = () => void doAssign(member)

        if (member.status === "FOCUS") {
            toast.warning(`${member.name} 正在深度工作中`, {
                description: "建议先安排会议/留言，避免强行打断。",
                action: { label: "仍然分配", onClick: run },
            })
            return
        }

        if (member.status === "BUSY" || member.status === "MEETING" || member.status === "AWAY") {
            toast.info(`${member.name} 当前不可用`, { description: "仍可分配为承办人/执行人（后续可联动提醒）。" })
        }

        run()
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="搜索成员/角色/状态..."
                        className="w-full md:w-64"
                    />
                    <div className="flex items-center gap-1 text-xs">
                        <Button
                            variant={statusFilter === "ALL" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setStatusFilter("ALL")}
                            className="h-8"
                        >
                            全部
                        </Button>
                        {Object.entries(USER_STATUS_CONFIG).map(([key, meta]) => (
                            <Button
                                key={key}
                                variant={statusFilter === (key as UserStatus) ? "default" : "outline"}
                                size="sm"
                                onClick={() => setStatusFilter(key as UserStatus)}
                                className="h-8"
                                title={meta.label}
                            >
                                {meta.label}
                            </Button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-2">
                    <Badge variant="secondary" className="text-xs">
                        显示 {pagedMembers.length} / {filteredOrdered.length}（团队 {members.length}）
                    </Badge>
                    {totalPages > 1 ? (
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="icon-sm"
                                className="h-8 w-8"
                                onClick={() => setPage((p) => Math.max(0, p - 1))}
                                disabled={safePage <= 0}
                                title="上一页"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <div className="text-xs text-muted-foreground min-w-[64px] text-center">
                                {safePage + 1} / {totalPages}
                            </div>
                            <Button
                                variant="outline"
                                size="icon-sm"
                                className="h-8 w-8"
                                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                                disabled={safePage >= totalPages - 1}
                                title="下一页"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : null}
                </div>
            </div>

            {selection ? (
                <GlassPanel intensity="low" className="p-3 flex items-center justify-between">
                    <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">待分配</div>
                        <div className="font-medium truncate">
                            {selection.type === "CASE" ? "案件" : "任务"}：{selection.title}
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={clearSelection}>
                        清除
                    </Button>
                </GlassPanel>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pagedMembers.map((member) => {
                const config = getUserStatusMeta(member.status || "AVAILABLE")
                const StatusIcon = config.icon
                const loadScore = computeLoadScore(member)
                const busy = Boolean(assigningTo && assigningTo === member.id)

                return (
                    <MemberHoverCard key={member.id} member={member}>
                        <GlassPanel
                            intensity="low"
                            className={cn(
                                "p-4 flex items-center justify-between group transition-all hover:scale-[1.02] cursor-pointer",
                                selection ? "hover:border-primary border-dashed border-2 bg-primary/5" : "hover:border-primary/50",
                                busy && "opacity-70 pointer-events-none"
                            )}
                            title={selection ? `分配给 ${member.name}` : "查看详情"}
                            onClick={() => handleAssign(member)}
                        >
                            <div className="flex items-center gap-4">
                                <div className="relative">
                                    <Avatar className="h-12 w-12 ring-2 ring-white/10 group-hover:ring-primary/40 transition-all">
                                        <AvatarImage src={member.avatarUrl || undefined} />
                                        <AvatarFallback>{member.name?.[0] || "U"}</AvatarFallback>
                                    </Avatar>
                                    <div
                                        className={cn(
                                            "absolute inset-0 rounded-full ring-2 ring-offset-2 ring-offset-background transition-colors",
                                            getToneRingClassName(config.tone),
                                            member.status === "FOCUS" && "animate-pulse"
                                        )}
                                    />
                                    <div
                                        className={cn(
                                            "absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-background flex items-center justify-center text-[8px] font-bold",
                                            getToneSolidClassName(config.tone)
                                        )}
                                    >
                                        <StatusIcon className="h-2 w-2" />
                                    </div>
                                </div>
                                <div>
                                    <div className="font-semibold text-base group-hover:text-primary transition-colors">{member.name}</div>
                                    <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                                        <Badge
                                            variant="secondary"
                                            className="text-[10px] h-4 px-1 rounded-sm bg-card/10 border-border/20 text-muted-foreground"
                                        >
                                            {member.role}
                                        </Badge>
                                        {member.currentTask && member.status !== "FOCUS" ? (
                                            <span className="text-muted-foreground truncate max-w-28">{member.currentTask}</span>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col items-end gap-1">
                                <Badge
                                    variant="outline"
                                    className={cn(
                                        "gap-1.5 font-medium",
                                        getToneSoftClassName(config.tone)
                                    )}
                                >
                                    {config.label}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground font-mono">LOAD: {loadScore}%</span>
                            </div>
                        </GlassPanel>
                    </MemberHoverCard>
                )
            })}
            </div>
        </div>
    )
}
