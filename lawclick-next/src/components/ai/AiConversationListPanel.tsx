"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Loader2, Plus, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { createAiConversation } from "@/actions/ai-actions"
import { useAiWorkspace } from "@/components/ai/AiWorkspaceProvider"
import { Button } from "@/components/ui/Button"
import { ScrollArea } from "@/components/ui/ScrollArea"
import { cn } from "@/lib/utils"

function formatShortTime(iso: string): string {
    const d = new Date(iso)
    if (!Number.isFinite(d.getTime())) return ""
    return d.toLocaleString()
}

export function AiConversationListPanel() {
    const tWidgets = useTranslations("ai.widgets")
    const tConv = useTranslations("ai.conversations")
    const tToast = useTranslations("ai.toast")
    const {
        conversations,
        conversationsLoading,
        refreshConversations,
        openConversation,
        selectedConversationId,
    } = useAiWorkspace()

    const [creating, setCreating] = React.useState(false)

    const handleNew = async () => {
        setCreating(true)
        try {
            const res = await createAiConversation({})
            if (!res.success) {
                toast.error(tToast("createConversationFailed"), { description: res.error })
                return
            }
            await openConversation(res.data.id)
            await refreshConversations()
        } catch {
            toast.error(tToast("createConversationFailed"))
        } finally {
            setCreating(false)
        }
    }

    return (
        <div className="rounded-lg border bg-card/60 h-full flex flex-col overflow-hidden">
            <div className="p-3 border-b bg-muted/20 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">{tWidgets("conversations")}</div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void refreshConversations()}
                        disabled={conversationsLoading}
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {tConv("refresh")}
                    </Button>
                    <Button size="sm" onClick={() => void handleNew()} disabled={creating}>
                        {creating ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Plus className="h-4 w-4 mr-2" />
                        )}
                        {creating ? tConv("creating") : tConv("new")}
                    </Button>
                </div>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-2 space-y-2">
                    {conversationsLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {tConv("refresh")}
                        </div>
                    ) : null}

                    {!conversationsLoading && conversations.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground">{tConv("empty")}</div>
                    ) : null}

                    {conversations.map((c) => {
                        const active = selectedConversationId === c.id
                        return (
                            <button
                                key={c.id}
                                type="button"
                                className={cn(
                                    "w-full text-left rounded-md border bg-background/60 hover:bg-background/80 transition-colors p-3",
                                    active && "border-primary/50 bg-primary/5"
                                )}
                                onClick={() => void openConversation(c.id)}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium truncate">{c.title}</div>
                                        <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                            {c.lastMessage ? c.lastMessage.content : tConv("selectHint")}
                                        </div>
                                    </div>
                                    <div className="text-[11px] text-muted-foreground shrink-0">
                                        {formatShortTime(c.updatedAt)}
                                    </div>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </ScrollArea>
        </div>
    )
}
