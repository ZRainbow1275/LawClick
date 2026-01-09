import { z } from "zod"
import { UuidSchema } from "@/lib/zod"

export const DispatchUiPreferencesSchema = z
    .object({
        schedule: z
            .object({
                selectedUserIds: z.array(UuidSchema).max(300).default([]),
            })
            .default({ selectedUserIds: [] }),
    })
    .strict()

export type DispatchUiPreferences = z.infer<typeof DispatchUiPreferencesSchema>

export const DEFAULT_DISPATCH_UI_PREFERENCES: DispatchUiPreferences =
    DispatchUiPreferencesSchema.parse({})
