import { defineRouting } from "next-intl/routing"
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, SUPPORTED_LOCALES, type AppLocale } from "@/i18n/locales"

export const routing = defineRouting({
    locales: SUPPORTED_LOCALES,
    defaultLocale: DEFAULT_LOCALE,
    localePrefix: "never",
})

export { LOCALE_COOKIE_NAME }
export type { AppLocale }
