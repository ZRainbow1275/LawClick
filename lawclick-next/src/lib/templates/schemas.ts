import { z } from "zod"

import { BUILTIN_TEMPLATE_KEYS } from "@/lib/templates/compile"

export const TEMPLATE_CODE_RE = /^[A-Z0-9_-]+$/
export const TEMPLATE_VARIABLE_KEY_RE = /^[A-Za-z0-9_]+$/

export const TemplateCodeSchema = z
    .string()
    .trim()
    .min(3, "模板代码不能为空")
    .max(64, "模板代码过长")
    .transform((value) => value.toUpperCase())
    .refine((value) => TEMPLATE_CODE_RE.test(value), { message: "模板代码仅允许 A-Z/0-9/下划线/连字符(-)" })

export const TemplateVariableSchema = z
    .object({
        key: z.string().trim().min(1, "变量 key 不能为空").max(64),
        label: z.string().trim().min(1, "变量名称不能为空").max(64),
        type: z.enum(["string", "textarea", "date", "currency", "number"]),
        required: z.boolean().optional(),
    })
    .strict()

export const TemplateVariablesSchema = z
    .array(TemplateVariableSchema)
    .max(200, "模板变量数量过多")
    .superRefine((vars, ctx) => {
        const keys = new Set<string>()
        const reserved = new Set<string>(BUILTIN_TEMPLATE_KEYS)
        for (const v of vars) {
            const key = v.key.trim()
            if (!TEMPLATE_VARIABLE_KEY_RE.test(key)) {
                ctx.addIssue({ code: "custom", message: "变量 key 仅允许 A-Z/a-z/0-9/下划线" })
                return
            }
            if (reserved.has(key)) {
                ctx.addIssue({ code: "custom", message: `变量 key 不允许使用系统内置：${key}` })
                return
            }
            if (keys.has(key)) {
                ctx.addIssue({ code: "custom", message: `模板变量 key 重复：${key}` })
                return
            }
            keys.add(key)
        }
    })

export type TemplateVariables = z.infer<typeof TemplateVariablesSchema>
