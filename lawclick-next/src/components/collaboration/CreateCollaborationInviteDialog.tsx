"use client"

import * as React from "react"
import { toast } from "sonner"
import { Loader2, Search, Send, UserPlus } from "lucide-react"
import { createCollaborationInvite } from "@/actions/collaboration-actions"
import { getTeamDirectory } from "@/actions/team-directory"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Textarea } from "@/components/ui/Textarea"
import { cn } from "@/lib/utils"

export type CollaborationInviteType = "CASE" | "TASK"

export type CollaborationInviteCandidate = {
    id: string
    name: string | null
    email: string
    avatarUrl?: string | null
    role?: string | null
    department?: string | null
    title?: string | null
    isActive?: boolean
}

const DEFAULT_TAKE = 200
const SEARCH_DEBOUNCE_MS = 250

function formatCandidateLabel(candidate: CollaborationInviteCandidate) {
    const name = candidate.name?.trim()
    if (name) return name
    return candidate.email.split("@")[0] || candidate.email
}

function isNonEmptyString(value: string) {
    return Boolean(value && value.trim().length > 0)
}

export function CreateCollaborationInviteDialog(props: {
    type: CollaborationInviteType
    targetId: string
    trigger?: React.ReactNode
    triggerLabel?: string
    candidates?: CollaborationInviteCandidate[]
    excludeUserIds?: string[]
    defaultReceiverId?: string
    defaultMessage?: string
    onSent?: (result: { receiverId: string }) => void
}) {
    const {
        type,
        targetId,
        trigger,
        triggerLabel = "邀请协作",
        candidates: candidatesProp,
        excludeUserIds,
        defaultReceiverId,
        defaultMessage,
        onSent,
    } = props

    const providedCandidates = React.useMemo(() => (candidatesProp?.length ? candidatesProp : null), [candidatesProp])
    const excludedIds = React.useMemo(() => new Set((excludeUserIds || []).filter(isNonEmptyString)), [excludeUserIds])

    const [open, setOpen] = React.useState(false)
    const [query, setQuery] = React.useState("")
    const [loadingCandidates, setLoadingCandidates] = React.useState(false)
    const [candidates, setCandidates] = React.useState<CollaborationInviteCandidate[]>(providedCandidates || [])
    const [candidatesTotal, setCandidatesTotal] = React.useState<number | null>(providedCandidates ? providedCandidates.length : null)
    const [receiverId, setReceiverId] = React.useState(defaultReceiverId || "")
    const [message, setMessage] = React.useState(defaultMessage || "")
    const [sending, setSending] = React.useState(false)

    const requestVersionRef = React.useRef(0)

    React.useEffect(() => {
        if (!open) return

        setQuery("")
        setReceiverId(defaultReceiverId || "")
        setMessage(defaultMessage || "")

        if (providedCandidates) {
            setCandidates(providedCandidates)
            setCandidatesTotal(providedCandidates.length)
        } else {
            setCandidates([])
            setCandidatesTotal(null)
        }
    }, [open, defaultMessage, defaultReceiverId, providedCandidates])

    React.useEffect(() => {
        if (!open) return
        if (providedCandidates) return

        const version = ++requestVersionRef.current
        const q = query.trim()

        const handle = setTimeout(() => {
            setLoadingCandidates(true)
            getTeamDirectory({ query: q || undefined, take: DEFAULT_TAKE })
                .then((res) => {
                    if (version !== requestVersionRef.current) return
                    if (!res.success) {
                        setCandidates([])
                        setCandidatesTotal(0)
                        toast.error("加载团队成员失败", { description: res.error })
                        return
                    }
                    const filtered = res.data.filter((u) => !excludedIds.has(u.id))
                    setCandidates(filtered)
                    setCandidatesTotal(res.total)
                })
                .catch(() => {
                    if (version !== requestVersionRef.current) return
                    setCandidates([])
                    setCandidatesTotal(0)
                    toast.error("加载团队成员失败")
                })
                .finally(() => {
                    if (version !== requestVersionRef.current) return
                    setLoadingCandidates(false)
                })
        }, SEARCH_DEBOUNCE_MS)

        return () => clearTimeout(handle)
    }, [excludedIds, open, providedCandidates, query])

    const filteredCandidates = React.useMemo(() => {
        if (!providedCandidates) return candidates

        const q = query.trim().toLowerCase()
        const list = providedCandidates.filter((c) => !excludedIds.has(c.id))
        if (!q) return list

        return list.filter((c) => {
            const hay = `${c.name || ""} ${c.email || ""} ${c.role || ""} ${c.department || ""} ${c.title || ""}`.toLowerCase()
            return hay.includes(q)
        })
    }, [candidates, excludedIds, providedCandidates, query])

    const selected = React.useMemo(() => filteredCandidates.find((c) => c.id === receiverId) || null, [filteredCandidates, receiverId])

    const canSend = Boolean(receiverId) && !sending

    const handleSend = async () => {
        if (!receiverId) {
            toast.error("请选择接收人")
            return
        }
        if (!targetId) {
            toast.error("缺少目标对象")
            return
        }

        const cleanMessage = message.trim()
        setSending(true)
        try {
            const res = await createCollaborationInvite(type, targetId, receiverId, cleanMessage || undefined)
            if (!res.success) {
                toast.error("发送失败", { description: res.error })
                return
            }
            toast.success("协作邀请已发送")
            onSent?.({ receiverId })
            setOpen(false)
        } catch {
            toast.error("发送失败")
        } finally {
            setSending(false)
        }
    }

    const title = type === "CASE" ? "邀请加入案件协作" : "邀请接手任务"
    const helperText = type === "CASE" ? "对方接受后会加入案件成员，并同步加入案件群聊。" : "对方接受后会成为该任务的负责人。"

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger ? (
                    trigger
                ) : (
                    <Button variant="outline" size="sm" className="gap-1">
                        <UserPlus className="h-4 w-4" />
                        {triggerLabel}
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="text-sm text-muted-foreground">{helperText}</div>

                    <div className="grid gap-2">
                        <label className="text-sm font-medium">选择接收人</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={providedCandidates ? "搜索姓名/邮箱/角色..." : "搜索团队成员（按姓名/邮箱/部门）..."}
                                className="pl-9"
                            />
                        </div>

                        <div className="rounded-lg border bg-card/50">
                            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                                <div className="text-xs text-muted-foreground">
                                    {loadingCandidates
                                        ? "加载中..."
                                        : `候选人数：${filteredCandidates.length}${
                                              candidatesTotal !== null && candidatesTotal > DEFAULT_TAKE ? "（可继续搜索）" : ""
                                          }`}
                                </div>
                                {selected ? (
                                    <Badge variant="secondary" className="text-xs">
                                        已选择：{formatCandidateLabel(selected)}
                                    </Badge>
                                ) : null}
                            </div>
                            <div className="max-h-[280px] overflow-auto p-2">
                                {loadingCandidates ? (
                                    <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        加载成员...
                                    </div>
                                ) : filteredCandidates.length === 0 ? (
                                    <div className="p-3 text-sm text-muted-foreground">暂无匹配成员</div>
                                ) : (
                                    <div className="space-y-1">
                                        {filteredCandidates.map((c) => {
                                            const active = c.id === receiverId
                                            return (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    onClick={() => setReceiverId(c.id)}
                                                    className={cn(
                                                        "w-full flex items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors",
                                                        active
                                                            ? "border-primary/40 bg-primary/5"
                                                            : "border-transparent hover:border-border hover:bg-muted/30"
                                                    )}
                                                >
                                                    <Avatar className="h-8 w-8">
                                                        <AvatarImage src={c.avatarUrl || undefined} />
                                                        <AvatarFallback>{formatCandidateLabel(c)[0] || "U"}</AvatarFallback>
                                                    </Avatar>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div className="text-sm font-medium truncate">{formatCandidateLabel(c)}</div>
                                                            {c.role ? (
                                                                <Badge variant="outline" className="text-[10px] h-4 px-1 py-0">
                                                                    {c.role}
                                                                </Badge>
                                                            ) : null}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground truncate">{c.email}</div>
                                                    </div>
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <label className="text-sm font-medium">留言（可选）</label>
                        <Textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            rows={4}
                            maxLength={2000}
                            placeholder="补充说明、期待对方协作的方向、截止时间等..."
                        />
                        <div className="text-xs text-muted-foreground text-right">{message.length}/2000</div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
                        取消
                    </Button>
                    <Button onClick={handleSend} disabled={!canSend} className="gap-1">
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        发送邀请
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

