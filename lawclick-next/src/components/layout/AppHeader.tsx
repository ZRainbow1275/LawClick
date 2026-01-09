'use client';

// import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { Button } from '@/components/ui/Button';
import { Avatar, AvatarFallback } from '@/components/ui/Avatar';
import { useRole } from "@/components/layout/RoleContext"
import { NotificationTrigger, CommandPalette, PerformanceMonitor, useConfirmationDialog } from '@/components/layout/HeaderComponents';
import { useUiPreferences } from "@/components/layout/UiPreferencesProvider"
import { AppAccentSchema, AppContrastSchema, AppThemeSchema } from "@/lib/ui/app-preferences"
import { switchMyActiveTenant } from "@/actions/tenant-actions"
import { toast } from "sonner"
import { logger } from "@/lib/logger"

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { Badge } from '@/components/ui/Badge';
import { SidebarTrigger } from '@/components/ui/Sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip"
import {
    // Bell,
    Search,
    // User,
    // Settings,
    LogOut,
    ChevronDown,
    Activity,
    LayoutGrid,
    Building2,
    Eye,
    MessageCircle,
    Monitor,
    Moon,
    Palette,
    Sun,
    Timer,
    CircleDot
} from 'lucide-react';
import { useFloatStore } from '@/store/float-store';

const ROLE_LABELS: Record<string, string> = {
    PARTNER: "合伙人",
    SENIOR_LAWYER: "高级律师",
    LAWYER: "专职律师",
    TRAINEE: "实习生",
    ADMIN: "管理员",
    HR: "人事",
    MARKETING: "品牌",
    LEGAL_SECRETARY: "法律秘书",
    CLIENT: "客户",
    FIRM_ENTITY: "律所",
}

type TenantContext = {
    active: { id: string; name: string; role: string | null }
    tenants: Array<{ id: string; name: string; role: string }>
    pendingInvites: number
}

export function AppHeader({ initialTenantContext }: { initialTenantContext: TenantContext | null }) {
    const { data: session } = useSession()
    const { currentRole } = useRole();
    const router = useRouter()
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isPerformanceOpen, setIsPerformanceOpen] = useState(false);
    const [switchingTenantId, setSwitchingTenantId] = useState<string | null>(null)
    const { windows, openWindow, closeWindow } = useFloatStore();
    const { app, persistAppPatch, floatingLauncher, persistFloatingLauncherPatch } = useUiPreferences()

    const userName =
        session?.user?.name ||
        session?.user?.email?.split("@")[0] ||
        "用户"
    const userEmail = session?.user?.email || ""
    const userRole = (() => {
        const user = session?.user as unknown
        if (!user || typeof user !== "object") return undefined
        const role = (user as { role?: unknown }).role
        return typeof role === "string" ? role : undefined
    })()
    const userRoleLabel = userRole ? (ROLE_LABELS[userRole] || userRole) : "用户"

    // Team Chat窗口状态和toggle
    const isChatVisible = windows['team-chat']?.isOpen ?? false;
    const toggleChat = () => {
        if (isChatVisible) {
            closeWindow('team-chat')
        } else {
            openWindow('team-chat', 'CHAT', '团队消息', { scope: "TEAM" })
        }
    }

    // Timer 窗口状态和 toggle
    const isTimerVisible = windows['timer']?.isOpen ?? false;
    const toggleTimer = () => {
        if (isTimerVisible) {
            closeWindow('timer')
        } else {
            openWindow('timer', 'TIMER', '计时器')
        }
    }

    const toggleFloatingLauncher = () => {
        persistFloatingLauncherPatch({ enabled: !floatingLauncher.enabled })
    }

    const toggleDensity = () => {
        persistAppPatch({ density: app.density === "comfortable" ? "compact" : "comfortable" })
    }

    const setTheme = (value: string) => {
        const parsed = AppThemeSchema.safeParse(value)
        if (!parsed.success) return
        persistAppPatch({ theme: parsed.data })
    }

    const themeLabel = app.theme === "system" ? "跟随系统" : app.theme === "dark" ? "暗色" : "浅色"

    const setAccent = (value: string) => {
        const parsed = AppAccentSchema.safeParse(value)
        if (!parsed.success) return
        persistAppPatch({ accent: parsed.data })
    }

    const accentLabel = app.accent === "blue" ? "信息蓝" : app.accent === "slate" ? "权威蓝灰" : "律时橙"

    const setContrast = (value: string) => {
        const parsed = AppContrastSchema.safeParse(value)
        if (!parsed.success) return
        persistAppPatch({ contrast: parsed.data })
    }

    const contrastLabel =
        app.contrast === "system" ? "跟随系统" : app.contrast === "high" ? "高对比" : "正常"
    const { showConfirmation, ConfirmationDialog } = useConfirmationDialog();

    const activeTenantName = initialTenantContext?.active?.name || "default-tenant"
    const activeTenantId = initialTenantContext?.active?.id || null

    const handleSwitchTenant = async (tenantId: string) => {
        if (!tenantId || tenantId === activeTenantId) return
        setSwitchingTenantId(tenantId)
        try {
            const res = await switchMyActiveTenant({ tenantId })
            if (!res.success) {
                toast.error("切换租户失败", { description: res.error })
                return
            }
            toast.success("已切换租户")
            router.push("/dashboard")
            router.refresh()
        } finally {
            setSwitchingTenantId(null)
        }
    }

    // 安全退出登录处理函数
    const handleLogout = () => {
        showConfirmation({
            title: '退出登录',
            message: '确定要退出登录吗？\n\n为了您的账户安全，建议您：\n• 清除浏览器缓存\n• 关闭所有相关标签页\n• 确保在安全环境下操作',
            type: 'warning',
            onConfirm: () => {
                // 清除用户状态
                try {
                    localStorage.removeItem("lawclick-float-storage-v9")
                    localStorage.removeItem("lawclick-user-status-v9")
                    localStorage.removeItem("lawclick-timer-storage")
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    logger.warn("[header] 清理 localStorage 失败（退出登录）", { error: message })
                }

                void signOut({ callbackUrl: "/auth/login" })
            }
        });
    };

    // 键盘快捷键支持
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
                event.preventDefault();
                setIsSearchOpen(true);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <header className="h-[var(--lc-header-height)] border-b border-border bg-background flex items-center justify-between px-2 sm:px-4 md:px-6 relative">
            {/* Left Section */}
            <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-4 min-w-0 flex-shrink-0">
                <SidebarTrigger />

                {/* 全局搜索 - 桌面版 */}
                <div className="hidden lg:flex items-center space-x-2">
                    <Button
                        variant="outline"
                        className="w-64 xl:w-80 justify-start text-muted-foreground"
                        onClick={() => setIsSearchOpen(true)}
                    >
                        <Search className="w-4 h-4 mr-2 flex-shrink-0" />
                        <span className="truncate">搜索案件、文档、仲裁员...</span>
                        <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 flex-shrink-0">
                            <span className="text-xs">⌘</span>K
                        </kbd>
                    </Button>
                </div>

                {/* 平板搜索按钮 */}
                <div className="hidden md:flex lg:hidden">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsSearchOpen(true)}
                        className="w-32"
                    >
                        <Search className="w-4 h-4 mr-2" />
                        <span className="text-sm">搜索</span>
                    </Button>
                </div>

                {/* 移动端搜索按钮 */}
                <div className="md:hidden">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsSearchOpen(true)}
                    >
                        <Search className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Center Section - Role Switcher */}
            <div className="hidden xl:flex items-center absolute left-1/2 transform -translate-x-1/2">

            </div>

            {/* Spacer for mobile */}
            <div className="flex-1 xl:hidden" />

            {/* Right Section */}
            <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-3 lg:space-x-4 flex-shrink-0">
                {/* Role Switcher for mobile/tablet */}
                {/* Role Badge (Read Only) */}
                <div className="xl:hidden">
                    <Badge variant="outline" className="text-xs px-2 py-1 uppercase">
                        {currentRole}
                    </Badge>
                </div>

                {/* Chat Toggle */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={toggleChat}
                            title={isChatVisible ? "隐藏团队消息（浮窗）" : "显示团队消息（浮窗）"}
                            className={`relative flex-shrink-0 transition-all duration-200 ${
                                isChatVisible ? "bg-info/10 text-info hover:bg-info/20" : "hover:bg-accent"
                            }`}
                        >
                            <MessageCircle className="w-4 h-4" />
                            {isChatVisible && <span className="absolute -top-1 -right-1 w-2 h-2 bg-success rounded-full" />}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>团队消息（浮窗）</TooltipContent>
                </Tooltip>

                {/* Timer Toggle */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={toggleTimer}
                            title={isTimerVisible ? "隐藏计时器（浮窗）" : "显示计时器（浮窗）"}
                            className={`relative flex-shrink-0 transition-all duration-200 ${
                                isTimerVisible ? "bg-success/10 text-success hover:bg-success/20" : "hover:bg-accent"
                            }`}
                        >
                            <Timer className="w-4 h-4" />
                            {isTimerVisible && <span className="absolute -top-1 -right-1 w-2 h-2 bg-success rounded-full" />}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>计时器（浮窗）</TooltipContent>
                </Tooltip>

                {/* Notifications */}
                <NotificationTrigger />

                {/* User Menu */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="flex items-center space-x-1 sm:space-x-2 h-auto p-1 sm:p-2 hover-lift group flex-shrink-0">
                            <Avatar className="w-7 h-7 sm:w-8 sm:h-8 group-hover:scale-110 transition-transform duration-300">
                                <AvatarFallback className="bg-gradient-to-r from-primary-500 to-primary-600 text-primary-foreground text-xs sm:text-sm shadow-brand">
                                    {userName.charAt(0)}
                                </AvatarFallback>
                            </Avatar>
                            <div className="hidden lg:flex flex-col items-start min-w-0">
                                <span className="text-sm font-medium text-foreground group-hover:text-primary-700 transition-colors truncate max-w-20 xl:max-w-none">
                                    {userName}
                                </span>
                                <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors truncate max-w-20 xl:max-w-none">
                                    {userRoleLabel}
                                </span>
                            </div>
                            <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground group-hover:text-primary transition-all duration-300 group-data-[state=open]:rotate-180 flex-shrink-0" />
                        </Button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                        align="end"
                        className="w-56 shadow-brand-lg border border-border bg-popover text-popover-foreground rounded-lg"
                        sideOffset={8}
                    >
                        <DropdownMenuLabel className="bg-gradient-to-r from-primary-50 to-primary-100 border-b border-border dark:from-primary-900 dark:to-primary-800">
                            <div className="flex flex-col space-y-1">
                                <span className="text-sm font-medium text-foreground">{userName}</span>
                                <span className="text-xs text-muted-foreground">{userEmail}</span>
                            </div>
                        </DropdownMenuLabel>

                        <DropdownMenuSeparator />

                        {/* 移除“设置与帮助”菜单项，避免与独立设置页重复入口 */}

                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                            className="flex items-center space-x-2 cursor-pointer hover:bg-primary/10 focus:bg-primary/10"
                            onClick={toggleFloatingLauncher}
                        >
                            <LayoutGrid className="w-4 h-4 text-primary-600" />
                            <span>{floatingLauncher.enabled ? "隐藏组件球" : "显示组件球"}</span>
                        </DropdownMenuItem>

                        <DropdownMenuItem
                            className="flex items-center space-x-2 cursor-pointer hover:bg-primary/10 focus:bg-primary/10"
                            onClick={toggleDensity}
                        >
                            <Eye className="w-4 h-4 text-primary-600" />
                            <span>{app.density === "comfortable" ? "切换为紧凑密度" : "切换为舒适密度"}</span>
                        </DropdownMenuItem>

                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger className="cursor-pointer hover:bg-primary/10 focus:bg-primary/10 data-[state=open]:bg-primary/10">
                                <Building2 className="w-4 h-4 text-primary-600" />
                                <span className="flex items-center gap-2">
                                    <span>租户：{activeTenantName}</span>
                                    {initialTenantContext?.pendingInvites ? (
                                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                            邀请 {initialTenantContext.pendingInvites}
                                        </Badge>
                                    ) : null}
                                </span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="shadow-brand-lg border border-border bg-popover text-popover-foreground rounded-lg">
                                {initialTenantContext?.tenants?.length ? (
                                    <DropdownMenuRadioGroup value={activeTenantId ?? undefined} onValueChange={handleSwitchTenant}>
                                        {initialTenantContext.tenants.map((t) => (
                                            <DropdownMenuRadioItem
                                                key={t.id}
                                                value={t.id}
                                                disabled={Boolean(switchingTenantId)}
                                            >
                                                <span className="flex items-center justify-between gap-2 w-full">
                                                    <span className="truncate">{t.name}</span>
                                                    <span className="text-[10px] text-muted-foreground font-mono truncate max-w-24">
                                                        {t.id}
                                                    </span>
                                                </span>
                                            </DropdownMenuRadioItem>
                                        ))}
                                    </DropdownMenuRadioGroup>
                                ) : (
                                    <div className="px-2 py-1.5 text-xs text-muted-foreground">暂无可切换租户</div>
                                )}

                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    className="cursor-pointer hover:bg-primary/10 focus:bg-primary/10"
                                    onSelect={(e) => {
                                        e.preventDefault()
                                        router.push("/tenants")
                                        router.refresh()
                                    }}
                                >
                                    管理租户与邀请
                                </DropdownMenuItem>
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
 
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger className="cursor-pointer hover:bg-primary/10 focus:bg-primary/10 data-[state=open]:bg-primary/10">
                                <Sun className="w-4 h-4 text-primary-600" />
                                <span>主题：{themeLabel}</span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="shadow-brand-lg border border-border bg-popover text-popover-foreground rounded-lg">
                                <DropdownMenuRadioGroup value={app.theme} onValueChange={setTheme}>
                                    <DropdownMenuRadioItem value="system">
                                        <span className="flex items-center gap-2">
                                            <Monitor className="w-4 h-4 text-muted-foreground" />
                                            <span>跟随系统</span>
                                        </span>
                                    </DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="light">
                                        <span className="flex items-center gap-2">
                                            <Sun className="w-4 h-4 text-muted-foreground" />
                                            <span>浅色</span>
                                        </span>
                                    </DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="dark">
                                        <span className="flex items-center gap-2">
                                            <Moon className="w-4 h-4 text-muted-foreground" />
                                            <span>暗色</span>
                                        </span>
                                    </DropdownMenuRadioItem>
                                </DropdownMenuRadioGroup>
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>

                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger className="cursor-pointer hover:bg-primary/10 focus:bg-primary/10 data-[state=open]:bg-primary/10">
                                <Palette className="w-4 h-4 text-primary-600" />
                                <span>强调色：{accentLabel}</span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="shadow-brand-lg border border-border bg-popover text-popover-foreground rounded-lg">
                                <DropdownMenuRadioGroup value={app.accent} onValueChange={setAccent}>
                                    <DropdownMenuRadioItem value="orange">
                                        <span className="flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-[color:var(--lc-accent-swatch-orange)]" />
                                            <span>律时橙</span>
                                        </span>
                                    </DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="blue">
                                        <span className="flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-[color:var(--lc-accent-swatch-blue)]" />
                                            <span>信息蓝</span>
                                        </span>
                                    </DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="slate">
                                        <span className="flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-[color:var(--lc-accent-swatch-slate)]" />
                                            <span>权威蓝灰</span>
                                        </span>
                                    </DropdownMenuRadioItem>
                                </DropdownMenuRadioGroup>
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>

                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger className="cursor-pointer hover:bg-primary/10 focus:bg-primary/10 data-[state=open]:bg-primary/10">
                                <CircleDot className="w-4 h-4 text-primary-600" />
                                <span>对比度：{contrastLabel}</span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="shadow-brand-lg border border-border bg-popover text-popover-foreground rounded-lg">
                                <DropdownMenuRadioGroup value={app.contrast} onValueChange={setContrast}>
                                    <DropdownMenuRadioItem value="system">
                                        <span className="flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                                            <span>跟随系统</span>
                                        </span>
                                    </DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="normal">
                                        <span className="flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-muted" />
                                            <span>正常</span>
                                        </span>
                                    </DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="high">
                                        <span className="flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-foreground" />
                                            <span>高对比</span>
                                        </span>
                                    </DropdownMenuRadioItem>
                                </DropdownMenuRadioGroup>
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>

                        <DropdownMenuItem
                            className="flex items-center space-x-2 cursor-pointer hover:bg-primary/10 focus:bg-primary/10"
                            onClick={() => setIsPerformanceOpen(true)}
                        >
                            <Activity className="w-4 h-4 text-success" />
                            <span>性能监控</span>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                            className="flex items-center space-x-2 cursor-pointer text-destructive hover:bg-destructive/10 focus:bg-destructive/10"
                            onClick={handleLogout}
                        >
                            <LogOut className="w-4 h-4" />
                            <span>退出登录</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* 全局搜索组件 */}
            {isSearchOpen ? <CommandPalette isOpen={true} onClose={() => setIsSearchOpen(false)} /> : null}

            {/* 性能监控组件 */}
            <PerformanceMonitor
                isVisible={isPerformanceOpen}
                onClose={() => setIsPerformanceOpen(false)}
            />

            {/* 确认对话框 */}
            <ConfirmationDialog />
        </header>
    );
}
