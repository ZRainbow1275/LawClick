import { z } from "zod"

export const FloatingSectionBlockOriginSchema = z
    .object({
        pathname: z.string().min(1),
        sectionId: z.string().min(1),
        entityId: z.string().min(1).nullable(),
        blockId: z.string().min(1),
    })
    .strict()

export type FloatingSectionBlockOrigin = z.infer<typeof FloatingSectionBlockOriginSchema>

export const FloatingPageWidgetOriginSchema = z
    .object({
        pathname: z.string().min(1),
        workspaceKey: z.string().min(1).max(200),
        widgetId: z.string().min(1),
    })
    .strict()

export type FloatingPageWidgetOrigin = z.infer<typeof FloatingPageWidgetOriginSchema>

export const FloatingLegoBlockDataSchema = z.discriminatedUnion("kind", [
    z
        .object({
            kind: z.literal("SECTION_BLOCK"),
            registryKey: z.string().min(1),
            origin: FloatingSectionBlockOriginSchema,
        })
        .strict(),
    z
        .object({
            kind: z.literal("PAGE_WIDGET"),
            registryKey: z.string().min(1),
            origin: FloatingPageWidgetOriginSchema,
        })
        .strict(),
])

export type FloatingLegoBlockData = z.infer<typeof FloatingLegoBlockDataSchema>
