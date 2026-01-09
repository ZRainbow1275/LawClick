"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { Badge } from "@/components/ui/Badge"
import { Plus, X } from "lucide-react"
import { addCaseMember, removeCaseMember } from "@/actions/members"
import { CreateCollaborationInviteDialog } from "@/components/collaboration/CreateCollaborationInviteDialog"
import { usePermission } from "@/hooks/use-permission"
import { toast } from "sonner"
import type { CaseRole } from "@/lib/prisma-browser"

interface CaseTeamCardProps {
    caseId: string
    owner: {
        id: string
        name?: string | null
        email?: string | null
        image?: string | null
    } | null
    members: Array<{
        role: string
        user: {
            id: string
            name?: string | null
            email?: string | null
            image?: string | null
        }
    }>
    currentUserId?: string
}

export function CaseTeamCard({ caseId, owner, members, currentUserId }: CaseTeamCardProps) {
    const { can } = usePermission()
    const [isInviteOpen, setIsInviteOpen] = useState(false)
    const [email, setEmail] = useState("")
    const [role, setRole] = useState("VIEWER")
    const [loading, setLoading] = useState(false)

    const isOwner = Boolean(owner && currentUserId && currentUserId === owner.id)
    const canInviteCollaboration = can("team:view") && can("case:assign")
    const excludedUserIds = [currentUserId, owner?.id, ...members.map((m) => m.user.id)].filter(
        (v): v is string => typeof v === "string" && v.length > 0
    )

    const roleLabel = (role: string) => {
        const map: Record<CaseRole, string> = {
            OWNER: "负责人",
            HANDLER: "承办人",
            MEMBER: "成员",
            VIEWER: "观察者",
        }
        return map[role as CaseRole] ?? role
    }

    const handleInvite = async () => {
        if (!email) return
        setLoading(true)
        try {
            const formData = new FormData()
            formData.append("caseId", caseId)
            formData.append("email", email)
            formData.append("role", role)

            const result = await addCaseMember(formData)
            if (!result.success) {
                toast.error(result.error)
            } else {
                toast.success("邀请成功")
                setIsInviteOpen(false)
                setEmail("")
            }
        } catch {
            toast.error("邀请失败")
        } finally {
            setLoading(false)
        }
    }

    const handleRemove = async (userId: string) => {
        if (!confirm("确定要移除该成员吗？")) return
        try {
            const result = await removeCaseMember(caseId, userId)
            if (!result.success) {
                toast.error(result.error)
            } else {
                toast.success("移除成功")
            }
        } catch {
            toast.error("操作失败")
        }
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base font-bold">项目成员</CardTitle>
                <div className="flex items-center gap-2">
                    {canInviteCollaboration ? (
                        <CreateCollaborationInviteDialog
                            type="CASE"
                            targetId={caseId}
                            excludeUserIds={excludedUserIds}
                            trigger={
                                <Button size="sm" variant="outline" className="h-8">
                                    邀请协作
                                </Button>
                            }
                        />
                    ) : null}
                    {isOwner && (
                        <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" variant="outline" className="h-8">
                                <Plus className="h-3 w-3 mr-1" /> 邀请
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>邀请新成员关联案件</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="flex items-center gap-4">
                                    <Label htmlFor="email" className="w-16 text-right">
                                        邮箱
                                    </Label>
                                    <Input
                                        id="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="例如：lawyer@example.com"
                                        className="flex-1"
                                    />
                                </div>
                                <div className="flex items-center gap-4">
                                    <Label htmlFor="role" className="w-16 text-right">
                                        角色
                                    </Label>
                                    <div className="flex-1">
                                        <Select value={role} onValueChange={setRole}>
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="选择角色" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="VIEWER">观察者 (只读)</SelectItem>
                                                <SelectItem value="MEMBER">协作者 (可编辑)</SelectItem>
                                                <SelectItem value="OWNER">管理员 (完全权限)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsInviteOpen(false)}>取消</Button>
                                <Button onClick={handleInvite} disabled={loading}>{loading ? "发送中..." : "发送邀请"}</Button>
                            </DialogFooter>
                        </DialogContent>
                        </Dialog>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Owner */}
                {owner ? (
                    <div className="flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                                <AvatarImage src={owner.image || ""} />
                                <AvatarFallback>{owner.name?.[0] || "O"}</AvatarFallback>
                            </Avatar>
                            <div>
                                <div className="text-sm font-medium leading-none">{owner.name}</div>
                                <div className="text-xs text-muted-foreground">负责人</div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">未设置负责人</div>
                    </div>
                )}

                {/* Members */}
                {members.map((member) => (
                    <div key={member.user.id} className="flex items-center justify-between group">
                        <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                                <AvatarImage src={member.user.image || ""} />
                                <AvatarFallback>{member.user.name?.[0] || "U"}</AvatarFallback>
                            </Avatar>
                            <div>
                                <div className="text-sm font-medium leading-none">{member.user.name}</div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <Badge variant="outline" className="text-[10px] h-4 px-1 py-0">
                                    {roleLabel(member.role)}
                                </Badge>
                                </div>
                            </div>
                        </div>
                        {isOwner && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                onClick={() => handleRemove(member.user.id)}
                                aria-label="移除成员"
                                title="移除成员"
                            >
                                <X className="h-3 w-3" />
                            </Button>
                        )}
                    </div>
                ))}

                {members.length === 0 && (
                    <div className="text-xs text-center text-muted-foreground py-2">
                        暂无其他成员
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
