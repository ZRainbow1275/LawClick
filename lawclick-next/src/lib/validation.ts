import { z } from "zod"

import { fail, type ActionResult } from "@/lib/action-result"

export function parseWithSchema<TSchema extends z.ZodTypeAny>(
    schema: TSchema,
    input: unknown
): ActionResult<z.infer<TSchema>> {
    const parsed = schema.safeParse(input)
    if (parsed.success) return { success: true, data: parsed.data }

    const flattened = parsed.error.flatten()
    return fail("VALIDATION_ERROR", "输入校验失败", {
        fieldErrors: flattened.fieldErrors,
        formErrors: flattened.formErrors,
    })
}

