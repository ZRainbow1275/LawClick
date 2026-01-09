import { z } from "zod"

export const DashboardDensitySchema = z.enum(["comfortable", "compact"])
export type DashboardDensity = z.infer<typeof DashboardDensitySchema>

export const DashboardUiPreferencesSchema = z
    .object({
        density: DashboardDensitySchema.default("comfortable"),
    })
    .strict()

export type DashboardUiPreferences = z.infer<typeof DashboardUiPreferencesSchema>

export const DEFAULT_DASHBOARD_UI_PREFERENCES: DashboardUiPreferences = DashboardUiPreferencesSchema.parse({})

