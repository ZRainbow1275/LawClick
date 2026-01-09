import "server-only"

export type AiProviderId = "openai"

export type AiChatRole = "developer" | "user" | "assistant"

export type AiChatMessage = {
    role: AiChatRole
    content: string
}

export type AiChatRequest = {
    provider: AiProviderId
    model: string
    messages: AiChatMessage[]
    temperature?: number
    maxTokens?: number
}

export type AiTokenUsage = {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
}

export type AiChatResponse = {
    content: string
    usage: AiTokenUsage | null
    requestId?: string | null
    raw?: unknown
}

export type AiProviderResult<T> = { ok: true; value: T } | { ok: false; error: string }

export interface AiProvider {
    id: AiProviderId
    chat(input: Omit<AiChatRequest, "provider">): Promise<AiProviderResult<AiChatResponse>>
}

