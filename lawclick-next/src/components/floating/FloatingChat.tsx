"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"

import {
    getChatMessages,
    getOrCreateCaseThread,
    getOrCreateTeamThread,
    sendChatMessage,
} from "@/actions/chat-actions"
import { ScrollArea } from "@/components/ui/ScrollArea"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { Avatar, AvatarFallback } from "@/components/ui/Avatar"
import { toast } from "sonner"
import { Briefcase, Hash, Send } from "lucide-react"

type FloatingChatContext = {
    scope?: string
    caseId?: string
    threadId?: string
}

type ChatMessagesResult = Awaited<ReturnType<typeof getChatMessages>>
type ThreadItem = ChatMessagesResult["thread"]
type MessageItem = ChatMessagesResult["messages"][number]

export function FloatingChat({ context }: { context?: FloatingChatContext }) {
    const router = useRouter()
    const { data: session } = useSession()
    const myId = (() => {
        const user = session?.user as unknown
        if (!user || typeof user !== "object") return undefined
        const id = (user as { id?: unknown }).id
        return typeof id === "string" ? id : undefined
    })()

    const [thread, setThread] = useState<ThreadItem | null>(null)
    const [messages, setMessages] = useState<MessageItem[]>([])
    const [loading, setLoading] = useState(true)
    const [inputValue, setInputValue] = useState("")

    const messagesEndRef = useRef<HTMLDivElement>(null)

    const resolvedContext = useMemo(() => {
        return {
            scope: context?.scope,
            caseId: context?.caseId,
            threadId: context?.threadId,
        }
    }, [context])

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true)

                let threadId = resolvedContext.threadId

                if (!threadId && resolvedContext.caseId) {
                    const t = await getOrCreateCaseThread(resolvedContext.caseId)
                    threadId = t.id
                }

                if (!threadId) {
                    const t = await getOrCreateTeamThread()
                    threadId = t.id
                }

                const res = await getChatMessages(threadId, 80)
                setThread(res.thread)
                setMessages(res.messages)
            } catch {
                toast.error("加载聊天失败")
            } finally {
                setLoading(false)
            }
        }

        void load()
    }, [resolvedContext.caseId, resolvedContext.threadId, resolvedContext.scope])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages.length])

    const handleSend = async () => {
        if (!thread?.id) return
        const text = inputValue.trim()
        if (!text) return

        setInputValue("")

        const result = await sendChatMessage(thread.id, text)
        if (!result.success) {
            toast.error("发送失败", { description: result.error })
            return
        }

        setMessages((prev) => [...prev, result.message])
    }

    return (
        <div className="flex flex-col h-full bg-card/80 backdrop-blur-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                <div className="flex items-center gap-2 min-w-0">
                    {thread?.type === "CASE" ? (
                        <Briefcase className="h-3.5 w-3.5 text-primary shrink-0" />
                    ) : (
                        <Hash className="h-3.5 w-3.5 text-info shrink-0" />
                    )}
                    <span className="text-sm font-medium truncate">
                        {thread?.title || (thread?.type === "CASE" ? "案件群聊" : "团队群聊")}
                    </span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => router.push("/chat")}
                >
                    打开完整页
                </Button>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-3">
                {loading ? (
                    <div className="text-sm text-muted-foreground text-center py-8">加载中...</div>
                ) : (
                    <div className="space-y-3">
                        {messages.map((msg, index) => {
                            const isMe = myId ? msg.senderId === myId : false
                            const showAvatar = !isMe && (index === 0 || messages[index - 1].senderId !== msg.senderId)
                            const showName = !isMe && showAvatar

                            if (msg.type === "SYSTEM") {
                                return (
                                    <div key={msg.id} className="text-center text-xs text-muted-foreground">
                                        {msg.content}
                                    </div>
                                )
                            }

                            return (
                                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                                    <div className={`flex max-w-[85%] items-end gap-1.5 ${isMe ? "flex-row-reverse" : ""}`}>
                                        {!isMe ? (
                                            <div className="w-6 shrink-0">
                                                {showAvatar ? (
                                                    <Avatar className="h-6 w-6">
                                                        <AvatarFallback className="text-[10px] bg-primary/15 text-primary">
                                                            {(msg.sender?.name || msg.sender?.email || "U").slice(0, 1)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                ) : null}
                                            </div>
                                        ) : null}

                                        <div className="flex flex-col">
                                            {showName ? (
                                                <span className="text-[10px] text-muted-foreground mb-0.5 ml-1">
                                                    {msg.sender?.name || msg.sender?.email}
                                                </span>
                                            ) : null}
                                            <div
                                                className={`rounded-2xl px-3 py-1.5 text-sm whitespace-pre-wrap break-words ${isMe
                                                    ? "bg-primary text-primary-foreground rounded-br-sm"
                                                    : "bg-muted rounded-bl-sm"
                                                    }`}
                                            >
                                                {msg.content}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </ScrollArea>

            {/* Input */}
            <div className="p-2 border-t border-border/50 bg-card/50">
                <form
                    onSubmit={(e) => {
                        e.preventDefault()
                        void handleSend()
                    }}
                    className="flex items-center gap-2"
                >
                    <Input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={thread ? "输入消息..." : "加载中..."}
                        disabled={!thread}
                        className="flex-1 h-8 text-sm"
                    />
                    <Button type="submit" size="icon" className="h-8 w-8 rounded-full shrink-0" disabled={!thread || !inputValue.trim()}>
                        <Send className="h-4 w-4" />
                    </Button>
                </form>
            </div>
        </div>
    )
}
