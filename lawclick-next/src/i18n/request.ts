import { cookies } from "next/headers"
import { getRequestConfig } from "next-intl/server"
import { hasLocale } from "next-intl"
import { routing } from "@/i18n/routing"
import { LOCALE_COOKIE_NAME } from "@/i18n/locales"
import { logger } from "@/lib/logger"

export default getRequestConfig(async () => {
    const store = await cookies()
    const cookieLocale = store.get(LOCALE_COOKIE_NAME)?.value
    const locale = hasLocale(routing.locales, cookieLocale) ? cookieLocale : routing.defaultLocale

    try {
        const messages = (await import(`../../messages/${locale}.json`)).default
        return { locale, messages }
    } catch (error) {
        logger.error("[i18n] failed to load messages", error, { locale })
        const messages = (await import(`../../messages/${routing.defaultLocale}.json`)).default
        return { locale: routing.defaultLocale, messages }
    }
})
