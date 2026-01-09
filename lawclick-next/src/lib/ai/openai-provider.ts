import "server-only"

import OpenAI from "openai"

import { logger } from "@/lib/logger"
import { readAiEnv } from "@/lib/ai/ai-env"
import type { AiChatResponse, AiProvider, AiProviderResult } from "@/lib/ai/ai-types"

let cachedClient: OpenAI | null = null

function getClient(): OpenAI {
    if (cachedClient) return cachedClient
    const env = readAiEnv()

    if (!env.OPENAI_API_KEY) {
        throw new Error("AI 未配置：缺少 OPENAI_API_KEY")
    }

    cachedClient = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
        baseURL: env.OPENAI_BASE_URL,
    })
    return cachedClient
}

export const openAiProvider: AiProvider = {
    id: "openai",
    async chat(input) {
        try {
            const client = getClient()
            const completion = await client.chat.completions.create({
                model: input.model,
                messages: input.messages,
                temperature: typeof input.temperature === "number" ? input.temperature : 0.2,
                max_tokens: typeof input.maxTokens === "number" ? input.maxTokens : undefined,
            })

            const content = completion.choices?.[0]?.message?.content || ""
            const usage = completion.usage
                ? {
                      promptTokens: completion.usage.prompt_tokens,
                      completionTokens: completion.usage.completion_tokens,
                      totalTokens: completion.usage.total_tokens,
                  }
                : null

            const res: AiChatResponse = {
                content,
                usage,
                requestId: completion._request_id || null,
                raw: null,
            }

            return { ok: true, value: res } satisfies AiProviderResult<AiChatResponse>
        } catch (error: unknown) {
            if (error instanceof Error && error.message.includes("OPENAI_API_KEY")) {
                logger.warn("openai not configured", { message: error.message })
                return { ok: false, error: error.message }
            }
            if (error instanceof OpenAI.APIError) {
                logger.warn("openai api error", {
                    status: error.status,
                    requestId: error.requestID,
                    code: error.code,
                    type: error.type,
                    message: error.message,
                })

                if (error instanceof OpenAI.AuthenticationError) {
                    return { ok: false, error: "AI 调用失败：鉴权失败（请检查 OPENAI_API_KEY）" }
                }

                if (error instanceof OpenAI.RateLimitError) {
                    return { ok: false, error: "AI 调用失败：触发上游限流，请稍后重试" }
                }

                return { ok: false, error: "AI 调用失败，请稍后重试" }
            }

            logger.error("openai chat failed", error)
            return { ok: false, error: "AI 调用失败，请稍后重试" }
        }
    },
}
