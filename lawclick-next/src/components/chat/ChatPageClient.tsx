"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { usePathname, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Briefcase, Hash, MoreHorizontal, Search, Send, Users } from "lucide-react"
import {
    getChatMessages,
    getMyChatThreads,
    getOrCreateDirectThread,
    markAllChatThreadsRead,
    sendChatMessage,
} from "@/actions/chat-actions"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Avatar, AvatarFallback } from "@/components/ui/Avatar"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/Dialog"
import { Input } from "@/components/ui/Input"
import { ScrollArea } from "@/components/ui/ScrollArea"

type ChatUserLite = {
    id: string
    name: string | null
    email: string
    avatarUrl: string | null
}

type ThreadItem = {
    id: string
    key: string
    type: "TEAM" | "CASE" | "DIRECT"
    title: string
    case: { id: string; title: string; caseCode: string } | null
    lastMessage: {
        id: string
        content: string
        createdAt: string | Date
        sender: ChatUserLite
    } | null
    unreadCount: number
    participants: ChatUserLite[]
}

type MessageItem = {
    id: string
    content: string
    createdAt: string | Date
    senderId: string
    sender: ChatUserLite
    type: "TEXT" | "SYSTEM"
}

export function ChatPageClient({
    me,
    initialThreads,
    initialThreadId,
    initialMessages,
}: {
    me: ChatUserLite
    initialThreads: ThreadItem[]
    initialThreadId: string | null
    initialMessages: MessageItem[]
}) {
    const { data: session } = useSession()
    const myId = (() => {
        const user = session?.user as unknown
        if (!user || typeof user !== "object") return me.id
        const id = (user as { id?: unknown }).id
        return typeof id === "string" ? id : me.id
    })()

    const [threads, setThreads] = useState<ThreadItem[]>(initialThreads)
    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(initialThreadId)
    const [messages, setMessages] = useState<MessageItem[]>(initialMessages)
    const [messageInput, setMessageInput] = useState("")
    const [searchQuery, setSearchQuery] = useState("")
    const [loadingMessages, setLoadingMessages] = useState(false)
    const [refreshingThreads, setRefreshingThreads] = useState(false)
    const [markingAllRead, setMarkingAllRead] = useState(false)

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const searchParams = useSearchParams()
    const pathname = usePathname()
    const threadIdParam = searchParams.get("threadId")

    const selectedThread = useMemo(
        () => threads.find((t) => t.id === selectedThreadId) || null,
        [threads, selectedThreadId]
    )

    const filteredThreads = useMemo(() => {
        const q = searchQuery.trim().toLowerCase()
        if (!q) return threads
        return threads.filter((t) => {
            const display = getThreadDisplay(t, myId)
            return display.name.toLowerCase().includes(q)
        })
    }, [threads, searchQuery, myId])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages.length, selectedThreadId])

    useEffect(() => {
        if (!selectedThreadId && threads.length > 0) {
            setSelectedThreadId(threads[0].id)
        }
    }, [threads, selectedThreadId])

    const loadMessages = useCallback(async (threadId: string) => {
        setLoadingMessages(true)
        try {
            const res = await getChatMessages(threadId, 80)
            setMessages(res.messages)
            setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unreadCount: 0 } : t)))
        } catch {
            toast.error("加载消息失败")
        } finally {
            setLoadingMessages(false)
        }
    }, [])

    const updateThreadInUrl = useCallback(
        (threadId: string) => {
            const params = new URLSearchParams(searchParams.toString())
            params.set("threadId", threadId)
            const qs = params.toString()
            const url = qs ? `${pathname}?${qs}` : pathname
            window.history.replaceState(null, "", url)
        },
        [pathname, searchParams]
    )

    const handleSelectThread = useCallback(
        async (threadId: string) => {
            setSelectedThreadId(threadId)
            updateThreadInUrl(threadId)
            await loadMessages(threadId)
        },
        [loadMessages, updateThreadInUrl]
    )

    const refreshThreads = useCallback(
        async (opts?: { preferThreadId?: string | null }) => {
            if (refreshingThreads) return

            setRefreshingThreads(true)
            try {
                const res = await getMyChatThreads()
                setThreads(res.threads)

                const preferId = opts?.preferThreadId || selectedThreadId
                if (preferId && res.threads.some((t) => t.id === preferId)) {
                    return
                }

                const first = res.threads[0]?.id
                if (first) {
                    await handleSelectThread(first)
                } else {
                    setSelectedThreadId(null)
                    setMessages([])
                }
            } catch {
                toast.error("刷新会话失败")
            } finally {
                setRefreshingThreads(false)
            }
        },
        [handleSelectThread, refreshingThreads, selectedThreadId]
    )

    const markAllRead = useCallback(async () => {
        if (markingAllRead) return
        setMarkingAllRead(true)
        try {
            const result = await markAllChatThreadsRead()
            if (!result.success) {
                toast.error("操作失败", { description: result.error })
                return
            }
            setThreads((prev) => prev.map((t) => ({ ...t, unreadCount: 0 })))
            toast.success("已全部标记为已读")
        } catch {
            toast.error("操作失败")
        } finally {
            setMarkingAllRead(false)
        }
    }, [markingAllRead])

    const startDirectChat = useCallback(
        async (userId: string) => {
            const res = await getOrCreateDirectThread(userId)
            if (!res.success) {
                toast.error("无法创建私聊", { description: res.error })
                return
            }

            await refreshThreads({ preferThreadId: res.threadId })
            await handleSelectThread(res.threadId)
        },
        [handleSelectThread, refreshThreads]
    )

    // 支持 /chat?threadId=... 同页跳转定位（通知 actionUrl 场景）
    useEffect(() => {
        if (!threadIdParam) return
        if (threadIdParam === selectedThreadId) return

        const exists = threads.some((t) => t.id === threadIdParam)
        if (!exists) {
            toast.error("无法打开会话：会话不存在或无权限访问")
            return
        }

        void handleSelectThread(threadIdParam)
    }, [handleSelectThread, selectedThreadId, threadIdParam, threads])

    const handleSendMessage = async () => {
        if (!selectedThreadId) return
        const text = messageInput.trim()
        if (!text) return

        setMessageInput("")

        const result = await sendChatMessage(selectedThreadId, text)
        if (!result.success) {
            toast.error("发送失败", { description: result.error })
            return
        }

        const created: MessageItem = result.message
        setMessages((prev) => [...prev, created])
        setThreads((prev) =>
            prev
                .map((t) =>
                    t.id === selectedThreadId
                        ? {
                              ...t,
                              lastMessage: {
                                  id: created.id,
                                  content: created.content,
                                  createdAt: created.createdAt,
                                  sender: created.sender,
                              },
                              unreadCount: 0,
                          }
                        : t
                )
                .sort((a, b) => {
                    const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0
                    const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0
                    return bTime - aTime
                })
        )
    }

    const threadListPanel = (
        <Card className="h-full flex flex-col">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base">消息</CardTitle>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="会话操作">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem disabled={refreshingThreads} onClick={() => void refreshThreads()}>
                                刷新会话列表
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={markingAllRead} onClick={() => void markAllRead()}>
                                全部标记已读
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={() => {
                                    const team = threads.find((t) => t.type === "TEAM")
                                    if (!team) {
                                        void refreshThreads()
                                        return
                                    }
                                    void handleSelectThread(team.id)
                                }}
                            >
                                打开团队群聊
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="搜索会话..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 h-9"
                    />
                </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 p-0 overflow-hidden">
                <ScrollArea className="h-full">
                    {filteredThreads.length === 0 ? (
                        <div className="p-6 text-sm text-muted-foreground text-center">暂无会话</div>
                    ) : (
                        <div className="p-2 space-y-1">
                            {filteredThreads.map((t) => {
                                const display = getThreadDisplay(t, myId)
                                const active = selectedThreadId === t.id
                                const lastTime = t.lastMessage?.createdAt ? formatTime(t.lastMessage.createdAt) : ""

                                return (
                                    <div
                                        key={t.id}
                                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                                            active ? "bg-primary/10" : "hover:bg-muted"
                                        }`}
                                        onClick={() => void handleSelectThread(t.id)}
                                    >
                                        <div className="relative">
                                            <Avatar className="h-10 w-10">
                                                <AvatarFallback className="bg-muted text-muted-foreground">
                                                    {t.type === "TEAM" ? (
                                                        <Hash className="h-4 w-4" />
                                                    ) : t.type === "CASE" ? (
                                                        <Briefcase className="h-4 w-4 text-primary" />
                                                    ) : (
                                                        display.avatarText
                                                    )}
                                                </AvatarFallback>
                                            </Avatar>
                                            {t.unreadCount > 0 ? (
                                                <span className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground flex items-center justify-center px-1">
                                                    {t.unreadCount > 99 ? "99+" : t.unreadCount}
                                                </span>
                                            ) : null}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-medium text-sm truncate">{display.name}</span>
                                                <span className="text-[10px] text-muted-foreground shrink-0">{lastTime}</span>
                                            </div>
                                            <p className="text-xs text-muted-foreground truncate">
                                                {t.lastMessage?.content || "暂无消息"}
                                            </p>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </ScrollArea>
            </CardContent>
        </Card>
    )

    const messagePanel = (
        <Card className="h-full flex flex-col">
            <CardHeader className="pb-3 border-b">
                {selectedThread ? (
                    <ChatHeader thread={selectedThread} myId={myId} onStartDirectChat={startDirectChat} />
                ) : (
                    <div className="text-sm text-muted-foreground">请选择一个会话</div>
                )}
            </CardHeader>

            <CardContent className="flex-1 min-h-0 p-0 overflow-hidden">
                <ScrollArea className="h-full p-4">
                    {loadingMessages ? (
                        <div className="text-sm text-muted-foreground text-center py-10">加载中...</div>
                    ) : (
                        <div className="space-y-4">
                            {messages.map((msg) => (
                                <MessageRow key={msg.id} msg={msg} myId={myId} />
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </ScrollArea>
            </CardContent>

            <div className="border-t p-4">
                <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void handleSendMessage()
                    }}
                >
                    <Input
                        placeholder={selectedThread ? "输入消息..." : "请选择会话"}
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        disabled={!selectedThreadId}
                        className="flex-1"
                    />
                    <Button type="submit" size="icon" disabled={!selectedThreadId || !messageInput.trim()}>
                        <Send className="h-4 w-4" />
                    </Button>
                </form>
            </div>
        </Card>
    )

    const threadInfoPanel = selectedThread ? (
        <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">类型</span>
                <Badge variant="outline" className="text-xs">
                    {selectedThread.type}
                </Badge>
            </div>
            {selectedThread.type === "CASE" && selectedThread.case ? (
                <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">关联案件</span>
                        <Badge variant="secondary" className="text-xs">
                            {selectedThread.case.caseCode}
                        </Badge>
                    </div>
                    <Link href={`/cases/${selectedThread.case.id}`} className="font-medium hover:underline underline-offset-4">
                        {selectedThread.case.title}
                    </Link>
                </div>
            ) : null}
            <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">参与者</span>
                <Badge variant="secondary" className="text-xs">
                    {selectedThread.participants.length} 人
                </Badge>
            </div>
            <div className="space-y-2">
                {selectedThread.participants.slice(0, 12).map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">{p.name || p.email}</span>
                        <span className="text-xs text-muted-foreground font-mono shrink-0">{p.email}</span>
                    </div>
                ))}
                {selectedThread.participants.length > 12 ? (
                    <div className="text-xs text-muted-foreground">还有 {selectedThread.participants.length - 12} 人…</div>
                ) : null}
            </div>
        </div>
    ) : (
        <div className="text-sm text-muted-foreground">请选择一个会话查看详情</div>
    )

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_chat_threads",
            title: "会话列表",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 4, h: 18, minW: 3, minH: 10 },
            content: threadListPanel,
        },
        {
            id: "b_chat_messages",
            title: selectedThread ? getThreadDisplay(selectedThread, myId).name : "对话窗口",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 8, h: 18, minW: 5, minH: 10 },
            content: messagePanel,
        },
        {
            id: "b_chat_thread_info",
            title: "会话信息",
            pinned: false,
            defaultSize: { w: 4, h: 10, minW: 3, minH: 6 },
            content: threadInfoPanel,
        },
    ]

    return <SectionWorkspace title="消息沟通" sectionId="chat_main" catalog={catalog} className="h-[calc(100vh-8rem)]" />
}

function ChatHeader({
    thread,
    myId,
    onStartDirectChat,
}: {
    thread: ThreadItem
    myId: string
    onStartDirectChat: (userId: string) => Promise<void>
}) {
    const display = getThreadDisplay(thread, myId)
    const [participantsOpen, setParticipantsOpen] = useState(false)
    return (
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-muted text-muted-foreground">
                        {thread.type === "TEAM" ? (
                            <Hash className="h-4 w-4" />
                        ) : thread.type === "CASE" ? (
                            <Briefcase className="h-4 w-4 text-primary" />
                        ) : (
                            display.avatarText
                        )}
                    </AvatarFallback>
                </Avatar>
                <div>
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{display.name}</span>
                        {thread.type === "TEAM" ? (
                            <Badge variant="secondary" className="text-[10px]">
                                团队
                            </Badge>
                        ) : null}
                        {thread.type === "CASE" && thread.case ? (
                            <Badge variant="secondary" className="text-[10px] bg-primary-50 text-primary-700">
                                {thread.case.caseCode}
                            </Badge>
                        ) : null}
                    </div>
                    {thread.type === "CASE" && thread.case ? (
                        <p className="text-xs text-muted-foreground">关联案件：{thread.case.title}</p>
                    ) : null}
                </div>
            </div>
            <div className="flex items-center gap-1">
                <Dialog open={participantsOpen} onOpenChange={setParticipantsOpen}>
                    <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="参与者">
                            <Users className="h-4 w-4" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-xl">
                        <DialogHeader>
                            <DialogTitle>参与者（{thread.participants.length} 人）</DialogTitle>
                        </DialogHeader>
                        <ScrollArea className="max-h-[60vh] pr-4">
                            <div className="space-y-2">
                                {thread.participants.map((p) => {
                                    const isMe = p.id === myId
                                    const canStartChat = !isMe && thread.type !== "DIRECT"

                                    return (
                                        <div
                                            key={p.id}
                                            className="flex items-center justify-between gap-2 rounded-md border bg-card/50 px-3 py-2"
                                        >
                                            <div className="min-w-0 flex items-center gap-3">
                                                <Avatar className="h-8 w-8">
                                                    <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                                                        {(p.name || p.email || "U").slice(0, 1)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <div className="text-sm font-medium truncate">{p.name || p.email}</div>
                                                        {isMe ? (
                                                            <Badge variant="secondary" className="text-[10px]">
                                                                我
                                                            </Badge>
                                                        ) : null}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground truncate">{p.email}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <Button asChild size="sm" variant="outline">
                                                    <Link href={`/team/${p.id}/card`}>名片</Link>
                                                </Button>
                                                {canStartChat ? (
                                                    <Button
                                                        size="sm"
                                                        onClick={() => {
                                                            setParticipantsOpen(false)
                                                            void onStartDirectChat(p.id)
                                                        }}
                                                    >
                                                        私聊
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </ScrollArea>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    )
}

function MessageRow({ msg, myId }: { msg: MessageItem; myId: string }) {
    const isMe = msg.senderId === myId
    const time = formatTime(msg.createdAt)

    if (msg.type === "SYSTEM") {
        return <div className="text-center text-xs text-muted-foreground">{msg.content}</div>
    }

    return (
        <div className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
            <div className={`flex gap-2 max-w-[70%] ${isMe ? "flex-row-reverse" : ""}`}>
                {!isMe ? (
                    <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-primary-100 text-primary-600">
                            {(msg.sender?.name || msg.sender?.email || "U").slice(0, 1)}
                        </AvatarFallback>
                    </Avatar>
                ) : null}

                <div>
                    {!isMe ? (
                        <p className="text-xs text-muted-foreground mb-1">{msg.sender?.name || msg.sender?.email}</p>
                    ) : null}
                    <div className={`rounded-lg px-3 py-2 ${isMe ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                    <p className={`text-[10px] text-muted-foreground mt-1 ${isMe ? "text-right" : ""}`}>{time}</p>
                </div>
            </div>
        </div>
    )
}

function getThreadDisplay(thread: ThreadItem, myId: string) {
    if (thread.type === "DIRECT") {
        const other = thread.participants.find((p) => p.id !== myId)
        const name = other?.name || other?.email || "私聊"
        return { name, avatarText: (name || "U").slice(0, 1) }
    }
    if (thread.type === "CASE") {
        const name = thread.case?.title || thread.title
        return { name, avatarText: "案" }
    }
    return { name: thread.title || "团队群聊", avatarText: "#" }
}

function formatTime(value: string | Date) {
    const d = typeof value === "string" ? new Date(value) : value
    if (Number.isNaN(d.getTime())) return ""
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}
