import { z } from "zod"

export const IntakeCasesViewModeSchema = z.enum(["split", "list"])
export type IntakeCasesViewMode = z.infer<typeof IntakeCasesViewModeSchema>

export const CasesUiPreferencesSchema = z
    .object({
        intakeViewMode: IntakeCasesViewModeSchema.default("split"),
    })
    .strict()

export type CasesUiPreferences = z.infer<typeof CasesUiPreferencesSchema>

export const DEFAULT_CASES_UI_PREFERENCES: CasesUiPreferences = CasesUiPreferencesSchema.parse({})

