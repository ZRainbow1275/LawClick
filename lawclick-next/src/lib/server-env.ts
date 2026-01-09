import "server-only"

import { z } from "zod"

export function requireEnv(name: string): string {
    const value = (process.env[name] || "").trim()
    if (!value) {
        throw new Error(`缺少必需的环境变量：${name}`)
    }
    return value
}

export function optionalEnv(name: string): string | undefined {
    const value = (process.env[name] || "").trim()
    return value ? value : undefined
}

function pickEnv(keys: string[]): Record<string, string | undefined> {
    const picked: Record<string, string | undefined> = {}
    for (const key of keys) {
        picked[key] = process.env[key]
    }
    return picked
}

export function parseEnv<TSchema extends z.ZodTypeAny>(schema: TSchema): z.infer<TSchema> {
    if (schema instanceof z.ZodObject) {
        const keys = Object.keys((schema as z.ZodObject).shape)
        return schema.parse(pickEnv(keys)) as z.infer<TSchema>
    }

    return schema.parse(process.env) as z.infer<TSchema>
}
