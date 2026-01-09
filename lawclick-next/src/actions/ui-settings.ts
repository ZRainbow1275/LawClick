"use server"

import type { Prisma } from "@prisma/client"
import { cookies } from "next/headers"
import { LOCALE_COOKIE_NAME } from "@/i18n/locales"

import { getActiveTenantContextWithPermissionOrThrow } from "@/lib/server-auth"
import { logger } from "@/lib/logger"
import { enforceRateLimit } from "@/lib/action-rate-limit"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { userSettingsRepository } from "@/lib/user-settings"
import {
    CasesUiPreferencesSchema,
    DEFAULT_CASES_UI_PREFERENCES,
    type CasesUiPreferences,
} from "@/lib/ui/cases-preferences"
import {
    DashboardUiPreferencesSchema,
    DEFAULT_DASHBOARD_UI_PREFERENCES,
    type DashboardUiPreferences,
} from "@/lib/ui/dashboard-preferences"
import {
    DEFAULT_FLOATING_LAUNCHER_CONFIG,
    FloatingLauncherConfigSchema,
    type FloatingLauncherConfig,
} from "@/lib/ui/floating-launcher"
import { DEFAULT_APP_UI_PREFERENCES, AppUiPreferencesSchema, type AppUiPreferences } from "@/lib/ui/app-preferences"
import {
    DEFAULT_ONBOARDING_UI_PREFERENCES,
    OnboardingUiPreferencesSchema,
    type OnboardingUiPreferences,
} from "@/lib/ui/onboarding-preferences"
import {
    DEFAULT_DISPATCH_UI_PREFERENCES,
    DispatchUiPreferencesSchema,
    type DispatchUiPreferences,
} from "@/lib/ui/dispatch-preferences"

const FLOATING_LAUNCHER_SETTING_KEY = "ui:floating-launcher" as const
const APP_UI_SETTING_KEY = "ui:app" as const
const DASHBOARD_UI_SETTING_KEY = "ui:dashboard" as const
const ONBOARDING_UI_SETTING_KEY = "ui:onboarding" as const
const CASES_UI_SETTING_KEY = "ui:cases" as const
const DISPATCH_UI_SETTING_KEY = "ui:dispatch" as const

const FloatingLauncherPatchSchema = FloatingLauncherConfigSchema.partial()
    .strict()
    .refine((value) => Object.values(value).some((v) => v !== undefined), { message: "没有需要更新的字段" })

const DashboardUiPatchSchema = DashboardUiPreferencesSchema.partial()
    .strict()
    .refine((value) => Object.values(value).some((v) => v !== undefined), { message: "没有需要更新的字段" })

const OnboardingUiPatchSchema = OnboardingUiPreferencesSchema.partial()
    .strict()
    .refine((value) => Object.values(value).some((v) => v !== undefined), { message: "没有需要更新的字段" })

const CasesUiPatchSchema = CasesUiPreferencesSchema.partial()
    .strict()
    .refine((value) => Object.values(value).some((v) => v !== undefined), { message: "没有需要更新的字段" })

const DispatchUiPatchSchema = DispatchUiPreferencesSchema.partial()
    .strict()
    .refine((value) => Object.values(value).some((v) => v !== undefined), { message: "没有需要更新的字段" })

const AppUiPatchSchema = AppUiPreferencesSchema.partial()
    .strict()
    .refine((value) => Object.values(value).some((v) => v !== undefined), { message: "没有需要更新的字段" })

function toPrismaJson<TValue>(value: TValue): Prisma.InputJsonValue {
    return value as unknown as Prisma.InputJsonValue
}

function parseFloatingLauncherConfig(value: unknown): FloatingLauncherConfig {
    const parsed = FloatingLauncherConfigSchema.safeParse(value)
    return parsed.success ? parsed.data : DEFAULT_FLOATING_LAUNCHER_CONFIG
}

function parseAppUiPreferences(value: unknown): AppUiPreferences {
    const parsed = AppUiPreferencesSchema.safeParse(value)
    return parsed.success ? parsed.data : DEFAULT_APP_UI_PREFERENCES
}

function parseDashboardUiPreferences(value: unknown): DashboardUiPreferences {
    const parsed = DashboardUiPreferencesSchema.safeParse(value)
    return parsed.success ? parsed.data : DEFAULT_DASHBOARD_UI_PREFERENCES
}

function parseOnboardingUiPreferences(value: unknown): OnboardingUiPreferences {
    const parsed = OnboardingUiPreferencesSchema.safeParse(value)
    return parsed.success ? parsed.data : DEFAULT_ONBOARDING_UI_PREFERENCES
}

function parseCasesUiPreferences(value: unknown): CasesUiPreferences {
    const parsed = CasesUiPreferencesSchema.safeParse(value)
    return parsed.success ? parsed.data : DEFAULT_CASES_UI_PREFERENCES
}

function parseDispatchUiPreferences(value: unknown): DispatchUiPreferences {
    const parsed = DispatchUiPreferencesSchema.safeParse(value)
    return parsed.success ? parsed.data : DEFAULT_DISPATCH_UI_PREFERENCES
}

function isDynamicServerUsageError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false
    const digest = (error as { digest?: unknown }).digest
    if (digest === "DYNAMIC_SERVER_USAGE") return true

    const description = (error as { description?: unknown }).description
    if (typeof description === "string" && description.includes("Dynamic server usage")) return true

    const message = (error as { message?: unknown }).message
    if (typeof message === "string" && message.includes("Dynamic server usage")) return true

    return false
}

export async function getMyFloatingLauncherConfig() {
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:view")
        const rate = await enforceRateLimit({ ctx, action: "uiSettings.floatingLauncher.get", limit: 600 })
        if (!rate.allowed) {
            return {
                success: false as const,
                error: rate.error,
                data: DEFAULT_FLOATING_LAUNCHER_CONFIG,
            }
        }
        const { user } = ctx

        const existing = await userSettingsRepository.get(user.id, FLOATING_LAUNCHER_SETTING_KEY)
        if (!existing) {
            await userSettingsRepository.upsert(user.id, FLOATING_LAUNCHER_SETTING_KEY, toPrismaJson(DEFAULT_FLOATING_LAUNCHER_CONFIG))
            return { success: true as const, data: DEFAULT_FLOATING_LAUNCHER_CONFIG }
        }

        const parsed = parseFloatingLauncherConfig(existing)
        const normalizedJson = toPrismaJson(parsed)
        if (JSON.stringify(parsed) !== JSON.stringify(existing)) {
            await userSettingsRepository.upsert(user.id, FLOATING_LAUNCHER_SETTING_KEY, normalizedJson)
        }

        return { success: true as const, data: parsed }
    } catch (error) {
        if (!isDynamicServerUsageError(error)) {
            logger.error("获取组件球配置失败", error)
        }
        return { success: false as const, error: "获取组件球配置失败", data: DEFAULT_FLOATING_LAUNCHER_CONFIG }
    }
}

export async function getMyAppUiPreferences() {
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:view")
        const rate = await enforceRateLimit({ ctx, action: "uiSettings.app.get", limit: 600 })
        if (!rate.allowed) {
            return {
                success: false as const,
                error: rate.error,
                data: DEFAULT_APP_UI_PREFERENCES,
            }
        }
        const { user } = ctx

        const existing = await userSettingsRepository.get(user.id, APP_UI_SETTING_KEY)
        if (!existing) {
            await userSettingsRepository.upsert(user.id, APP_UI_SETTING_KEY, toPrismaJson(DEFAULT_APP_UI_PREFERENCES))
            return { success: true as const, data: DEFAULT_APP_UI_PREFERENCES }
        }

        const parsed = parseAppUiPreferences(existing)
        const normalizedJson = toPrismaJson(parsed)
        if (JSON.stringify(parsed) !== JSON.stringify(existing)) {
            await userSettingsRepository.upsert(user.id, APP_UI_SETTING_KEY, normalizedJson)
        }

        return { success: true as const, data: parsed }
    } catch (error) {
        if (!isDynamicServerUsageError(error)) {
            logger.error("获取全局界面偏好失败", error)
        }
        return { success: false as const, error: "获取全局界面偏好失败", data: DEFAULT_APP_UI_PREFERENCES }
    }
}

export async function updateMyAppUiPreferences(patch: unknown) {
    try {
        const parsedPatch = AppUiPatchSchema.safeParse(patch)
        if (!parsedPatch.success) {
            return { success: false as const, error: parsedPatch.error.issues[0]?.message || "输入校验失败" }
        }

        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:edit")
        const rate = await enforceRateLimit({ ctx, action: "uiSettings.app.update", limit: 6000 })
        if (!rate.allowed) return { success: false as const, error: rate.error }
        const { user } = ctx

        const existing = await userSettingsRepository.get(user.id, APP_UI_SETTING_KEY)
        const current = parseAppUiPreferences(existing)

        const merged = AppUiPreferencesSchema.parse({ ...current, ...parsedPatch.data })
        await userSettingsRepository.upsert(user.id, APP_UI_SETTING_KEY, toPrismaJson(merged))

        if (parsedPatch.data.locale && current.locale !== merged.locale) {
            const store = await cookies()
            store.set(LOCALE_COOKIE_NAME, merged.locale, {
                path: "/",
                sameSite: "lax",
                secure: process.env.NODE_ENV === "production",
                maxAge: 60 * 60 * 24 * 365 * 5,
            })
        }

        return { success: true as const, data: merged }
    } catch (error) {
        logger.error("更新全局界面偏好失败", error)
        return {
            success: false as const,
            error: getPublicActionErrorMessage(error, "更新全局界面偏好失败"),
        }
    }
}

export async function updateMyFloatingLauncherConfig(patch: unknown) {
    try {
        const parsedPatch = FloatingLauncherPatchSchema.safeParse(patch)
        if (!parsedPatch.success) {
            return { success: false as const, error: parsedPatch.error.issues[0]?.message || "输入校验失败" }
        }

        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:edit")
        const rate = await enforceRateLimit({
            ctx,
            action: "uiSettings.floatingLauncher.update",
            limit: 6000,
        })
        if (!rate.allowed) return { success: false as const, error: rate.error }
        const { user } = ctx

        const existing = await userSettingsRepository.get(user.id, FLOATING_LAUNCHER_SETTING_KEY)
        const current = parseFloatingLauncherConfig(existing)

        const merged = FloatingLauncherConfigSchema.parse({ ...current, ...parsedPatch.data })
        await userSettingsRepository.upsert(user.id, FLOATING_LAUNCHER_SETTING_KEY, toPrismaJson(merged))

        return { success: true as const, data: merged }
    } catch (error) {
        logger.error("更新组件球配置失败", error)
        return {
            success: false as const,
            error: getPublicActionErrorMessage(error, "更新组件球配置失败"),
        }
    }
}

export async function getMyDashboardUiPreferences() {
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:view")
        const rate = await enforceRateLimit({ ctx, action: "uiSettings.dashboard.get", limit: 600 })
        if (!rate.allowed) {
            return {
                success: false as const,
                error: rate.error,
                data: DEFAULT_DASHBOARD_UI_PREFERENCES,
            }
        }
        const { user } = ctx

        const existing = await userSettingsRepository.get(user.id, DASHBOARD_UI_SETTING_KEY)
        if (!existing) {
            await userSettingsRepository.upsert(user.id, DASHBOARD_UI_SETTING_KEY, toPrismaJson(DEFAULT_DASHBOARD_UI_PREFERENCES))
            return { success: true as const, data: DEFAULT_DASHBOARD_UI_PREFERENCES }
        }

        const parsed = parseDashboardUiPreferences(existing)
        const normalizedJson = toPrismaJson(parsed)
        if (JSON.stringify(parsed) !== JSON.stringify(existing)) {
            await userSettingsRepository.upsert(user.id, DASHBOARD_UI_SETTING_KEY, normalizedJson)
        }

        return { success: true as const, data: parsed }
    } catch (error) {
        if (!isDynamicServerUsageError(error)) {
            logger.error("获取仪表盘偏好失败", error)
        }
        return { success: false as const, error: "获取仪表盘偏好失败", data: DEFAULT_DASHBOARD_UI_PREFERENCES }
    }
}

export async function updateMyDashboardUiPreferences(patch: unknown) {
    try {
        const parsedPatch = DashboardUiPatchSchema.safeParse(patch)
        if (!parsedPatch.success) {
            return { success: false as const, error: parsedPatch.error.issues[0]?.message || "输入校验失败" }
        }

        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:edit")
        const rate = await enforceRateLimit({ ctx, action: "uiSettings.dashboard.update", limit: 6000 })
        if (!rate.allowed) return { success: false as const, error: rate.error }
        const { user } = ctx

        const existing = await userSettingsRepository.get(user.id, DASHBOARD_UI_SETTING_KEY)
        const current = parseDashboardUiPreferences(existing)

        const merged = DashboardUiPreferencesSchema.parse({ ...current, ...parsedPatch.data })
        await userSettingsRepository.upsert(user.id, DASHBOARD_UI_SETTING_KEY, toPrismaJson(merged))

        return { success: true as const, data: merged }
    } catch (error) {
        logger.error("更新仪表盘偏好失败", error)
        return {
            success: false as const,
            error: getPublicActionErrorMessage(error, "更新仪表盘偏好失败"),
        }
    }
}

export async function getMyOnboardingUiPreferences() {
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:view")
        const rate = await enforceRateLimit({ ctx, action: "uiSettings.onboarding.get", limit: 600 })
        if (!rate.allowed) {
            return {
                success: false as const,
                error: rate.error,
                data: DEFAULT_ONBOARDING_UI_PREFERENCES,
            }
        }
        const { user } = ctx

        const existing = await userSettingsRepository.get(user.id, ONBOARDING_UI_SETTING_KEY)
        if (!existing) {
            await userSettingsRepository.upsert(user.id, ONBOARDING_UI_SETTING_KEY, toPrismaJson(DEFAULT_ONBOARDING_UI_PREFERENCES))
            return { success: true as const, data: DEFAULT_ONBOARDING_UI_PREFERENCES }
        }

        const parsed = parseOnboardingUiPreferences(existing)
        const normalizedJson = toPrismaJson(parsed)
        if (JSON.stringify(parsed) !== JSON.stringify(existing)) {
            await userSettingsRepository.upsert(user.id, ONBOARDING_UI_SETTING_KEY, normalizedJson)
        }

        return { success: true as const, data: parsed }
    } catch (error) {
        if (!isDynamicServerUsageError(error)) {
            logger.error("获取新手引导配置失败", error)
        }
        return { success: false as const, error: "获取新手引导配置失败", data: DEFAULT_ONBOARDING_UI_PREFERENCES }
    }
}

export async function updateMyOnboardingUiPreferences(patch: unknown) {
    try {
        const parsedPatch = OnboardingUiPatchSchema.safeParse(patch)
        if (!parsedPatch.success) {
            return { success: false as const, error: parsedPatch.error.issues[0]?.message || "输入校验失败" }
        }

        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:edit")
        const rate = await enforceRateLimit({ ctx, action: "uiSettings.onboarding.update", limit: 6000 })
        if (!rate.allowed) return { success: false as const, error: rate.error }
        const { user } = ctx

        const existing = await userSettingsRepository.get(user.id, ONBOARDING_UI_SETTING_KEY)
        const current = parseOnboardingUiPreferences(existing)

        const merged = OnboardingUiPreferencesSchema.parse({ ...current, ...parsedPatch.data })
        await userSettingsRepository.upsert(user.id, ONBOARDING_UI_SETTING_KEY, toPrismaJson(merged))

        return { success: true as const, data: merged }
    } catch (error) {
        logger.error("更新新手引导配置失败", error)
        return {
            success: false as const,
            error: getPublicActionErrorMessage(error, "更新新手引导配置失败"),
        }
    }
}

export async function getMyCasesUiPreferences() {
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:view")
        const rate = await enforceRateLimit({ ctx, action: "uiSettings.cases.get", limit: 600 })
        if (!rate.allowed) {
            return {
                success: false as const,
                error: rate.error,
                data: DEFAULT_CASES_UI_PREFERENCES,
            }
        }
        const { user } = ctx

        const existing = await userSettingsRepository.get(user.id, CASES_UI_SETTING_KEY)
        if (!existing) {
            await userSettingsRepository.upsert(user.id, CASES_UI_SETTING_KEY, toPrismaJson(DEFAULT_CASES_UI_PREFERENCES))
            return { success: true as const, data: DEFAULT_CASES_UI_PREFERENCES }
        }

        const parsed = parseCasesUiPreferences(existing)
        const normalizedJson = toPrismaJson(parsed)
        if (JSON.stringify(parsed) !== JSON.stringify(existing)) {
            await userSettingsRepository.upsert(user.id, CASES_UI_SETTING_KEY, normalizedJson)
        }

        return { success: true as const, data: parsed }
    } catch (error) {
        if (!isDynamicServerUsageError(error)) {
            logger.error("获取案件页面偏好失败", error)
        }
        return { success: false as const, error: "获取案件页面偏好失败", data: DEFAULT_CASES_UI_PREFERENCES }
    }
}

export async function updateMyCasesUiPreferences(patch: unknown) {
    try {
        const parsedPatch = CasesUiPatchSchema.safeParse(patch)
        if (!parsedPatch.success) {
            return { success: false as const, error: parsedPatch.error.issues[0]?.message || "输入校验失败" }
        }

        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:edit")
        const rate = await enforceRateLimit({ ctx, action: "uiSettings.cases.update", limit: 6000 })
        if (!rate.allowed) return { success: false as const, error: rate.error }
        const { user } = ctx

        const existing = await userSettingsRepository.get(user.id, CASES_UI_SETTING_KEY)
        const current = parseCasesUiPreferences(existing)

        const merged = CasesUiPreferencesSchema.parse({ ...current, ...parsedPatch.data })
        await userSettingsRepository.upsert(user.id, CASES_UI_SETTING_KEY, toPrismaJson(merged))

        return { success: true as const, data: merged }
    } catch (error) {
        logger.error("更新案件页面偏好失败", error)
        return {
            success: false as const,
            error: getPublicActionErrorMessage(error, "更新案件页面偏好失败"),
        }
    }
}

export async function getMyDispatchUiPreferences() {
    try {
        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:view")
        const rate = await enforceRateLimit({ ctx, action: "uiSettings.dispatch.get", limit: 600 })
        if (!rate.allowed) {
            return {
                success: false as const,
                error: rate.error,
                data: DEFAULT_DISPATCH_UI_PREFERENCES,
            }
        }
        const { user } = ctx

        const existing = await userSettingsRepository.get(user.id, DISPATCH_UI_SETTING_KEY)
        if (!existing) {
            await userSettingsRepository.upsert(
                user.id,
                DISPATCH_UI_SETTING_KEY,
                toPrismaJson(DEFAULT_DISPATCH_UI_PREFERENCES)
            )
            return { success: true as const, data: DEFAULT_DISPATCH_UI_PREFERENCES }
        }

        const parsed = parseDispatchUiPreferences(existing)
        const normalizedJson = toPrismaJson(parsed)
        if (JSON.stringify(parsed) !== JSON.stringify(existing)) {
            await userSettingsRepository.upsert(user.id, DISPATCH_UI_SETTING_KEY, normalizedJson)
        }

        return { success: true as const, data: parsed }
    } catch (error) {
        if (!isDynamicServerUsageError(error)) {
            logger.error("获取调度/日程偏好失败", error)
        }
        return {
            success: false as const,
            error: "获取调度/日程偏好失败",
            data: DEFAULT_DISPATCH_UI_PREFERENCES,
        }
    }
}

export async function updateMyDispatchUiPreferences(patch: unknown) {
    try {
        const parsedPatch = DispatchUiPatchSchema.safeParse(patch)
        if (!parsedPatch.success) {
            return {
                success: false as const,
                error: parsedPatch.error.issues[0]?.message || "输入校验失败",
            }
        }

        const ctx = await getActiveTenantContextWithPermissionOrThrow("dashboard:edit")
        const rate = await enforceRateLimit({ ctx, action: "uiSettings.dispatch.update", limit: 6000 })
        if (!rate.allowed) return { success: false as const, error: rate.error }
        const { user } = ctx

        const existing = await userSettingsRepository.get(user.id, DISPATCH_UI_SETTING_KEY)
        const current = parseDispatchUiPreferences(existing)

        const merged = DispatchUiPreferencesSchema.parse({
            ...current,
            ...parsedPatch.data,
            schedule: {
                ...current.schedule,
                ...(parsedPatch.data.schedule ?? {}),
            },
        })
        await userSettingsRepository.upsert(user.id, DISPATCH_UI_SETTING_KEY, toPrismaJson(merged))

        return { success: true as const, data: merged }
    } catch (error) {
        logger.error("更新调度/日程偏好失败", error)
        return {
            success: false as const,
            error: getPublicActionErrorMessage(error, "更新调度/日程偏好失败"),
        }
    }
}
