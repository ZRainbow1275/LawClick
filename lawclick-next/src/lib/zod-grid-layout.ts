import { z } from "zod"
import type { GridLayoutItem } from "@/lib/grid-layout"

export const GridLayoutItemSchema: z.ZodType<GridLayoutItem> = z
    .object({
        i: z.string().trim().min(1).max(64),
        x: z.number().int().min(0),
        y: z.number().int().min(0),
        w: z.number().int().min(1),
        h: z.number().int().min(1),
        minW: z.number().int().min(1).optional(),
        minH: z.number().int().min(1).optional(),
        maxW: z.number().int().min(1).optional(),
        maxH: z.number().int().min(1).optional(),
        static: z.boolean().optional(),
    })
    .strict()

