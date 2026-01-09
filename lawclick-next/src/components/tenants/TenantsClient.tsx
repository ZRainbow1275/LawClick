"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { TenantMembershipRole } from "@/lib/prisma-browser"
import { toast } from "sonner"
import { acceptTenantInviteById, switchMyActiveTenant } from "@/actions/tenant-actions"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"

export type TenantsClientProps = {
    activeTenant: { id: string; name: string }
    tenants: Array<{ id: string; name: string; role: TenantMembershipRole }>
    pendingInvites: Array<{
        id: string
        tenantId: string
        tenantName: string
        role: TenantMembershipRole
        expiresAt: string
        createdAt: string
    }>
}

function roleLabel(role: TenantMembershipRole): string {
    if (role === "OWNER") return "Owner"
    if (role === "ADMIN") return "Admin"
    if (role === "VIEWER") return "Viewer"
    return "Member"
}

export function TenantsClient(props: TenantsClientProps) {
    const router = useRouter()
    const [switchingTenantId, setSwitchingTenantId] = React.useState<string | null>(null)
    const [acceptingInviteId, setAcceptingInviteId] = React.useState<string | null>(null)

    const handleSwitchTenant = async (tenantId: string) => {
        if (tenantId === props.activeTenant.id) return
        setSwitchingTenantId(tenantId)
        try {
            const res = await switchMyActiveTenant({ tenantId })
            if (!res.success) {
                toast.error("切换租户失败", { description: res.error })
                return
            }
            toast.success("已切换租户")
            router.push("/dashboard")
        } finally {
            setSwitchingTenantId(null)
        }
    }

    const handleAcceptInvite = async (inviteId: string) => {
        setAcceptingInviteId(inviteId)
        try {
            const res = await acceptTenantInviteById({ inviteId })
            if (!res.success) {
                toast.error("接受邀请失败", { description: res.error })
                return
            }
            toast.success("已加入租户并切换工作区")
            router.push("/dashboard")
        } finally {
            setAcceptingInviteId(null)
        }
    }

    const myTenantsPanel = (
        <Card className="bg-card h-full">
            <CardHeader className="pb-3">
                <CardTitle className="text-base">我的租户</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {props.tenants.length === 0 ? (
                    <div className="text-sm text-muted-foreground">暂无可用租户</div>
                ) : (
                    <div className="space-y-2">
                        {props.tenants.map((t) => {
                            const active = t.id === props.activeTenant.id
                            return (
                                <div
                                    key={t.id}
                                    className="flex items-center justify-between gap-3 rounded-lg border bg-card/60 p-3"
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <div className="font-medium truncate">{t.name}</div>
                                            {active ? <Badge variant="secondary">当前</Badge> : null}
                                            <Badge variant="outline" className="text-xs">
                                                {roleLabel(t.role)}
                                            </Badge>
                                        </div>
                                        <div className="text-xs text-muted-foreground font-mono truncate">{t.id}</div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant={active ? "secondary" : "default"}
                                        disabled={active || switchingTenantId === t.id}
                                        onClick={() => void handleSwitchTenant(t.id)}
                                    >
                                        {switchingTenantId === t.id ? "切换中…" : active ? "已在此租户" : "切换"}
                                    </Button>
                                </div>
                            )
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    )

    const invitesPanel = (
        <Card className="bg-card h-full">
            <CardHeader className="pb-3">
                <CardTitle className="text-base">待处理邀请</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {props.pendingInvites.length === 0 ? (
                    <div className="text-sm text-muted-foreground">暂无邀请</div>
                ) : (
                    <div className="space-y-2">
                        {props.pendingInvites.map((inv) => (
                            <div
                                key={inv.id}
                                className="flex items-center justify-between gap-3 rounded-lg border bg-card/60 p-3"
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <div className="font-medium truncate">{inv.tenantName}</div>
                                        <Badge variant="outline" className="text-xs">
                                            {roleLabel(inv.role)}
                                        </Badge>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        过期：{new Date(inv.expiresAt).toLocaleString("zh-CN")}
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    disabled={acceptingInviteId === inv.id}
                                    onClick={() => void handleAcceptInvite(inv.id)}
                                >
                                    {acceptingInviteId === inv.id ? "处理中…" : "接受并切换"}
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_tenants_mine",
            title: "我的租户",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 6, h: 14, minW: 4, minH: 10 },
            content: myTenantsPanel,
        },
        {
            id: "b_tenants_invites",
            title: "待处理邀请",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 6, h: 14, minW: 4, minH: 10 },
            content: invitesPanel,
        },
    ]

    return <SectionWorkspace sectionId="tenants" catalog={catalog} className="h-full" />
}
