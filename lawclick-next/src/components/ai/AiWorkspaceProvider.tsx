"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { getAiConversation, getAiStatus, listAiConversations, sendAiChatMessage } from "@/actions/ai-actions"
import type { AiConversationMessage } from "@/lib/ai/ai-schemas"

type AiStatus = { provider: string; configured: boolean; defaultModel: string }

type AiConversationPreview = {
    id: string
    title: string
    caseId: string | null
    updatedAt: string
    createdAt: string
    lastMessage: { role: AiConversationMessage["role"]; content: string } | null
}

type AiConversationDetail = {
    id: string
    title: string
    caseId: string | null
    context: unknown
    messages: AiConversationMessage[]
    createdAt: string
    updatedAt: string
}

type AiTokenUsage = { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null

type AiWorkspaceContextValue = {
    status: AiStatus | null
    statusLoading: boolean
    refreshStatus: () => Promise<void>

    conversations: AiConversationPreview[]
    conversationsLoading: boolean
    refreshConversations: () => Promise<void>

    selectedConversationId: string | null
    openConversation: (id: string) => Promise<void>
    newConversation: () => void

    conversation: AiConversationDetail | null
    draftMessages: AiConversationMessage[]
    conversationLoading: boolean

    sending: boolean
    sendMessage: (message: string) => Promise<void>

    lastInvocationId: string | null
    lastUsage: AiTokenUsage
}

const AiWorkspaceContext = React.createContext<AiWorkspaceContextValue | null>(null)

export function AiWorkspaceProvider(props: {
    initialStatus: AiStatus | null
    initialConversations: AiConversationPreview[]
    children: React.ReactNode
}) {
    const { initialStatus, initialConversations, children } = props
    const tConv = useTranslations("ai.conversations")
    const tToast = useTranslations("ai.toast")

    const [status, setStatus] = React.useState<AiStatus | null>(initialStatus)
    const [statusLoading, setStatusLoading] = React.useState(false)

    const [conversations, setConversations] = React.useState<AiConversationPreview[]>(initialConversations)
    const [conversationsLoading, setConversationsLoading] = React.useState(false)

    const [selectedConversationId, setSelectedConversationId] = React.useState<string | null>(null)
    const [conversation, setConversation] = React.useState<AiConversationDetail | null>(null)
    const [draftMessages, setDraftMessages] = React.useState<AiConversationMessage[]>([])
    const [conversationLoading, setConversationLoading] = React.useState(false)

    const [sending, setSending] = React.useState(false)
    const [lastInvocationId, setLastInvocationId] = React.useState<string | null>(null)
    const [lastUsage, setLastUsage] = React.useState<AiTokenUsage>(null)

    const draftMessagesRef = React.useRef<AiConversationMessage[]>(draftMessages)
    React.useEffect(() => {
        draftMessagesRef.current = draftMessages
    }, [draftMessages])

    const refreshStatus = React.useCallback(async () => {
        setStatusLoading(true)
        try {
            const res = await getAiStatus()
            if (!res.success) {
                toast.error(tToast("statusLoadFailed"), { description: res.error })
                return
            }
            setStatus(res.data)
        } catch {
            toast.error(tToast("statusLoadFailed"))
        } finally {
            setStatusLoading(false)
        }
    }, [tToast])

    const refreshConversations = React.useCallback(async () => {
        setConversationsLoading(true)
        try {
            const res = await listAiConversations({ take: 30 })
            if (!res.success) {
                toast.error(tToast("conversationsLoadFailed"), { description: res.error })
                return
            }
            setConversations(res.data)
        } catch {
            toast.error(tToast("conversationsLoadFailed"))
        } finally {
            setConversationsLoading(false)
        }
    }, [tToast])

    const openConversation = React.useCallback(async (id: string) => {
        setSelectedConversationId(id)
        setConversationLoading(true)
        setConversation(null)
        setDraftMessages([])
        try {
            const res = await getAiConversation(id)
            if (!res.success) {
                toast.error(tToast("openConversationFailed"), { description: res.error })
                return
            }
            setConversation(res.data)
        } catch {
            toast.error(tToast("openConversationFailed"))
        } finally {
            setConversationLoading(false)
        }
    }, [tToast])

    const newConversation = React.useCallback(() => {
        setSelectedConversationId(null)
        setConversation(null)
        setDraftMessages([])
        setLastInvocationId(null)
        setLastUsage(null)
    }, [])

    const sendMessage = React.useCallback(
        async (message: string) => {
            const trimmed = message.trim()
            if (!trimmed) return

            const now = new Date().toISOString()
            const userMessage: AiConversationMessage = { role: "user", content: trimmed, timestamp: now }

            const activeConversationId = selectedConversationId
            const draftBase = activeConversationId ? null : draftMessagesRef.current
            if (activeConversationId) {
                setConversation((prev) => {
                    if (!prev || prev.id !== activeConversationId) return prev
                    return {
                        ...prev,
                        messages: [...prev.messages, userMessage],
                        updatedAt: now,
                    }
                })
            } else {
                setDraftMessages((prev) => [...prev, userMessage])
            }

            setSending(true)
            try {
                const res = await sendAiChatMessage({
                    conversationId: activeConversationId || undefined,
                    message: trimmed,
                })
                if (!res.success) {
                    toast.error(tToast("sendFailed"), { description: res.error })
                    return
                }

                const assistantMessage = res.data.message
                setLastInvocationId(res.data.invocationId || null)
                setLastUsage(res.data.usage || null)

                if (activeConversationId) {
                    setConversation((prev) => {
                        if (!prev || prev.id !== activeConversationId) return prev
                        const updatedAt = assistantMessage.timestamp || now
                        return {
                            ...prev,
                            messages: [...prev.messages, assistantMessage],
                            updatedAt,
                        }
                    })
                } else {
                    const newId = res.data.conversationId
                    const finalMessages = [...(draftBase || []), userMessage, assistantMessage]
                    setDraftMessages([])
                    setSelectedConversationId(newId)
                    setConversation({
                        id: newId,
                        title: tConv("untitled"),
                        caseId: null,
                        context: null,
                        messages: finalMessages,
                        createdAt: now,
                        updatedAt: assistantMessage.timestamp || now,
                    })
                }

                void refreshConversations()
            } catch {
                toast.error(tToast("sendFailed"))
            } finally {
                setSending(false)
            }
        },
        [refreshConversations, selectedConversationId, tConv, tToast]
    )

    const value = React.useMemo<AiWorkspaceContextValue>(
        () => ({
            status,
            statusLoading,
            refreshStatus,
            conversations,
            conversationsLoading,
            refreshConversations,
            selectedConversationId,
            openConversation,
            newConversation,
            conversation,
            draftMessages,
            conversationLoading,
            sending,
            sendMessage,
            lastInvocationId,
            lastUsage,
        }),
        [
            status,
            statusLoading,
            refreshStatus,
            conversations,
            conversationsLoading,
            refreshConversations,
            selectedConversationId,
            openConversation,
            newConversation,
            conversation,
            draftMessages,
            conversationLoading,
            sending,
            sendMessage,
            lastInvocationId,
            lastUsage,
        ]
    )

    return <AiWorkspaceContext.Provider value={value}>{children}</AiWorkspaceContext.Provider>
}

export function useAiWorkspace() {
    const ctx = React.useContext(AiWorkspaceContext)
    if (!ctx) throw new Error("useAiWorkspace must be used within AiWorkspaceProvider")
    return ctx
}
