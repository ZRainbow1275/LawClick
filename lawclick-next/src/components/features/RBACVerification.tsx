"use client"

import type { ComponentType, ReactNode } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Separator } from "@/components/ui/Separator"
import { LegoDeck } from "@/components/layout/LegoDeck"
import { usePermission } from "@/hooks/use-permission"
import type { Permission } from "@/lib/permissions"
import type { Role } from "@/lib/prisma-browser"
import { getToneSoftClassName, getToneSurfaceClassName, type UiTone } from "@/lib/ui/tone"
import { cn } from "@/lib/utils"
import {
    AlertTriangle,
    Briefcase,
    ClipboardCheck,
    DollarSign,
    FileText,
    Lock,
    Settings,
    Shield,
    Unlock,
    UserCheck,
    Users,
} from "lucide-react"

type PermissionGroup = {
    name: string
    icon: ComponentType<{ className?: string }>
    permissions: Array<{ key: Permission; label: string }>
}

const PERMISSION_GROUPS: PermissionGroup[] = [
    {
        name: "案件管理",
        icon: Briefcase,
        permissions: [
            { key: "case:view", label: "查看案件" },
            { key: "case:create", label: "创建案件" },
            { key: "case:edit", label: "编辑案件" },
            { key: "case:delete", label: "删除案件" },
            { key: "case:assign", label: "分配案件" },
        ],
    },
    {
        name: "文档管理",
        icon: FileText,
        permissions: [
            { key: "document:view", label: "查看文档" },
            { key: "document:upload", label: "上传文档" },
            { key: "document:edit", label: "编辑文档" },
            { key: "document:delete", label: "删除文档" },
        ],
    },
    {
        name: "财务管理",
        icon: DollarSign,
        permissions: [
            { key: "billing:view", label: "查看账单" },
            { key: "billing:create", label: "创建账单" },
            { key: "billing:edit", label: "编辑账单" },
        ],
    },
    {
        name: "审批 / OA",
        icon: ClipboardCheck,
        permissions: [
            { key: "approval:create", label: "发起审批" },
            { key: "approval:approve", label: "处理审批" },
            { key: "approval:view_all", label: "查看全部审批" },
        ],
    },
    {
        name: "客户管理",
        icon: Users,
        permissions: [
            { key: "crm:view", label: "查看客户" },
            { key: "crm:edit", label: "编辑客户" },
        ],
    },
    {
        name: "团队管理",
        icon: Users,
        permissions: [
            { key: "team:view", label: "查看团队" },
            { key: "team:manage", label: "管理成员" },
        ],
    },
    {
        name: "系统管理",
        icon: Settings,
        permissions: [
            { key: "admin:access", label: "访问后台" },
            { key: "admin:settings", label: "系统设置" },
            { key: "admin:audit", label: "审计日志" },
        ],
    },
]

type RoleKey = Role | "GUEST"

const ROLE_META: Record<RoleKey, { label: string; tone: UiTone }> = {
    PARTNER: { label: "合伙人", tone: "default" },
    SENIOR_LAWYER: { label: "高级律师", tone: "info" },
    LAWYER: { label: "专职律师", tone: "info" },
    TRAINEE: { label: "实习生", tone: "success" },
    ADMIN: { label: "管理员", tone: "warning" },
    HR: { label: "人事", tone: "secondary" },
    MARKETING: { label: "品牌", tone: "secondary" },
    LEGAL_SECRETARY: { label: "法律秘书", tone: "success" },
    CLIENT: { label: "客户", tone: "outline" },
    FIRM_ENTITY: { label: "律所", tone: "secondary" },
    GUEST: { label: "访客", tone: "secondary" },
}

function normalizeRoleKey(role: unknown): RoleKey {
    if (typeof role !== "string") return "GUEST"
    const key = role.toUpperCase()
    if (key in ROLE_META) return key as RoleKey
    return "GUEST"
}

export function RBACVerification() {
    const { can, role } = usePermission()
    const roleInfo = ROLE_META[normalizeRoleKey(role)]

    const totalPermissions = PERMISSION_GROUPS.reduce((acc, g) => acc + g.permissions.length, 0)
    const grantedPermissions = PERMISSION_GROUPS.reduce((acc, g) => acc + g.permissions.filter((p) => can(p.key)).length, 0)
    const missingPermissions = Math.max(0, totalPermissions - grantedPermissions)

    return (
        <Card className="border-border bg-gradient-to-br from-primary/10 to-accent/30">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-foreground">
                    <Shield className="h-4 w-4 text-primary" />
                    权限控制面板
                </CardTitle>
                <CardDescription className="text-xs">基于角色的访问控制（RBAC）</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <LegoDeck
                    title="分区布局（可拖拽/可记忆/可恢复）"
                    sectionId="rbac_verification_blocks"
                    rowHeight={20}
                    margin={[12, 12]}
                    catalog={[
                        {
                            id: "b_rbac_role",
                            title: "当前角色",
                            pinned: true,
                            chrome: "none",
                            defaultSize: { w: 12, h: 6, minW: 6, minH: 5 },
                            content: (
                                <div className="flex items-center justify-between p-3 bg-card/60 rounded-lg border">
                                    <div className="flex items-center gap-2">
                                        <UserCheck className="h-4 w-4 text-primary" />
                                        <span className="text-sm font-medium">当前角色</span>
                                    </div>
                                    <Badge variant="outline" className={getToneSoftClassName(roleInfo.tone)}>
                                        {roleInfo.label}
                                    </Badge>
                                </div>
                            ),
                        },
                        {
                            id: "b_rbac_stats_granted",
                            title: "已授权",
                            pinned: true,
                            chrome: "none",
                            defaultSize: { w: 6, h: 6, minW: 3, minH: 5 },
                            content: (
                                <div className={cn("p-3 rounded-lg border text-center", getToneSurfaceClassName("success"))}>
                                    <div className="text-lg font-bold text-success">{grantedPermissions}</div>
                                    <div className="text-[10px] text-success">已授权</div>
                                </div>
                            ),
                        },
                        {
                            id: "b_rbac_stats_missing",
                            title: "未授权",
                            pinned: true,
                            chrome: "none",
                            defaultSize: { w: 6, h: 6, minW: 3, minH: 5 },
                            content: (
                                <div className={cn("p-3 rounded-lg border text-center", getToneSurfaceClassName("secondary"))}>
                                    <div className="text-lg font-bold text-muted-foreground">{missingPermissions}</div>
                                    <div className="text-[10px] text-muted-foreground">未授权</div>
                                </div>
                            ),
                        },
                        {
                            id: "b_rbac_groups",
                            title: "权限清单",
                            pinned: true,
                            chrome: "none",
                            defaultSize: { w: 12, h: 14, minW: 6, minH: 10 },
                            content: (
                                <div className="rounded-lg border bg-card/40 p-3 h-full">
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm font-medium">权限清单</div>
                                        <Badge variant="secondary" className="text-xs">
                                            {grantedPermissions}/{totalPermissions}
                                        </Badge>
                                    </div>
                                    <Separator className="my-2" />
                                    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                                        {PERMISSION_GROUPS.map((group) => {
                                            const Icon = group.icon
                                            const groupGranted = group.permissions.filter((p) => can(p.key)).length

                                            return (
                                                <div key={group.name} className="space-y-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                                            <Icon className="h-3 w-3" />
                                                            {group.name}
                                                        </div>
                                                        <span className="text-[10px] text-muted-foreground">
                                                            {groupGranted}/{group.permissions.length}
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-1">
                                                        {group.permissions.map((perm) => (
                                                            <div
                                                                key={perm.key}
                                                                className={cn(
                                                                    "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border",
                                                                    can(perm.key)
                                                                        ? getToneSoftClassName("success")
                                                                        : getToneSoftClassName("secondary")
                                                                )}
                                                            >
                                                                {can(perm.key) ? (
                                                                    <Unlock className="h-2.5 w-2.5" />
                                                                ) : (
                                                                    <Lock className="h-2.5 w-2.5" />
                                                                )}
                                                                {perm.label}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            ),
                        },
                        {
                            id: "b_rbac_actions",
                            title: "快捷操作",
                            pinned: false,
                            chrome: "none",
                            defaultSize: { w: 12, h: 8, minW: 6, minH: 6 },
                            content: (
                                <div className="rounded-lg border bg-card/40 p-3 h-full space-y-2">
                                    <div className="text-sm font-medium">快捷操作</div>
                                    <div className="text-xs text-muted-foreground">
                                        仅用于演示权限可见性；具体业务入口应在对应页面出现。
                                    </div>
                                    <Separator className="my-2" />
                                    <div className="space-y-2">
                                        {can("case:edit") ? (
                                            <Button size="sm" className="w-full">
                                                <Shield className="h-3 w-3 mr-1.5" />
                                                律师专属操作
                                            </Button>
                                        ) : null}

                                        {can("admin:access") ? (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            >
                                                <Settings className="h-3 w-3 mr-1.5" />
                                                进入管理后台
                                            </Button>
                                        ) : null}

                                        {!can("case:edit") && !can("admin:access") ? (
                                            <div className="text-xs text-muted-foreground">当前角色暂无可展示的快捷操作。</div>
                                        ) : null}
                                    </div>
                                </div>
                            ),
                        },
                    ]}
                />
            </CardContent>
        </Card>
    )
}

interface ProtectedProps {
    permission: Permission
    children: ReactNode
    fallback?: ReactNode
}

export function Protected({ permission, children, fallback }: ProtectedProps) {
    const { can } = usePermission()
    if (!can(permission)) return fallback || null
    return <>{children}</>
}

interface PermissionGateProps {
    permission: Permission
    children: ReactNode
    title?: string
    description?: string
}

export function PermissionGate({ permission, children, title, description }: PermissionGateProps) {
    const { can, role } = usePermission()
    const roleInfo = ROLE_META[normalizeRoleKey(role)]

    if (!can(permission)) {
        return (
            <Card className="border-destructive/30 bg-destructive/10">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="h-12 w-12 rounded-full bg-destructive/20 flex items-center justify-center mb-4">
                        <AlertTriangle className="h-6 w-6 text-destructive" />
                    </div>
                    <h3 className="font-semibold text-destructive mb-1">{title || "访问受限"}</h3>
                    <p className="text-sm text-destructive mb-4">
                        {description || `您当前的角色（${roleInfo.label}）没有访问此功能的权限`}
                    </p>
                    <Badge variant="outline" className="text-destructive border-destructive/30">
                        需要权限：{permission}
                    </Badge>
                </CardContent>
            </Card>
        )
    }

    return <>{children}</>
}
