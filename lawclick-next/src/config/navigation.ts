import {
    LayoutDashboard,
    Briefcase,
    FolderKanban,
    CheckSquare,
    Clock,
    Bell,
    Calendar,
    FileText,
    Users,
    MessageSquare,
    Activity,
    Bot,
    ShieldCheck,
    Wrench,
    type LucideIcon,
} from 'lucide-react';

import { hasPermission } from "@/lib/permissions"
import type { Permission } from "@/lib/permissions"
import type { Role } from "@prisma/client"

export type NavigationChildItem = {
    name: string
    href: string
    permission?: Permission
}

export type NavigationItem = {
    name: string
    href: string
    icon: LucideIcon
    badge?: string
    permission?: Permission
    children?: NavigationChildItem[]
}

export const navigation: NavigationItem[] = [
    {
        name: '工作台',
        href: '/dashboard',
        icon: LayoutDashboard,
        permission: "dashboard:view",
    },
    {
        name: '日程安排',
        href: '/calendar',
        icon: Calendar,
        permission: "team:view",
    },
    {
        name: '调度中心',
        href: '/dispatch',
        icon: Activity,
        permission: "team:view",
    },
    {
        name: '案件项目',
        href: '/cases',
        icon: Briefcase,
        permission: "case:view",
        children: [
            { name: '立案侦查', href: '/cases/intake', permission: "case:view" },
            { name: '我的案件', href: '/cases/active', permission: "case:view" },
            { name: '归档库', href: '/cases/archived', permission: "case:view" },
        ]
    },
    {
        name: '项目中心',
        href: '/projects',
        icon: FolderKanban,
        permission: "task:view",
    },
    {
        name: '任务中心',
        href: '/tasks',
        icon: CheckSquare,
        permission: "task:view",
    },
    {
        name: '协作邀请',
        href: '/invites',
        icon: Bell,
        permission: "team:view",
    },
    {
        name: '工时追踪',
        href: '/time',
        icon: Clock,
        permission: "case:view",
    },
    {
        name: '文档中心',
        href: '/documents',
        icon: FileText,
        permission: "document:view",
    },
    {
        name: '工具箱',
        href: '/tools',
        icon: Wrench,
        permission: "dashboard:view",
    },
    {
        name: 'AI 助手',
        href: '/ai',
        icon: Bot,
        permission: "ai:use",
    },
    {
        name: '客户管理',
        href: '/crm/customers',
        icon: Users,
        permission: "crm:view",
    },
    {
        name: '行政中心',
        href: '/admin',
        icon: ShieldCheck,
        permission: "admin:access",
        children: [
            { name: '租户管理', href: '/admin/tenants', permission: "admin:settings" },
            { name: '审批中心', href: '/admin/approvals', permission: "approval:approve" },
            { name: '财务中心', href: '/admin/finance', permission: "billing:view" },
            { name: '文书模板', href: '/admin/document-templates', permission: "document:template_manage" },
            { name: '回收站', href: '/admin/recycle-bin', permission: "admin:settings" },
            { name: '运行机制', href: '/admin/ops', permission: "admin:settings" },
        ],
    },
    {
        name: '消息沟通',
        href: '/chat',
        icon: MessageSquare,
        permission: "team:view",
    }
];

export function getNavigationForRole(role: string = 'lawyer'): NavigationItem[] {
    const normalizedRole = role.toLowerCase();

    const roleKey = normalizedRole.toUpperCase() as Role

    const filtered = navigation
        .map((item): NavigationItem | null => {
            if (item.permission && !hasPermission(roleKey, item.permission)) return null
            if (item.children) {
                const children = item.children.filter((child) => {
                    if (!child.permission) return true
                    return hasPermission(roleKey, child.permission)
                })
                if (children.length === 0) return null
                return { ...item, children }
            }
            return item
        })
        .filter((item): item is NavigationItem => item !== null)

    return filtered
}
