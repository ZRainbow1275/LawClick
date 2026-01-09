import { z } from "zod"

export const AiChatRoleSchema = z.enum(["developer", "user", "assistant"])

export const AiConversationMessageSchema = z
    .object({
        role: AiChatRoleSchema,
        content: z.string().trim().min(1).max(50_000),
        timestamp: z.string().trim().min(1).optional(),
    })
    .strict()

export type AiConversationMessage = z.infer<typeof AiConversationMessageSchema>

export const AiConversationMessagesSchema = z.array(AiConversationMessageSchema).max(200)

