import "server-only"

import { z } from "zod"

import { parseEnv } from "@/lib/server-env"

export const AiProviderSchema = z.enum(["openai"])
export type AiProvider = z.infer<typeof AiProviderSchema>

function emptyStringToUndefined<TSchema extends z.ZodTypeAny>(schema: TSchema) {
    return z.preprocess((value) => {
        if (typeof value === "string" && value.trim() === "") return undefined
        return value
    }, schema)
}

const AiEnvSchema = z
    .object({
        AI_PROVIDER: AiProviderSchema.optional(),
        OPENAI_API_KEY: emptyStringToUndefined(z.string().trim().min(1).optional()),
        OPENAI_BASE_URL: emptyStringToUndefined(z.string().trim().url().optional()),
        OPENAI_MODEL: emptyStringToUndefined(z.string().trim().min(1).optional()),
    })
    .strict()

export type AiEnv = z.infer<typeof AiEnvSchema>

export function readAiEnv(): AiEnv {
    const env = parseEnv(AiEnvSchema)
    return {
        AI_PROVIDER: env.AI_PROVIDER,
        OPENAI_API_KEY: env.OPENAI_API_KEY?.trim() || undefined,
        OPENAI_BASE_URL: env.OPENAI_BASE_URL?.trim() || undefined,
        OPENAI_MODEL: env.OPENAI_MODEL?.trim() || undefined,
    }
}

export function getAiProviderId(): AiProvider {
    return (readAiEnv().AI_PROVIDER || "openai") as AiProvider
}

export function isAiConfigured(): boolean {
    const env = readAiEnv()
    if ((env.AI_PROVIDER || "openai") === "openai") {
        return Boolean(env.OPENAI_API_KEY)
    }
    return false
}

export function getDefaultAiModel(): string {
    const env = readAiEnv()
    if ((env.AI_PROVIDER || "openai") === "openai") {
        return env.OPENAI_MODEL || "gpt-4o-mini"
    }
    return "gpt-4o-mini"
}
