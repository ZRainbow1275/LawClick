import { getChatMessages, getMyChatThreads } from "@/actions/chat-actions"
import { ChatPageClient } from "@/components/chat/ChatPageClient"

export default async function ChatPage({
    searchParams,
}: {
    searchParams: Promise<{ threadId?: string | string[] | undefined }>
}) {
    const bootstrap = await getMyChatThreads()

    const sp = await searchParams
    const rawThreadId = sp?.threadId
    const requestedThreadId = Array.isArray(rawThreadId)
        ? rawThreadId[0] ?? null
        : typeof rawThreadId === "string"
            ? rawThreadId
            : null

    const hasRequested =
        Boolean(requestedThreadId && bootstrap.threads.some((t) => t.id === requestedThreadId))

    const initialThreadId = hasRequested ? requestedThreadId : bootstrap.threads[0]?.id ?? null
    const initialMessagesRes = initialThreadId ? await getChatMessages(initialThreadId, 80) : null

    return (
        <ChatPageClient
            me={bootstrap.me}
            initialThreads={bootstrap.threads}
            initialThreadId={initialThreadId}
            initialMessages={initialMessagesRes?.messages ?? []}
        />
    )
}
