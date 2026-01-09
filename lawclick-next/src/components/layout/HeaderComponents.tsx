"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEventHandler } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import {
    Activity,
    Bell,
    Briefcase,
    CheckSquare,
    FileText,
    Loader2,
    Search,
    User2,
} from "lucide-react"

import { globalSearch, type GlobalSearchGroup, type GlobalSearchItem } from "@/actions/search-actions"
import { getMyNotifications, markAllNotificationsRead, markNotificationRead } from "@/actions/notification-actions"
import { navLabelKeyFromHref } from "@/lib/i18n/nav-keys"
import { Button } from "@/components/ui/Button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/Dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover"
import { ScrollArea } from "@/components/ui/ScrollArea"
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/Command"
import { useRole } from "@/components/layout/RoleContext"
import { getNavigationForRole } from "@/config/navigation"
import { useFloatStore } from "@/store/float-store"
 
type NotificationItemRaw = Awaited<ReturnType<typeof getMyNotifications>>["items"][number]
type NotificationItem = Omit<NotificationItemRaw, "createdAt" | "readAt"> & {
    createdAt: NotificationItemRaw["createdAt"] | string
    readAt: NotificationItemRaw["readAt"] | string
}

function formatRelativeTime(value: string | Date) {
    const d = typeof value === "string" ? new Date(value) : value
    if (Number.isNaN(d.getTime())) return ""
    const diffMs = Date.now() - d.getTime()
    if (diffMs < 60_000) return "刚刚"
    if (diffMs < 60 * 60_000) return `${Math.floor(diffMs / 60_000)} 分钟前`
    if (diffMs < 24 * 60 * 60_000) return `${Math.floor(diffMs / (60 * 60_000))} 小时前`
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export function NotificationTrigger() {
    const router = useRouter()
    const [isOpen, setIsOpen] = useState(false)
    const [notifications, setNotifications] = useState<NotificationItem[]>([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [loading, setLoading] = useState(false)

    const refresh = async (take = 20) => {
        setLoading(true)
        try {
            const res = await getMyNotifications({ take })
            if (res.success) {
                setNotifications(res.items)
                setUnreadCount(res.unreadCount || 0)
            }
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void refresh(10)
    }, [])

    useEffect(() => {
        if (isOpen) void refresh(30)
    }, [isOpen])

    const markAsRead = async (id: string) => {
        const target = notifications.find((n) => n.id === id)
        if (!target || target.readAt) return

        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date() } : n)))
        setUnreadCount((prev) => Math.max(0, prev - 1))

        await markNotificationRead(id)
    }

    const markAllAsRead = async () => {
        await markAllNotificationsRead()
        setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date() })))
        setUnreadCount(0)
    }

    const openAll = () => {
        setIsOpen(false)
        router.push("/notifications")
    }

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative"
                    aria-label="通知"
                    data-testid="header-notifications-trigger"
                >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground flex items-center justify-center px-1">
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
                <div className="flex items-center justify-between p-3 border-b">
                    <h3 className="font-semibold text-sm">通知</h3>
                    {unreadCount > 0 && (
                        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllAsRead}>
                            全部已读
                        </Button>
                    )}
                </div>

                <ScrollArea className="h-[320px]">
                    {loading ? (
                        <div className="flex items-center justify-center h-32 text-muted-foreground">
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            <span className="text-sm">加载中...</span>
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                            <Bell className="h-8 w-8 mb-2 opacity-50" />
                            <p className="text-sm">暂无通知</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {notifications.map((notification) => {
                                const time = formatRelativeTime(notification.createdAt)
                                const unread = !notification.readAt

                                const icon =
                                    notification.type === "CHAT_MESSAGE" ? (
                                        <Bell className="h-4 w-4 text-muted-foreground" />
                                    ) : notification.type.startsWith("CASE_") ? (
                                        <Briefcase className="h-4 w-4 text-primary-600" />
                                    ) : notification.type.startsWith("TASK_") ? (
                                        <CheckSquare className="h-4 w-4 text-info" />
                                    ) : (
                                        <Bell className="h-4 w-4 text-muted-foreground" />
                                    )

                                return (
                                    <div
                                        key={notification.id}
                                        className={`flex gap-3 p-3 hover:bg-muted/50 transition-colors cursor-pointer ${unread ? "bg-primary/5" : ""}`}
                                        onClick={async () => {
                                            await markAsRead(notification.id)
                                            if (notification.actionUrl) {
                                                setIsOpen(false)
                                                router.push(notification.actionUrl)
                                            }
                                        }}
                                    >
                                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                                            {icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className={`text-sm ${unread ? "font-medium" : ""}`}>
                                                    {notification.title}
                                                </p>
                                                {unread && (
                                                    <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                                                )}
                                            </div>
                                            {notification.content ? (
                                                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                                    {notification.content}
                                                </p>
                                            ) : null}
                                            <p className="text-[10px] text-muted-foreground mt-1">{time}</p>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </ScrollArea>

                <div className="p-2 border-t">
                    <Button variant="ghost" size="sm" className="w-full text-xs" onClick={openAll}>
                        查看全部通知
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    )
}

export function GlobalSearch({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const router = useRouter()
    const [query, setQuery] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [groups, setGroups] = useState<GlobalSearchGroup[]>([])
    const [selectedIndex, setSelectedIndex] = useState(0)
    const requestSeq = useRef(0)

    const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups])

    useEffect(() => {
        if (!isOpen) return
        const q = query.trim()
        if (q.length < 2) {
            setError(null)
            return
        }

        const seq = ++requestSeq.current
        const timer = setTimeout(async () => {
            setLoading(true)
            setError(null)
            try {
                const res = await globalSearch(q, { takePerType: 6 })
                if (seq !== requestSeq.current) return
                if (!res.success) {
                    setGroups([])
                    setSelectedIndex(0)
                    setError(res.error || "搜索失败")
                    return
                }
                setGroups(res.data.groups || [])
                setSelectedIndex(0)
            } catch (e) {
                if (seq !== requestSeq.current) return
                setGroups([])
                setSelectedIndex(0)
                setError(e instanceof Error ? e.message : "搜索失败")
            } finally {
                if (seq !== requestSeq.current) return
                setLoading(false)
            }
        }, 200)

        return () => clearTimeout(timer)
    }, [query, isOpen])

    const pick = (item: GlobalSearchItem) => {
        onClose()
        router.push(item.url)
    }

    const onKeyDown: KeyboardEventHandler<HTMLInputElement> = (e) => {
        if (e.key === "Escape") {
            e.preventDefault()
            onClose()
            return
        }
        if (flatItems.length === 0) return

        if (e.key === "ArrowDown") {
            e.preventDefault()
            setSelectedIndex((prev) => (prev + 1) % flatItems.length)
        } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setSelectedIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length)
        } else if (e.key === "Enter") {
            e.preventDefault()
            const item = flatItems[selectedIndex]
            if (item) pick(item)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-20" onClick={onClose}>
            <div className="bg-popover text-popover-foreground p-4 rounded-lg w-[640px] h-[420px]" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 border-b border-border pb-2">
                    <Search className="h-4 w-4" />
                    <input
                        className="flex-1 outline-none bg-transparent text-foreground placeholder:text-muted-foreground"
                        placeholder="搜索案件、任务、文档、客户…（至少 2 个字）"
                        autoFocus
                        value={query}
                        onChange={(e) => {
                            const nextQuery = e.target.value
                            setQuery(nextQuery)
                            if (nextQuery.trim().length < 2) {
                                setGroups([])
                                setSelectedIndex(0)
                                setLoading(false)
                                setError(null)
                            }
                        }}
                        onKeyDown={onKeyDown}
                    />
                    {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                </div>

                <ScrollArea className="h-[360px] pr-2">
                    <div className="py-3">
                        {query.trim().length < 2 ? (
                            <div className="p-4 text-center text-muted-foreground text-sm">输入至少 2 个字开始搜索</div>
                        ) : error ? (
                            <div className="p-4 text-center text-destructive text-sm">搜索失败：{error}</div>
                        ) : !loading && groups.length === 0 ? (
                            <div className="p-4 text-center text-muted-foreground text-sm">无匹配结果</div>
                        ) : (
                            <div className="space-y-4">
                                {groups.map((group) => (
                                    <div key={group.type} className="space-y-1">
                                        <div className="text-xs font-medium text-muted-foreground px-2">
                                            {group.label}
                                        </div>
                                        <div className="border border-border rounded-md overflow-hidden">
                                            {group.items.map((item) => {
                                                const idx = flatItems.findIndex(
                                                    (x) => x.type === item.type && x.id === item.id
                                                )
                                                const selected = idx === selectedIndex

                                                const icon =
                                                    item.type === "CASE" ? (
                                                        <Briefcase className="h-4 w-4 text-primary-600" />
                                                    ) : item.type === "TASK" ? (
                                                        <CheckSquare className="h-4 w-4 text-info" />
                                                    ) : item.type === "DOCUMENT" ? (
                                                        <FileText className="h-4 w-4 text-muted-foreground" />
                                                    ) : (
                                                        <User2 className="h-4 w-4 text-muted-foreground" />
                                                    )

                                                return (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        className={`w-full text-left px-3 py-2 flex items-start gap-3 hover:bg-muted/50 transition-colors ${selected ? "bg-muted" : ""}`}
                                                        onMouseEnter={() => setSelectedIndex(Math.max(0, idx))}
                                                        onClick={() => pick(item)}
                                                    >
                                                        <div className="mt-0.5">{icon}</div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-sm font-medium truncate">
                                                                {item.title}
                                                            </div>
                                                            <div className="text-xs text-muted-foreground truncate">
                                                                {item.subtitle}
                                                            </div>
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>
        </div>
    )
}

export function CommandPalette({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const router = useRouter()
    const { currentRole } = useRole()
    const { openWindow } = useFloatStore()
    const tNav = useTranslations("nav")
    const labelForHref = useCallback((href: string, fallback: string) => {
        const key = navLabelKeyFromHref(href)
        return key && tNav.has(key) ? tNav(key) : fallback
    }, [tNav])

    const navigationItems = useMemo(() => getNavigationForRole(currentRole), [currentRole])
    const navigationCommands = useMemo(() => {
        const items: Array<{ title: string; href: string }> = []
        for (const nav of navigationItems) {
            const navTitle = labelForHref(nav.href, nav.name)
            items.push({ title: navTitle, href: nav.href })
            for (const child of nav.children ?? []) {
                const childTitle = labelForHref(child.href, child.name)
                items.push({ title: `${navTitle} / ${childTitle}`, href: child.href })
            }
        }
        return items
    }, [navigationItems, labelForHref])

    const [query, setQuery] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [groups, setGroups] = useState<GlobalSearchGroup[]>([])
    const requestSeq = useRef(0)

    useEffect(() => {
        if (!isOpen) {
            setQuery("")
            setLoading(false)
            setError(null)
            setGroups([])
        }
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return
        const q = query.trim()
        if (q.length < 2) {
            setGroups([])
            setLoading(false)
            setError(null)
            return
        }

        const seq = ++requestSeq.current
        const timer = setTimeout(async () => {
            setLoading(true)
            setError(null)
            try {
                const res = await globalSearch(q, { takePerType: 6 })
                if (seq !== requestSeq.current) return
                if (!res.success) {
                    setGroups([])
                    setError(res.error || "搜索失败")
                    return
                }
                setGroups(res.data.groups || [])
            } catch (e) {
                if (seq !== requestSeq.current) return
                setGroups([])
                setError(e instanceof Error ? e.message : "搜索失败")
            } finally {
                if (seq !== requestSeq.current) return
                setLoading(false)
            }
        }, 200)

        return () => clearTimeout(timer)
    }, [query, isOpen])

    const close = () => onClose()
    const navigate = (href: string) => {
        close()
        router.push(href)
    }

    const hasSearchSignal = query.trim().length >= 2

    return (
        <CommandDialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open) close()
            }}
        >
            <CommandInput
                placeholder="搜索案件、任务、文档、客户…（至少 2 个字）"
                value={query}
                onValueChange={setQuery}
            />
            <CommandList>
                <CommandGroup heading="快速操作">
                    <CommandItem
                        value="打开团队消息 打开聊天"
                        onSelect={() => {
                            close()
                            openWindow("team-chat", "CHAT", "团队消息", { scope: "TEAM" })
                        }}
                    >
                        <Bell className="h-4 w-4 mr-2 text-info" />
                        打开 团队消息
                    </CommandItem>
                    <CommandItem
                        value="打开计时器"
                        onSelect={() => {
                            close()
                            openWindow("timer", "TIMER", "计时器")
                        }}
                    >
                        <Activity className="h-4 w-4 mr-2 text-success" />
                        打开 计时器
                    </CommandItem>
                </CommandGroup>

                <CommandSeparator />

                <CommandGroup heading="导航">
                    {navigationCommands.map((nav) => (
                        <CommandItem key={nav.href} value={nav.title} onSelect={() => navigate(nav.href)}>
                            <Search className="h-4 w-4 mr-2 text-muted-foreground" />
                            <span className="truncate">{nav.title}</span>
                        </CommandItem>
                    ))}
                </CommandGroup>

                <CommandSeparator />

                {!hasSearchSignal ? (
                    <CommandItem disabled value="输入至少 2 个字开始搜索">
                        <span className="text-muted-foreground text-sm">输入至少 2 个字开始搜索</span>
                    </CommandItem>
                ) : loading ? (
                    <CommandItem disabled value="搜索中">
                        <Loader2 className="h-4 w-4 mr-2 animate-spin text-muted-foreground" />
                        搜索中…
                    </CommandItem>
                ) : error ? (
                    <CommandItem disabled value={`搜索失败 ${error}`}>
                        <span className="text-destructive text-sm truncate">搜索失败：{error}</span>
                    </CommandItem>
                ) : groups.length === 0 ? (
                    <CommandEmpty>无匹配结果</CommandEmpty>
                ) : (
                    groups.map((group) => (
                        <CommandGroup key={group.type} heading={group.label}>
                            {group.items.map((item) => {
                                const icon =
                                    item.type === "CASE" ? (
                                        <Briefcase className="h-4 w-4 text-primary-600" />
                                    ) : item.type === "TASK" ? (
                                        <CheckSquare className="h-4 w-4 text-info" />
                                    ) : item.type === "DOCUMENT" ? (
                                        <FileText className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                        <User2 className="h-4 w-4 text-muted-foreground" />
                                    )

                                return (
                                    <CommandItem
                                        key={`${item.type}:${item.id}`}
                                        value={`${item.title} ${item.subtitle}`}
                                        onSelect={() => navigate(item.url)}
                                    >
                                        <div className="flex items-start gap-3 min-w-0">
                                            <div className="mt-0.5 shrink-0">{icon}</div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-medium truncate">{item.title}</div>
                                                <div className="text-xs text-muted-foreground truncate">
                                                    {item.subtitle}
                                                </div>
                                            </div>
                                        </div>
                                    </CommandItem>
                                )
                            })}
                        </CommandGroup>
                    ))
                )}
            </CommandList>
        </CommandDialog>
    )
}

export function PerformanceMonitor({ isVisible, onClose }: { isVisible: boolean; onClose: () => void }) {
    if (!isVisible) return null

    type HeapMemory = { usedJSHeapSize?: number; jsHeapSizeLimit?: number }
    const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : null
    const maybeMemory = (
        typeof performance !== "undefined" ? (performance as unknown as { memory?: HeapMemory }).memory : undefined
    ) as HeapMemory | undefined
    const usedMB = maybeMemory?.usedJSHeapSize ? Math.round(maybeMemory.usedJSHeapSize / 1024 / 1024) : null
    const limitMB = maybeMemory?.jsHeapSizeLimit ? Math.round(maybeMemory.jsHeapSizeLimit / 1024 / 1024) : null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
            <div className="bg-popover text-popover-foreground p-6 rounded-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                    <Activity className="h-5 w-5 text-success" />
                    性能与环境（浏览器侧）
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                    说明：本面板仅展示客户端可获取的运行时信息，不代表服务器负载。
                </p>
                    <div className="space-y-2 text-sm">
                        <p>逻辑 CPU 核心：{cores ?? "未知"}</p>
                        <p>
                            JS 堆内存：{" "}
                            {usedMB != null && limitMB != null
                                ? `${usedMB}MB / ${limitMB}MB`
                                : "浏览器不支持"}
                        </p>
                    </div>
                <Button onClick={onClose} className="mt-4 w-full">
                    关闭
                </Button>
            </div>
        </div>
    )
}

export function useConfirmationDialog() {
    const [isOpen, setIsOpen] = useState(false)
    const [config, setConfig] = useState<{
        title: string
        message: string
        type: "warning" | "info"
        onConfirm: () => void
    } | null>(null)

    const showConfirmation = (cfg: {
        title: string
        message: string
        type: "warning" | "info"
        onConfirm: () => void
    }) => {
        setConfig(cfg)
        setIsOpen(true)
    }

    const ConfirmationDialog = () => (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{config?.title}</DialogTitle>
                    <DialogDescription className="whitespace-pre-wrap">{config?.message}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)}>
                        取消
                    </Button>
                    <Button
                        variant={config?.type === "warning" ? "destructive" : "default"}
                        onClick={() => {
                            config?.onConfirm()
                            setIsOpen(false)
                        }}
                    >
                        确认
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )

    return { showConfirmation, ConfirmationDialog }
}
