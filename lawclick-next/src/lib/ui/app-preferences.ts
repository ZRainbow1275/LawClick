import { z } from "zod"
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/i18n/locales"

export const AppDensitySchema = z.enum(["comfortable", "compact"])
export type AppDensity = z.infer<typeof AppDensitySchema>

export const AppThemeSchema = z.enum(["system", "light", "dark"])
export type AppTheme = z.infer<typeof AppThemeSchema>

export const AppAccentSchema = z.enum(["orange", "blue", "slate"])
export type AppAccent = z.infer<typeof AppAccentSchema>

export const AppContrastSchema = z.enum(["system", "normal", "high"])
export type AppContrast = z.infer<typeof AppContrastSchema>

export const AppLocaleSchema = z.enum(SUPPORTED_LOCALES)
export type AppLocale = z.infer<typeof AppLocaleSchema>

export const AppUiPreferencesSchema = z
    .object({
        density: AppDensitySchema.default("comfortable"),
        theme: AppThemeSchema.default("system"),
        accent: AppAccentSchema.default("orange"),
        contrast: AppContrastSchema.default("system"),
        locale: AppLocaleSchema.default(DEFAULT_LOCALE),
    })
    .strict()

export type AppUiPreferences = z.infer<typeof AppUiPreferencesSchema>

export const DEFAULT_APP_UI_PREFERENCES: AppUiPreferences = AppUiPreferencesSchema.parse({})
