'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from "next-intl"
// import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import {
    Sidebar,
    SidebarContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarFooter,
} from '@/components/ui/Sidebar';
import { Badge } from '@/components/ui/Badge';
import {
    Scale,
    ChevronRight,
    UserCircle,
} from 'lucide-react';
import { getNavigationForRole, type NavigationItem } from '@/config/navigation';
import { useRole } from "@/components/layout/RoleContext";
import { usePermission } from "@/hooks/use-permission"
import { navLabelKeyFromHref } from "@/lib/i18n/nav-keys"

// 底部导航项
const bottomItems: NavigationItem[] = [
    {
        name: '个人中心',
        href: '/profile',
        icon: UserCircle,
    },
];

export function AppSidebar() {
    const pathname = usePathname();
    const [manualExpandedItems, setManualExpandedItems] = useState<string[]>(() => {
        if (typeof window === "undefined") return []
        try {
            const s = localStorage.getItem('sidebar_expanded');
            if (!s) return [];
            const parsed = JSON.parse(s);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            logger.warn('[sidebar] 读取 localStorage.sidebar_expanded 失败', { error: message })
            return [];
        }
    });

    // Use a sensible default if context is missing (though it shouldn't be)
    const roleContext = useRole();
    const currentRole = roleContext?.currentRole || "lawyer";
    const { can } = usePermission()
    const tNav = useTranslations("nav")
    const labelForHref = (href: string, fallback: string) => {
        const key = navLabelKeyFromHref(href)
        return key && tNav.has(key) ? tNav(key) : fallback
    }

    // 根据用户角色获取导航项
    const navigationItems = getNavigationForRole(currentRole);
    const visibleNavigationItems = useMemo(() => {
        return navigationItems
            .map((item) => {
                if (item.permission && !can(item.permission)) {
                    return null
                }

                if (item.children) {
                    const children = item.children.filter((child) => !child.permission || can(child.permission))
                    if (children.length === 0) return null
                    return { ...item, children }
                }

                return item
            })
            .filter((item): item is NavigationItem => item !== null)
    }, [navigationItems, can])
    const visibleBottomItems = useMemo(
        () => bottomItems.filter((item) => !item.permission || can(item.permission)),
        [can]
    )

    // 当前路径所在分组：无需 setState，避免 effect 内同步 setState 导致级联渲染
    const autoExpandedItems = useMemo(() => {
        if (!pathname) return [];
        const groups: string[] = [];
        visibleNavigationItems.forEach((item) => {
            if (item.children && (pathname === item.href || pathname.startsWith(item.href + '/'))) {
                groups.push(item.name);
            }
        });
        return groups;
    }, [pathname, visibleNavigationItems]);

    const expandedItems = useMemo(() => {
        return Array.from(new Set([...manualExpandedItems, ...autoExpandedItems]));
    }, [manualExpandedItems, autoExpandedItems]);

    const toggleExpanded = (itemName: string) => {
        setManualExpandedItems((prev) => {
            return prev.includes(itemName)
                ? prev.filter((name) => name !== itemName)
                : [...prev, itemName];
        });
    };

    const isExpanded = (itemName: string) => expandedItems.includes(itemName);
    // 折叠状态持久化
    useEffect(() => {
        if (typeof window === "undefined") return
        try {
            localStorage.setItem('sidebar_expanded', JSON.stringify(manualExpandedItems));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            logger.warn('[sidebar] 写入 localStorage.sidebar_expanded 失败', { error: message })
        }
    }, [manualExpandedItems]);


    return (
        <Sidebar variant="floating" collapsible="icon" className="bg-transparent border-none">
                <SidebarHeader className="p-4">
                    <Link href="/dashboard" className="flex items-center space-x-2 group hover-lift">
                        <div className="w-8 h-8 bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg flex items-center justify-center shadow-brand group-hover:shadow-brand-lg transition-all duration-300 group-hover:scale-110">
                            <Scale className="w-5 h-5 text-primary-foreground" />
                        </div>
                        <div className="flex flex-col group-data-[collapsible=icon]:hidden">
                            <span className="text-lg font-bold text-foreground group-hover:text-primary-700 transition-colors">LawClick</span>
                            <span className="text-xs text-muted-foreground -mt-1 group-hover:text-primary transition-colors">律所 ERP v9</span>
                        </div>
                    </Link>
                </SidebarHeader>

                <SidebarContent className="px-2">
                    <SidebarMenu>
                        {visibleNavigationItems.map((item) => (
                            <SidebarMenuItem key={item.name}>
                                {item.children ? (
                                    // 有子菜单的项目
                                    <div>
                                            <SidebarMenuButton
                                            onClick={() => toggleExpanded(item.name)}
                                            isActive={pathname === item.href || pathname.startsWith(item.href + '/')}
                                            className="w-full nav-item hover-lift data-[active=true]:bg-primary/10 data-[active=true]:text-primary-800 dark:data-[active=true]:text-primary-200"
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <div className="flex items-center space-x-3">
                                                    <item.icon className="w-5 h-5" />
                                                    <span>{labelForHref(item.href, item.name)}</span>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    {item.badge && (
                                                        <Badge variant="secondary" className="bg-primary text-primary-foreground shadow-brand">
                                                            {item.badge}
                                                        </Badge>
                                                    )}
                                                    <div className={`transition-transform duration-300 ${isExpanded(item.name) ? 'rotate-90' : ''}`}>
                                                        <ChevronRight className="w-4 h-4" />
                                                    </div>
                                                </div>
                                            </div>
                                        </SidebarMenuButton>

                                        {/* 子菜单动画容器 */}
                                        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded(item.name) ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                                            }`}>
                                            <div className="ml-8 mt-2 space-y-1 animate-slide-up">
                                                {item.children.map((child, index) => (
                                                    <SidebarMenuButton
                                                        key={child.name}
                                                        asChild
                                                        isActive={pathname === child.href || pathname.startsWith(child.href + '/')}
                                                        size="sm"
                                                        className="nav-item-animate hover-lift data-[active=true]:text-primary-800 dark:data-[active=true]:text-primary-200"
                                                        style={{ animationDelay: `${index * 0.1}s` }}
                                                    >
                                                        <Link href={child.href} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                                                            {labelForHref(child.href, child.name)}
                                                        </Link>
                                                    </SidebarMenuButton>        
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    // 没有子菜单的项目
                                    <SidebarMenuButton
                                        asChild
                                        isActive={pathname === item.href || pathname.startsWith(item.href + '/')}
                                        className="w-full nav-item hover-lift data-[active=true]:bg-primary/10 data-[active=true]:text-primary-800 dark:data-[active=true]:text-primary-200"
                                    >
                                        <Link href={item.href} className="flex items-center justify-between">
                                            <div className="flex items-center space-x-3">
                                                <item.icon className="w-5 h-5" />
                                                <span>{labelForHref(item.href, item.name)}</span>
                                            </div>
                                            {item.badge && (
                                                <Badge variant="secondary" className="bg-primary text-primary-foreground shadow-brand">
                                                    {item.badge}
                                                </Badge>
                                            )}
                                        </Link>
                                    </SidebarMenuButton>
                                )}
                            </SidebarMenuItem>
                        ))}
                    </SidebarMenu>
                </SidebarContent>

                <SidebarFooter className="p-2">
                    <SidebarMenu>
                        {visibleBottomItems.map((item) => (
                            <SidebarMenuItem key={item.href}>
                                <SidebarMenuButton
                                    asChild
                                    isActive={pathname === item.href}
                                    size="sm"
                                    className="hover:text-primary hover:bg-primary/5"
                                >
                                    <Link href={item.href} className="flex items-center space-x-3">
                                        <item.icon className="w-4 h-4" />
                                        <span className="text-sm">{labelForHref(item.href, item.name)}</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        ))}
                    </SidebarMenu>
                </SidebarFooter>
        </Sidebar>
    );
}
