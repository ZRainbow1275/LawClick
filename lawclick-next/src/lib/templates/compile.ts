import { z } from "zod"

const PLACEHOLDER_RE = /{{\s*([A-Za-z0-9_]+)\s*}}/g

export const BUILTIN_TEMPLATE_KEYS = ["date"] as const

function getDefaultDateString(now: Date): string {
    return new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "Asia/Shanghai",
    }).format(now)
}

export type CompileTemplateInput = {
    content: string
    data: Record<string, string>
    now?: Date
}

export function listTemplatePlaceholders(content: string): string[] {
    const parsed = z.object({ content: z.string() }).strict().parse({ content })

    const seen = new Set<string>()
    parsed.content.replace(PLACEHOLDER_RE, (_, key: string) => {
        seen.add(key)
        return ""
    })

    return Array.from(seen).sort()
}

export function compileTemplateContent(input: CompileTemplateInput): string {
    const parsed = z
        .object({
            content: z.string(),
            data: z.record(z.string(), z.string()),
            now: z.date().optional(),
        })
        .strict()
        .parse(input)

    const now = parsed.now ?? new Date()
    const builtins: Record<string, string> = {
        date: getDefaultDateString(now),
    }

    const seen = new Set<string>()
    const missing = new Set<string>()

    parsed.content.replace(PLACEHOLDER_RE, (_, key: string) => {
        seen.add(key)
        const value = parsed.data[key] ?? builtins[key]
        if (value === undefined) missing.add(key)
        return ""
    })

    if (missing.size > 0) {
        throw new Error(`模板变量缺失：${Array.from(missing).sort().join("、")}`)
    }

    return parsed.content.replace(PLACEHOLDER_RE, (_, key: string) => {
        const value = parsed.data[key] ?? builtins[key]
        return value ?? ""
    })
}
