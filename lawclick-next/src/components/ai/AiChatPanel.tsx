"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Loader2, SendHorizonal } from "lucide-react"
import { useAiWorkspace } from "@/components/ai/AiWorkspaceProvider"
import { Button } from "@/components/ui/Button"
import { ScrollArea } from "@/components/ui/ScrollArea"
import { Textarea } from "@/components/ui/Textarea"
import { cn } from "@/lib/utils"

function formatTime(iso?: string): string {
    if (!iso) return ""
    const d = new Date(iso)
    if (!Number.isFinite(d.getTime())) return ""
    return d.toLocaleString()
}

export function AiChatPanel() {
    const tWidgets = useTranslations("ai.widgets")
    const tChat = useTranslations("ai.chat")
    const tConv = useTranslations("ai.conversations")
    const { selectedConversationId, conversation, draftMessages, conversationLoading, sending, sendMessage } =
        useAiWorkspace()

    const [draft, setDraft] = React.useState("")
    const messages = selectedConversationId ? conversation?.messages ?? [] : draftMessages
    const disabled = sending || conversationLoading || (Boolean(selectedConversationId) && !conversation)

    const title = selectedConversationId ? conversation?.title || tWidgets("chat") : tConv("new")

    const handleSend = React.useCallback(async () => {
        const content = draft.trim()
        if (!content || disabled) return
        setDraft("")
        await sendMessage(content)
    }, [disabled, draft, sendMessage])

    return (
        <div className="rounded-lg border bg-card/60 h-full flex flex-col overflow-hidden">
            <div className="p-3 border-b bg-muted/20 flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{title}</div>
                    {!selectedConversationId ? (
                        <div className="text-xs text-muted-foreground">{tConv("selectHint")}</div>
                    ) : null}
                </div>
                {conversationLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {tChat("sending")}
                    </div>
                ) : null}
            </div>

            <ScrollArea className="flex-1">
                <div className="p-3 space-y-3">
                    {messages.length === 0 ? (
                        <div className="text-sm text-muted-foreground">{tConv("selectHint")}</div>
                    ) : null}

                    {messages.map((m, idx) => {
                        const isUser = m.role === "user"
                        return (
                            <div key={`${m.role}-${idx}`} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                                <div
                                    className={cn(
                                        "max-w-[85%] rounded-lg border px-3 py-2 text-sm whitespace-pre-wrap",
                                        isUser
                                            ? "bg-primary/10 border-primary/20"
                                            : "bg-background/60 border-border/60"
                                    )}
                                >
                                    <div className="text-[11px] text-muted-foreground mb-1 flex items-center justify-between gap-2">
                                        <span className="capitalize">{m.role}</span>
                                        <span>{formatTime(m.timestamp)}</span>
                                    </div>
                                    <div>{m.content}</div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </ScrollArea>

            <div className="p-3 border-t bg-background/60">
                <div className="flex gap-2 items-end">
                    <Textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={tChat("placeholder")}
                        rows={3}
                        className="resize-none"
                        disabled={disabled}
                        onKeyDown={(e) => {
                            if (e.key !== "Enter") return
                            if (e.shiftKey) return
                            e.preventDefault()
                            void handleSend()
                        }}
                    />
                    <Button onClick={() => void handleSend()} disabled={disabled || !draft.trim()}>
                        {disabled ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                {tChat("sending")}
                            </>
                        ) : (
                            <>
                                <SendHorizonal className="h-4 w-4 mr-2" />
                                {tChat("send")}
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}
