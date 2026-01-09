"use client"

import * as React from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"

import {
    updateMyAppUiPreferences,
    updateMyCasesUiPreferences,
    updateMyDashboardUiPreferences,
    updateMyFloatingLauncherConfig,
    updateMyOnboardingUiPreferences,
} from "@/actions/ui-settings"
import { AppUiPreferencesSchema, type AppUiPreferences } from "@/lib/ui/app-preferences"
import { CasesUiPreferencesSchema, type CasesUiPreferences } from "@/lib/ui/cases-preferences"
import { DashboardUiPreferencesSchema, type DashboardUiPreferences } from "@/lib/ui/dashboard-preferences"
import { FloatingLauncherConfigSchema, type FloatingLauncherConfig } from "@/lib/ui/floating-launcher"
import { OnboardingUiPreferencesSchema, type OnboardingUiPreferences } from "@/lib/ui/onboarding-preferences"

const SIDEBAR_WRAPPER_SELECTOR = '[data-slot="sidebar-wrapper"]'

function syncUiDataset<Key extends "density" | "accent" | "contrast">(key: Key, value: AppUiPreferences[Key]) {
    document.documentElement.dataset[key] = value

    for (const el of document.querySelectorAll<HTMLElement>(SIDEBAR_WRAPPER_SELECTOR)) {
        el.dataset[key] = value
    }
}

type UiPreferencesContextValue = {
    app: AppUiPreferences
    patchAppLocal: (patch: Partial<AppUiPreferences>) => void
    persistAppPatch: (patch: Partial<AppUiPreferences>) => void
    appSaving: boolean
    floatingLauncher: FloatingLauncherConfig
    patchFloatingLauncherLocal: (patch: Partial<FloatingLauncherConfig>) => void
    persistFloatingLauncherPatch: (patch: Partial<FloatingLauncherConfig>) => void
    floatingLauncherSaving: boolean
    dashboard: DashboardUiPreferences
    patchDashboardLocal: (patch: Partial<DashboardUiPreferences>) => void
    persistDashboardPatch: (patch: Partial<DashboardUiPreferences>) => void
    dashboardSaving: boolean
    onboarding: OnboardingUiPreferences
    patchOnboardingLocal: (patch: Partial<OnboardingUiPreferences>) => void
    persistOnboardingPatch: (patch: Partial<OnboardingUiPreferences>) => void
    onboardingSaving: boolean
    cases: CasesUiPreferences
    patchCasesLocal: (patch: Partial<CasesUiPreferences>) => void
    persistCasesPatch: (patch: Partial<CasesUiPreferences>) => void
    casesSaving: boolean
}

const UiPreferencesContext = React.createContext<UiPreferencesContextValue | null>(null)

export function UiPreferencesProvider(props: {
    initialAppUi: AppUiPreferences
    initialFloatingLauncher: FloatingLauncherConfig
    initialDashboardUi: DashboardUiPreferences
    initialOnboardingUi: OnboardingUiPreferences
    initialCasesUi: CasesUiPreferences
    children: React.ReactNode
}) {
    const { initialAppUi, initialFloatingLauncher, initialDashboardUi, initialOnboardingUi, initialCasesUi, children } =
        props

    const [app, setApp] = React.useState<AppUiPreferences>(() => AppUiPreferencesSchema.parse(initialAppUi))
    const { setTheme } = useTheme()
    const router = useRouter()

    const [floatingLauncher, setFloatingLauncher] = React.useState<FloatingLauncherConfig>(() =>
        FloatingLauncherConfigSchema.parse(initialFloatingLauncher)
    )

    const [dashboard, setDashboard] = React.useState<DashboardUiPreferences>(() =>
        DashboardUiPreferencesSchema.parse(initialDashboardUi)
    )

    const [onboarding, setOnboarding] = React.useState<OnboardingUiPreferences>(() =>
        OnboardingUiPreferencesSchema.parse(initialOnboardingUi)
    )

    const [cases, setCases] = React.useState<CasesUiPreferences>(() => CasesUiPreferencesSchema.parse(initialCasesUi))

    const [floatingLauncherSaving, startFloatingLauncherTransition] = React.useTransition()
    const [appSaving, startAppTransition] = React.useTransition()
    const [dashboardSaving, startDashboardTransition] = React.useTransition()
    const [onboardingSaving, startOnboardingTransition] = React.useTransition()
    const [casesSaving, startCasesTransition] = React.useTransition()

    React.useEffect(() => {
        syncUiDataset("density", app.density)
    }, [app.density])

    React.useEffect(() => {
        syncUiDataset("accent", app.accent)
    }, [app.accent])

    React.useEffect(() => {
        syncUiDataset("contrast", app.contrast)
    }, [app.contrast])

    React.useEffect(() => {
        setTheme(app.theme)
    }, [app.theme, setTheme])

    const patchAppLocal = React.useCallback((patch: Partial<AppUiPreferences>) => {
        setApp((prev) => AppUiPreferencesSchema.parse({ ...prev, ...patch }))
    }, [])

    const persistAppPatch = React.useCallback(
        (patch: Partial<AppUiPreferences>) => {
            const before = app
            patchAppLocal(patch)

            startAppTransition(async () => {
                const res = await updateMyAppUiPreferences(patch)
                if (!res.success) {
                    setApp(before)
                    toast.error("全局界面偏好保存失败", { description: res.error })
                    return
                }
                setApp(res.data)
                if (patch.locale && before.locale !== res.data.locale) {
                    router.refresh()
                }
            })
        },
        [app, patchAppLocal, router]
    )

    const patchFloatingLauncherLocal = React.useCallback((patch: Partial<FloatingLauncherConfig>) => {
        setFloatingLauncher((prev) => FloatingLauncherConfigSchema.parse({ ...prev, ...patch }))
    }, [])

    const persistFloatingLauncherPatch = React.useCallback(
        (patch: Partial<FloatingLauncherConfig>) => {
            const before = floatingLauncher
            patchFloatingLauncherLocal(patch)

            startFloatingLauncherTransition(async () => {
                const res = await updateMyFloatingLauncherConfig(patch)
                if (!res.success) {
                    setFloatingLauncher(before)
                    toast.error("组件球设置保存失败", { description: res.error })
                    return
                }
                setFloatingLauncher(res.data)
            })
        },
        [floatingLauncher, patchFloatingLauncherLocal]
    )

    const patchDashboardLocal = React.useCallback((patch: Partial<DashboardUiPreferences>) => {
        setDashboard((prev) => DashboardUiPreferencesSchema.parse({ ...prev, ...patch }))
    }, [])

    const persistDashboardPatch = React.useCallback(
        (patch: Partial<DashboardUiPreferences>) => {
            const before = dashboard
            patchDashboardLocal(patch)

            startDashboardTransition(async () => {
                const res = await updateMyDashboardUiPreferences(patch)
                if (!res.success) {
                    setDashboard(before)
                    toast.error("仪表盘偏好保存失败", { description: res.error })
                    return
                }
                setDashboard(res.data)
            })
        },
        [dashboard, patchDashboardLocal]
    )

    const patchOnboardingLocal = React.useCallback((patch: Partial<OnboardingUiPreferences>) => {
        setOnboarding((prev) => OnboardingUiPreferencesSchema.parse({ ...prev, ...patch }))
    }, [])

    const persistOnboardingPatch = React.useCallback(
        (patch: Partial<OnboardingUiPreferences>) => {
            const before = onboarding
            patchOnboardingLocal(patch)

            startOnboardingTransition(async () => {
                const res = await updateMyOnboardingUiPreferences(patch)
                if (!res.success) {
                    setOnboarding(before)
                    toast.error("新手引导设置保存失败", { description: res.error })
                    return
                }
                setOnboarding(res.data)
            })
        },
        [onboarding, patchOnboardingLocal]
    )

    const patchCasesLocal = React.useCallback((patch: Partial<CasesUiPreferences>) => {
        setCases((prev) => CasesUiPreferencesSchema.parse({ ...prev, ...patch }))
    }, [])

    const persistCasesPatch = React.useCallback(
        (patch: Partial<CasesUiPreferences>) => {
            const before = cases
            patchCasesLocal(patch)

            startCasesTransition(async () => {
                const res = await updateMyCasesUiPreferences(patch)
                if (!res.success) {
                    setCases(before)
                    toast.error("案件页面偏好保存失败", { description: res.error })
                    return
                }
                setCases(res.data)
            })
        },
        [cases, patchCasesLocal]
    )

    const value = React.useMemo<UiPreferencesContextValue>(
        () => ({
            app,
            patchAppLocal,
            persistAppPatch,
            appSaving,
            floatingLauncher,
            patchFloatingLauncherLocal,
            persistFloatingLauncherPatch,
            floatingLauncherSaving,
            dashboard,
            patchDashboardLocal,
            persistDashboardPatch,
            dashboardSaving,
            onboarding,
            patchOnboardingLocal,
            persistOnboardingPatch,
            onboardingSaving,
            cases,
            patchCasesLocal,
            persistCasesPatch,
            casesSaving,
        }),
        [
            app,
            patchAppLocal,
            persistAppPatch,
            appSaving,
            floatingLauncher,
            patchFloatingLauncherLocal,
            persistFloatingLauncherPatch,
            floatingLauncherSaving,
            dashboard,
            patchDashboardLocal,
            persistDashboardPatch,
            dashboardSaving,
            onboarding,
            patchOnboardingLocal,
            persistOnboardingPatch,
            onboardingSaving,
            cases,
            patchCasesLocal,
            persistCasesPatch,
            casesSaving,
        ]
    )

    return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>
}

export function useUiPreferences() {
    const ctx = React.useContext(UiPreferencesContext)
    if (!ctx) {
        throw new Error("useUiPreferences must be used within UiPreferencesProvider")
    }
    return ctx
}
