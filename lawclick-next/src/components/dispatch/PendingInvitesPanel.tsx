"use client"

import * as React from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Bell, CheckCircle2, XCircle } from "lucide-react"

import { respondToInvite } from "@/actions/collaboration-actions"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent } from "@/components/ui/Card"
import { emitDispatchRefresh } from "@/lib/dispatch-refresh"

type Invite = {
    id: string
    type: "CASE" | "TASK" | "MEETING"
    status: "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED"
    message?: string | null
    sender?: { id: string; name: string | null; avatarUrl: string | null } | null
    target?: { id: string; title: string; startTime?: string | Date | null } | null
}

function formatInviteTitle(invite: Invite) {
    if (invite.type === "MEETING") return "会议"
    if (invite.type === "TASK") return "任务"
    if (invite.type === "CASE") return "案件"
    return "协作"
}

export function PendingInvitesPanel({
    invites,
    showTitle = true,
    maxItems = 6,
    onAfterRespond,
}: {
    invites: Invite[]
    showTitle?: boolean
    maxItems?: number
    onAfterRespond?: () => void
}) {
    const router = useRouter()
    const [busyId, setBusyId] = React.useState<string | null>(null)

    const pendingInvites = invites.filter((i) => i.status === "PENDING")
    if (pendingInvites.length === 0) return null

    const handle = async (inviteId: string, accept: boolean) => {
        setBusyId(inviteId)
        try {
            const res = await respondToInvite(inviteId, accept)
            if (!res.success) {
                toast.error("操作失败", { description: res.error })
                return
            }
            toast.success(accept ? "已接受邀请" : "已拒绝邀请")
            router.refresh()
            emitDispatchRefresh("invite")
            onAfterRespond?.()
        } finally {
            setBusyId(null)
        }
    }

    return (
        <section className="space-y-3">
            {showTitle ? (
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Bell className="h-4 w-4" />
                        待处理的协作邀请
                    </h2>
                    <Badge variant="secondary" className="bg-primary/10 text-primary">
                        {pendingInvites.length} 待处理
                    </Badge>
                </div>
            ) : null}

            <div className="grid gap-2">
                {pendingInvites.slice(0, maxItems).map((invite) => {
                    const targetTitle = invite.target?.title
                    const targetTime =
                        invite.type === "MEETING" && invite.target?.startTime   
                            ? `${new Date(invite.target.startTime).toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`
                            : null

                    return (
                        <Card key={invite.id} className="bg-card/50">
                            <CardContent className="p-4 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-medium truncate">
                                        {invite.sender?.name || "未知"} 邀请您加入{formatInviteTitle(invite)}
                                        {targetTitle ? `：${targetTitle}` : ""}
                                    </p>
                                    {targetTime ? <p className="text-sm text-muted-foreground">{targetTime}</p> : null}
                                    {invite.message ? <p className="text-sm text-muted-foreground">{invite.message}</p> : null}
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="gap-1 hover:bg-success/10 hover:text-success"
                                        disabled={busyId === invite.id}
                                        onClick={() => handle(invite.id, true)}
                                    >
                                        <CheckCircle2 className="h-4 w-4" /> 接受
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="gap-1 hover:bg-destructive/10 hover:text-destructive"
                                        disabled={busyId === invite.id}
                                        onClick={() => handle(invite.id, false)}
                                    >
                                        <XCircle className="h-4 w-4" /> 拒绝
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </section>
    )
}
