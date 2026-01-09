import "server-only"

import { getAiProviderId, getDefaultAiModel, isAiConfigured } from "@/lib/ai/ai-env"
import { openAiProvider } from "@/lib/ai/openai-provider"
import type { AiChatMessage, AiChatResponse, AiProviderResult } from "@/lib/ai/ai-types"

export function getAiRuntimeStatus() {
    const provider = getAiProviderId()
    const configured = isAiConfigured()
    const defaultModel = getDefaultAiModel()
    return { provider, configured, defaultModel }
}

export async function aiChat(input: {
    model?: string
    messages: AiChatMessage[]
    temperature?: number
    maxTokens?: number
}): Promise<AiProviderResult<AiChatResponse>> {
    const provider = getAiProviderId()
    const model = (input.model || getDefaultAiModel()).trim()

    if (provider === "openai") {
        return openAiProvider.chat({
            model,
            messages: input.messages,
            temperature: input.temperature,
            maxTokens: input.maxTokens,
        })
    }

    return { ok: false, error: "AI Provider 未配置" }
}

