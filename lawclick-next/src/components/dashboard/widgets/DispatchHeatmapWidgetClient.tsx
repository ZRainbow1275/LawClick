"use client"

import * as React from "react"
import Link from "next/link"
import { Bell, RefreshCw, Users } from "lucide-react"

import { getMyInvites, getTeamStatus } from "@/actions/collaboration-actions"
import { TeamHeatmap, type TeamMember } from "@/components/features/TeamHeatmap"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { subscribeDispatchRefresh } from "@/lib/dispatch-refresh"
import { logger } from "@/lib/logger"

type Invite = Extract<Awaited<ReturnType<typeof getMyInvites>>, { success: true }>["data"][number]

function countPendingInvites(invites: Invite[]) {
    return invites.filter((i) => i.status === "PENDING").length
}

function countOnlineMembers(members: TeamMember[]) {
    return members.filter((m) => m.status !== "OFFLINE").length
}

export function DispatchHeatmapWidgetClient(props?: {
    initialMembers?: TeamMember[]
    initialInvites?: Invite[]
    myUserId?: string
}) {
    const myUserId = props?.myUserId
    const [members, setMembers] = React.useState<TeamMember[]>(props?.initialMembers ?? [])
    const [pendingInvites, setPendingInvites] = React.useState(() => countPendingInvites(props?.initialInvites ?? []))
    const [loading, setLoading] = React.useState(props?.initialMembers ? false : true)
    const [error, setError] = React.useState<string | null>(null)

    const load = React.useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const [teamRes, invitesRes] = await Promise.all([getTeamStatus(), getMyInvites("received")])

            if (!teamRes.success) {
                setMembers([])
                setPendingInvites(0)
                setError(teamRes.error || "获取团队状态失败")
                return
            }

            setMembers(teamRes.data as TeamMember[])

            if (!invitesRes.success) {
                setPendingInvites(0)
                return
            }
            setPendingInvites(countPendingInvites(invitesRes.data as Invite[]))
        } catch (e) {
            logger.error("加载调度热力图失败", e)
            setMembers([])
            setPendingInvites(0)
            setError(e instanceof Error ? e.message : "加载失败")
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        if (props?.initialMembers) return
        void load()
    }, [load, props?.initialMembers])

    React.useEffect(() => subscribeDispatchRefresh(() => void load()), [load])

    const onlineCount = React.useMemo(() => countOnlineMembers(members), [members])

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                    <Users className="h-4 w-4" />
                    <span className="truncate">团队状态</span>
                    <Badge variant="secondary" className="shrink-0">
                        在线 {onlineCount}/{members.length}
                    </Badge>
                    {pendingInvites > 0 ? (
                        <Badge variant="outline" className="shrink-0 flex items-center gap-1">
                            <Bell className="h-3 w-3" />
                            {pendingInvites}
                        </Badge>
                    ) : null}
                    {loading ? <span className="text-xs">加载中…</span> : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7"
                        onClick={() => void load()}
                        disabled={loading}
                        title="刷新"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/dispatch">打开</Link>
                    </Button>
                </div>
            </div>

            {error ? <div className="text-sm text-destructive">加载失败：{error}</div> : null}
            {!loading && !error && members.length === 0 ? (
                <div className="text-sm text-muted-foreground">暂无可用成员</div>
            ) : null}

            <TeamHeatmap members={members} myUserId={myUserId} />

            <div className="text-xs text-muted-foreground">支持 30–300 人规模（搜索 + 分页）</div>
        </div>
    )
}
