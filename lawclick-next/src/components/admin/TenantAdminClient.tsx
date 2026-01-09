"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { TenantInviteStatus, TenantMembershipRole, TenantMembershipStatus } from "@/lib/prisma-browser"
import { toast } from "sonner"
import { logger } from "@/lib/logger"

import {
    addTenantMemberByEmail,
    createTenant,
    createTenantInvite,
    offboardTenantMember,
    revokeTenantInvite,
    setTenantMemberStatus,
    updateMyFirmProfile,
    updateTenantMemberRole,
} from "@/actions/tenant-actions"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { LegoDeck } from "@/components/layout/LegoDeck"
import { SectionWorkspace } from "@/components/layout/SectionWorkspace"

type TenantMemberRow = {
    id: string
    role: TenantMembershipRole
    status: TenantMembershipStatus
    createdAt: string
    user: {
        id: string
        email: string
        name: string | null
        role: string
        avatarUrl: string | null
        department: string | null
        title: string | null
        isActive: boolean
    }
}

type TenantInviteRow = {
    id: string
    email: string
    role: TenantMembershipRole
    status: TenantInviteStatus
    expiresAt: string
    createdAt: string
    createdBy: { id: string; name: string | null; email: string } | null
}

export function TenantAdminClient(props: {
    currentUserId: string
    canOffboard: boolean
    firm: { id: string; name: string }
    tenant: { id: string; name: string }
    members: TenantMemberRow[]
    invites: TenantInviteRow[]
}) {
    const router = useRouter()

    const [createTenantId, setCreateTenantId] = React.useState("")
    const [createTenantName, setCreateTenantName] = React.useState("")
    const [creatingTenant, setCreatingTenant] = React.useState(false)

    const [firmNameDraft, setFirmNameDraft] = React.useState(props.firm.name)
    const [updatingFirm, setUpdatingFirm] = React.useState(false)

    const [memberEmail, setMemberEmail] = React.useState("")
    const [memberRole, setMemberRole] = React.useState<TenantMembershipRole>("MEMBER")
    const [addingMember, setAddingMember] = React.useState(false)

    const [inviteEmail, setInviteEmail] = React.useState("")
    const [inviteRole, setInviteRole] = React.useState<TenantMembershipRole>("MEMBER")
    const [inviting, setInviting] = React.useState(false)

    const [revokingId, setRevokingId] = React.useState<string | null>(null)

    const [memberRoleDraft, setMemberRoleDraft] = React.useState<Record<string, TenantMembershipRole>>({})
    const [updatingMemberRoleId, setUpdatingMemberRoleId] = React.useState<string | null>(null)
    const [updatingMemberStatusId, setUpdatingMemberStatusId] = React.useState<string | null>(null)

    const [offboardDialogOpen, setOffboardDialogOpen] = React.useState(false)
    const [offboardTarget, setOffboardTarget] = React.useState<TenantMemberRow | null>(null)
    const [offboardSuccessorUserId, setOffboardSuccessorUserId] = React.useState("")
    const [offboarding, setOffboarding] = React.useState(false)

    React.useEffect(() => {
        const next: Record<string, TenantMembershipRole> = {}
        for (const m of props.members) {
            next[m.id] = m.role
        }
        setMemberRoleDraft(next)
    }, [props.members])

    React.useEffect(() => {
        setFirmNameDraft(props.firm.name)
    }, [props.firm.name])

    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text)
            toast.success("已复制到剪贴板")
        } catch (error) {
            logger.error("copy failed", error)
            toast.error("复制失败")
        }
    }

    const onUpdateFirm = async () => {
        const nextName = firmNameDraft.trim()
        if (!nextName) {
            toast.error("机构名称不能为空")
            return
        }
        if (nextName === props.firm.name) return

        setUpdatingFirm(true)
        try {
            const res = await updateMyFirmProfile({ name: nextName })
            if (!res.success) {
                toast.error("更新机构失败", { description: res.error })
                return
            }
            toast.success("已更新机构信息")
            router.refresh()
        } finally {
            setUpdatingFirm(false)
        }
    }

    const onCreateTenant = async () => {
        setCreatingTenant(true)
        try {
            const res = await createTenant({ id: createTenantId, name: createTenantName, switchToNewTenant: false })
            if (!res.success) {
                toast.error("创建租户失败", { description: res.error })
                return
            }
            toast.success("已创建租户")
            setCreateTenantId("")
            setCreateTenantName("")
            router.refresh()
        } finally {
            setCreatingTenant(false)
        }
    }

    const onAddMember = async () => {
        setAddingMember(true)
        try {
            const res = await addTenantMemberByEmail({ tenantId: props.tenant.id, email: memberEmail, role: memberRole })
            if (!res.success) {
                toast.error("添加成员失败", { description: res.error })
                return
            }
            toast.success("已添加成员")
            setMemberEmail("")
            router.refresh()
        } finally {
            setAddingMember(false)
        }
    }

    const onInvite = async () => {
        setInviting(true)
        try {
            const res = await createTenantInvite({ tenantId: props.tenant.id, email: inviteEmail, role: inviteRole })
            if (!res.success) {
                toast.error("创建邀请失败", { description: res.error })
                return
            }
            toast.success("已创建邀请并入队发送邮件")
            setInviteEmail("")
            if (res.data?.inviteUrl) {
                void copy(res.data.inviteUrl)
            }
            router.refresh()
        } finally {
            setInviting(false)
        }
    }

    const onRevoke = async (inviteId: string) => {
        setRevokingId(inviteId)
        try {
            const res = await revokeTenantInvite({ inviteId })
            if (!res.success) {
                toast.error("撤销邀请失败", { description: res.error })
                return
            }
            toast.success("已撤销邀请")
            router.refresh()
        } finally {
            setRevokingId(null)
        }
    }

    const onUpdateMemberRole = async (membershipId: string) => {
        const nextRole = memberRoleDraft[membershipId]
        if (!nextRole) return

        setUpdatingMemberRoleId(membershipId)
        try {
            const res = await updateTenantMemberRole({ membershipId, role: nextRole })
            if (!res.success) {
                toast.error("更新角色失败", { description: res.error })
                return
            }
            toast.success("已更新成员角色")
            router.refresh()
        } finally {
            setUpdatingMemberRoleId(null)
        }
    }

    const onToggleMemberStatus = async (membershipId: string, nextStatus: TenantMembershipStatus) => {
        setUpdatingMemberStatusId(membershipId)
        try {
            const res = await setTenantMemberStatus({ membershipId, status: nextStatus })
            if (!res.success) {
                toast.error("更新状态失败", { description: res.error })
                return
            }
            toast.success(nextStatus === "DISABLED" ? "已停用成员" : "已启用成员")
            router.refresh()
        } finally {
            setUpdatingMemberStatusId(null)
        }
    }

    const openOffboardDialog = (member: TenantMemberRow) => {
        setOffboardTarget(member)
        setOffboardSuccessorUserId("")
        setOffboardDialogOpen(true)
    }

    const closeOffboardDialog = () => {
        setOffboardDialogOpen(false)
        setOffboardTarget(null)
        setOffboardSuccessorUserId("")
    }

    const onConfirmOffboard = async () => {
        if (!offboardTarget) return
        if (!offboardSuccessorUserId) {
            toast.error("请选择交接人")
            return
        }

        setOffboarding(true)
        try {
            const res = await offboardTenantMember({
                membershipId: offboardTarget.id,
                successorUserId: offboardSuccessorUserId,
            })
            if (!res.success) {
                toast.error("离职交接失败", { description: res.error })
                return
            }
            toast.success("离职交接完成")
            closeOffboardDialog()
            router.refresh()
        } finally {
            setOffboarding(false)
        }
    }

    const offboardCandidates = React.useMemo(() => {
        if (!offboardTarget) return []
        return props.members
            .filter((m) => {
                if (m.user.id === offboardTarget.user.id) return false
                if (m.status !== "ACTIVE") return false
                if (!m.user.isActive) return false
                return true
            })
            .map((m) => ({
                userId: m.user.id,
                label: m.user.name || m.user.email,
                email: m.user.email,
                role: m.role,
            }))
    }, [offboardTarget, props.members])

    return (
        <>
            <SectionWorkspace
            title="租户管理"
            sectionId="admin_tenants"
            entityId={props.tenant.id}
            className="h-full"
            catalog={[
                {
                    id: "b_tenant_badges",
                    title: "租户",
                    pinned: true,
                    chrome: "none",
                    defaultSize: { w: 12, h: 3, minW: 8, minH: 3 },
                    content: (
            <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                    tenant <span className="font-mono">{props.tenant.id}</span>
                </Badge>
                <Badge variant="secondary" className="text-xs">
                    {props.tenant.name}
                </Badge>
                <Badge variant="outline" className="text-xs">
                    firm <span className="font-mono">{props.firm.id}</span>
                </Badge>
            </div>
                    ),
                },
                {
                    id: "b_tenant_firm",
                    title: "机构",
                    chrome: "none",
                    defaultSize: { w: 12, h: 6, minW: 8, minH: 5 },
                    content: (
            <Card className="bg-card">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">机构（Firm）</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="text-xs text-muted-foreground">
                        当前租户所属机构：<span className="font-mono">{props.firm.id}</span>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Input value={firmNameDraft} onChange={(e) => setFirmNameDraft(e.target.value)} placeholder="机构名称" />
                        <Button onClick={() => void onUpdateFirm()} disabled={updatingFirm || firmNameDraft.trim() === props.firm.name}>
                            {updatingFirm ? "保存中…" : "保存机构信息"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
                    ),
                },
                {
                    id: "b_tenant_create_invite",
                    title: "创建与邀请",
                    chrome: "none",
                    defaultSize: { w: 12, h: 12, minW: 8, minH: 10 },
                    content: (
                        <LegoDeck
                            title="创建与邀请卡片（可拖拽）"
                            sectionId="tenant_admin_create_invite"
                            rowHeight={30}
                            margin={[12, 12]}
                            catalog={[
                                {
                                    id: "b_tenant_create_tenant",
                                    title: "创建新租户",
                                    pinned: true,
                                    chrome: "none",
                                    defaultSize: { w: 6, h: 10, minW: 6, minH: 8 },
                                    content: (
                                        <Card className="h-full bg-card">
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base">创建新租户</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                        <div className="flex flex-col sm:flex-row gap-2">
                            <Input
                                value={createTenantId}
                                onChange={(e) => setCreateTenantId(e.target.value)}
                                placeholder="tenantId（如 acme-firm）"
                                autoComplete="off"
                            />
                            <Input
                                value={createTenantName}
                                onChange={(e) => setCreateTenantName(e.target.value)}
                                placeholder="租户名称"
                                autoComplete="off"
                            />
                        </div>
                        <Button onClick={() => void onCreateTenant()} disabled={creatingTenant || !createTenantId || !createTenantName}>
                            {creatingTenant ? "创建中…" : "创建租户"}
                        </Button>
                        <div className="text-xs text-muted-foreground">
                            创建后将自动为你写入 OWNER 成员关系（可在上方租户切换页切换工作区）。
                        </div>
                                    </CardContent>
                                </Card>
                                    ),
                                },
                                {
                                    id: "b_tenant_members_invites",
                                    title: "成员与邀请",
                                    pinned: true,
                                    chrome: "none",
                                    defaultSize: { w: 6, h: 10, minW: 6, minH: 8 },
                                    content: (
                                        <Card className="h-full bg-card">
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base">成员与邀请</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <div className="text-sm font-medium">添加已注册成员</div>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <Input
                                    value={memberEmail}
                                    onChange={(e) => setMemberEmail(e.target.value)}
                                    placeholder="成员邮箱（已注册）"
                                    autoComplete="email"
                                />
                                <Select value={memberRole} onValueChange={(v) => setMemberRole(v as TenantMembershipRole)}>
                                    <SelectTrigger className="sm:w-44">
                                        <SelectValue placeholder="角色" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="OWNER">OWNER</SelectItem>
                                        <SelectItem value="ADMIN">ADMIN</SelectItem>
                                        <SelectItem value="MEMBER">MEMBER</SelectItem>
                                        <SelectItem value="VIEWER">VIEWER</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button
                                    onClick={() => void onAddMember()}
                                    disabled={addingMember || !memberEmail}
                                    className="sm:w-32"
                                >
                                    {addingMember ? "添加中…" : "添加"}
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="text-sm font-medium">发送邀请码（邮件）</div>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <Input
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    placeholder="邀请邮箱"
                                    autoComplete="email"
                                />
                                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as TenantMembershipRole)}>
                                    <SelectTrigger className="sm:w-44">
                                        <SelectValue placeholder="角色" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="OWNER">OWNER</SelectItem>
                                        <SelectItem value="ADMIN">ADMIN</SelectItem>
                                        <SelectItem value="MEMBER">MEMBER</SelectItem>
                                        <SelectItem value="VIEWER">VIEWER</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button onClick={() => void onInvite()} disabled={inviting || !inviteEmail} className="sm:w-32">
                                    {inviting ? "发送中…" : "发送"}
                                </Button>
                            </div>
                            <div className="text-xs text-muted-foreground">
                                如果邮件服务未配置，系统会落库记录失败原因；邀请链接仍可在 toast 中复制。
                            </div>
                        </div>
                                    </CardContent>
                                </Card>
                                    ),
                                },
                            ]}
                        />
                    ),
                },
                {
                    id: "b_tenant_members",
                    title: "当前成员",
                    pinned: true,
                    chrome: "none",
                    defaultSize: { w: 12, h: 14, minW: 8, minH: 12 },
                    content: (
            <Card className="bg-card">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">当前租户成员</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {props.members.length === 0 ? (
                        <div className="text-sm text-muted-foreground">暂无成员</div>
                    ) : (
                        props.members.map((m) => {
                            const draftRole = memberRoleDraft[m.id] || m.role
                            const roleChanged = draftRole !== m.role
                            const canEdit = m.status === "ACTIVE"
                            const canTriggerOffboard =
                                props.canOffboard &&
                                m.status === "ACTIVE" &&
                                m.user.isActive &&
                                m.user.id !== props.currentUserId
                            const toggleNextStatus =
                                m.status === "DISABLED"
                                    ? TenantMembershipStatus.ACTIVE
                                    : m.status === "ACTIVE"
                                      ? TenantMembershipStatus.DISABLED
                                      : null

                            return (
                                <div
                                    key={m.id}
                                    data-testid={`tenant-member-row:${m.id}`}
                                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border bg-card/60 p-3"
                                >
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Link
                                                href={`/team/${m.user.id}`}
                                                className="font-medium truncate hover:underline"
                                            >
                                                {m.user.name || m.user.email}
                                            </Link>
                                            <Badge variant="outline" className="text-xs">
                                                {m.role}
                                            </Badge>
                                            <Badge variant="secondary" className="text-xs">
                                                {m.status}
                                            </Badge>
                                            {m.user.isActive ? null : (
                                                <Badge variant="destructive" className="text-xs">
                                                    已停用
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground truncate">
                                            {m.user.email} · {m.user.department || "-"} · {m.user.title || "-"}
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-end gap-2">
                                        <div className="flex flex-wrap items-center justify-end gap-2">
                                            <Select
                                                value={draftRole}
                                                onValueChange={(value) => {
                                                    const v = value as TenantMembershipRole
                                                    setMemberRoleDraft((prev) => ({ ...prev, [m.id]: v }))
                                                }}
                                                disabled={!canEdit}
                                            >
                                                <SelectTrigger className="h-8 w-[132px] text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="OWNER">OWNER</SelectItem>
                                                    <SelectItem value="ADMIN">ADMIN</SelectItem>
                                                    <SelectItem value="MEMBER">MEMBER</SelectItem>
                                                    <SelectItem value="VIEWER">VIEWER</SelectItem>
                                                </SelectContent>
                                            </Select>

                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8"
                                                disabled={!canEdit || !roleChanged || updatingMemberRoleId === m.id}
                                                onClick={() => void onUpdateMemberRole(m.id)}
                                            >
                                                {updatingMemberRoleId === m.id ? "保存中…" : "保存角色"}
                                            </Button>

                                            <Button
                                                data-testid={`tenant-member-toggle-status:${m.id}`}
                                                size="sm"
                                                variant={m.status === "DISABLED" ? "default" : "destructive"}
                                                className="h-8"
                                                disabled={!toggleNextStatus || updatingMemberStatusId === m.id}
                                                onClick={() =>
                                                    toggleNextStatus ? void onToggleMemberStatus(m.id, toggleNextStatus) : undefined
                                                }
                                            >
                                                {updatingMemberStatusId === m.id
                                                    ? "处理中…"
                                                    : m.status === "DISABLED"
                                                      ? "启用"
                                                      : "停用"}
                                            </Button>

                                            <Button
                                                data-testid={`tenant-member-offboard:${m.id}`}
                                                size="sm"
                                                variant="outline"
                                                className="h-8"
                                                disabled={!canTriggerOffboard}
                                                onClick={() => openOffboardDialog(m)}
                                            >
                                                离职交接
                                            </Button>
                                        </div>
                                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                                            加入：{new Date(m.createdAt).toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </CardContent>
            </Card>
                    ),
                },
                {
                    id: "b_tenant_invites",
                    title: "待处理邀请",
                    pinned: true,
                    chrome: "none",
                    defaultSize: { w: 12, h: 10, minW: 8, minH: 8 },
                    content: (
            <Card className="bg-card">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">待处理邀请</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                    {props.invites.filter((i) => i.status === "PENDING").length === 0 ? (
                        <div className="text-sm text-muted-foreground">暂无待处理邀请</div>
                    ) : (
                        props.invites
                            .filter((i) => i.status === "PENDING")
                            .map((inv) => (
                                <div
                                    key={inv.id}
                                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border bg-card/60 p-3"
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <div className="font-medium truncate">{inv.email}</div>
                                            <Badge variant="outline" className="text-xs">
                                                {inv.role}
                                            </Badge>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            过期：{new Date(inv.expiresAt).toLocaleString()} · 创建：{new Date(inv.createdAt).toLocaleString()}
                                        </div>
                                        {inv.createdBy ? (
                                            <div className="text-xs text-muted-foreground">
                                                创建人：{inv.createdBy.name || inv.createdBy.email}
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            disabled={revokingId === inv.id}
                                            onClick={() => void onRevoke(inv.id)}
                                        >
                                            {revokingId === inv.id ? "撤销中…" : "撤销"}
                                        </Button>
                                    </div>
                                </div>
                            ))
                    )}
                </CardContent>
            </Card>
                    ),
                },
            ]}
            />

            <Dialog
                open={offboardDialogOpen}
                onOpenChange={(open) => {
                    if (!open) closeOffboardDialog()
                    else setOffboardDialogOpen(true)
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>离职交接</DialogTitle>
                        <DialogDescription>
                            将该成员名下资源归属转移给交接人，并冻结其在本机构内的成员关系与账号登录能力。
                        </DialogDescription>
                    </DialogHeader>

                    {offboardTarget ? (
                        <div className="space-y-3">
                            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                                <div className="font-medium">离职成员</div>
                                <div className="text-muted-foreground">
                                    {offboardTarget.user.name || offboardTarget.user.email}（{offboardTarget.user.email}）
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="text-sm font-medium">交接人（必须为本租户 ACTIVE 成员）</div>
                                <Select value={offboardSuccessorUserId} onValueChange={(v) => setOffboardSuccessorUserId(v)}>
                                    <SelectTrigger>
                                        <SelectValue
                                            placeholder={
                                                offboardCandidates.length ? "请选择交接人" : "暂无可用交接人"
                                            }
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {offboardCandidates.map((c) => (   
                                            <SelectItem key={c.userId} value={c.userId}>
                                                {c.label}
                                                {c.label === c.email ? "" : ` (${c.email})`} · {c.role}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <div className="text-xs text-muted-foreground">
                                    交接范围：项目 owner、任务 assignee、案件承办/发起（仅本租户）。
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground">未选择成员</div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={closeOffboardDialog} disabled={offboarding}>
                            取消
                        </Button>
                        <Button
                            onClick={() => void onConfirmOffboard()}
                            disabled={
                                offboarding ||
                                !offboardTarget ||
                                !offboardSuccessorUserId ||
                                offboardCandidates.length === 0
                            }
                        >
                            {offboarding ? "处理中…" : "确认离职交接"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
