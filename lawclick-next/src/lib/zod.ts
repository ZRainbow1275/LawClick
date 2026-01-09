import { z } from "zod"

export const UuidSchema = z.string().uuid()

export const NonEmptyStringSchema = z.string().trim().min(1)

export type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue }

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
    z.union([
        z.string(),
        z.number().finite(),
        z.boolean(),
        z.null(),
        z.array(JsonValueSchema),
        z.record(z.string(), JsonValueSchema),
    ])
)

export function OptionalNonEmptyString(maxLen?: number) {
    const base = maxLen ? NonEmptyStringSchema.max(maxLen) : NonEmptyStringSchema
    return base.optional()
}

export function NullableNonEmptyString(maxLen?: number) {
    const base = maxLen ? NonEmptyStringSchema.max(maxLen) : NonEmptyStringSchema
    return base.nullable().optional()
}

export function FiniteNumber() {
    return z.number().finite()
}

export function PositiveNumber() {
    return z.number().finite().positive()
}

export function PositiveInt() {
    return z.number().int().positive()
}

export function NonNegativeNumber() {
    return z.number().finite().nonnegative()
}

export const DateInputSchema = z
    .union([z.date(), z.string().trim().min(1)])
    .transform((value, ctx) => {
        const date = value instanceof Date ? value : new Date(value)
        if (Number.isNaN(date.getTime())) {
            ctx.addIssue({ code: "custom", message: "无效日期" })
            return z.NEVER
        }
        return date
    })
