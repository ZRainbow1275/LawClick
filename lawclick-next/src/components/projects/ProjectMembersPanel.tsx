"use client"

import * as React from "react"
import { Loader2, Trash2, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

import { addProjectMember, removeProjectMember } from "@/actions/projects-crud"
import { logger } from "@/lib/logger"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"

type MemberItem = {
    id: string
    role: "OWNER" | "MEMBER" | "VIEWER"
    user: { id: string; name: string | null; email: string; avatarUrl: string | null }
}

const ROLE_LABELS: Record<MemberItem["role"], string> = {
    OWNER: "负责人",
    MEMBER: "成员",
    VIEWER: "观察",
}

export function ProjectMembersPanel(props: {
    projectId: string
    ownerId: string
    members: MemberItem[]
    canManage: boolean
}) {
    const { projectId, ownerId, members, canManage } = props
    const router = useRouter()
    const [email, setEmail] = React.useState("")
    const [busy, setBusy] = React.useState(false)

    const handleAdd = async () => {
        const trimmed = email.trim()
        if (!trimmed) {
            toast.error("请输入邮箱")
            return
        }
        setBusy(true)
        try {
            const res = await addProjectMember({ projectId, email: trimmed, role: "MEMBER" })
            if (!res.success) {
                toast.error("添加失败", { description: res.error })
                return
            }
            toast.success("成员已添加")
            setEmail("")
            router.refresh()
        } catch (error) {
            logger.error("Add project member error", error)
            toast.error("添加失败", { description: "请稍后重试" })
        } finally {
            setBusy(false)
        }
    }

    const handleRemove = async (userId: string) => {
        if (userId === ownerId) return
        setBusy(true)
        try {
            const res = await removeProjectMember(projectId, userId)
            if (!res.success) {
                toast.error("移除失败", { description: res.error })
                return
            }
            toast.success("成员已移除")
            router.refresh()
        } catch (error) {
            logger.error("Remove project member error", error)
            toast.error("移除失败", { description: "请稍后重试" })
        } finally {
            setBusy(false)
        }
    }

    return (
        <Card className="bg-card shadow-sm">
            <CardHeader className="pb-3">
                <CardTitle className="text-base">项目成员</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {canManage ? (
                    <div className="flex items-center gap-2">
                        <Input
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="输入成员邮箱..."
                            disabled={busy}
                        />
                        <Button onClick={handleAdd} disabled={busy} className="gap-1">
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                            添加
                        </Button>
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground">仅项目负责人或管理员可管理成员。</div>
                )}

                <div className="space-y-2">
                    {members.map((m) => (
                        <div
                            key={m.id}
                            className="flex items-center justify-between gap-2 rounded-lg border bg-card/60 px-3 py-2"
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={m.user.avatarUrl || undefined} />
                                    <AvatarFallback>{(m.user.name || m.user.email)[0]?.toUpperCase() || "U"}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                    <div className="text-sm font-medium truncate">
                                        {m.user.name || m.user.email.split("@")[0]}
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">{m.user.email}</div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs">
                                    {ROLE_LABELS[m.role]}
                                </Badge>
                                {canManage && m.user.id !== ownerId ? (
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                        onClick={() => void handleRemove(m.user.id)}
                                        disabled={busy}
                                        title="移除成员"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}
