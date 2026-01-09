import { z } from "zod"

export const OnboardingUiPreferencesSchema = z
    .object({
        floatingLauncherCoachmarkDismissed: z.boolean().default(false),
    })
    .strict()

export type OnboardingUiPreferences = z.infer<typeof OnboardingUiPreferencesSchema>

export const DEFAULT_ONBOARDING_UI_PREFERENCES: OnboardingUiPreferences = OnboardingUiPreferencesSchema.parse({})

