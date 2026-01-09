"use client"

import * as React from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { useUiPreferences } from "@/components/layout/UiPreferencesProvider"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select"
import { Switch } from "@/components/ui/Switch"
import { usePermission } from "@/hooks/use-permission"
import { AppAccentSchema, AppContrastSchema, AppDensitySchema, AppLocaleSchema, AppThemeSchema, DEFAULT_APP_UI_PREFERENCES } from "@/lib/ui/app-preferences"
import { DEFAULT_CASES_UI_PREFERENCES, IntakeCasesViewModeSchema } from "@/lib/ui/cases-preferences"
import { DEFAULT_DASHBOARD_UI_PREFERENCES, DashboardDensitySchema } from "@/lib/ui/dashboard-preferences"
import { DEFAULT_FLOATING_LAUNCHER_CONFIG, FloatingLauncherDockSideSchema } from "@/lib/ui/floating-launcher"
import { DEFAULT_ONBOARDING_UI_PREFERENCES } from "@/lib/ui/onboarding-preferences"

export function SettingsClient() {
    const { can } = usePermission()
    const canEdit = can("dashboard:edit")
    const tGlobal = useTranslations("settings.global")
    const tLocale = useTranslations("settings.locale")

    const {
        app,
        persistAppPatch,
        appSaving,
        floatingLauncher,
        persistFloatingLauncherPatch,
        floatingLauncherSaving,
        dashboard,
        persistDashboardPatch,
        dashboardSaving,
        onboarding,
        persistOnboardingPatch,
        onboardingSaving,
        cases,
        persistCasesPatch,
        casesSaving,
    } = useUiPreferences()

    const [offsetRatioDraft, setOffsetRatioDraft] = React.useState(() => String(floatingLauncher.offsetRatio))
    React.useEffect(() => {
        setOffsetRatioDraft(String(floatingLauncher.offsetRatio))
    }, [floatingLauncher.offsetRatio])

    const baseDisabled = !canEdit

    const globalUiPanel = (
        <Card className="h-full">
            <CardHeader className="pb-3">
                <CardTitle className="text-base">界面偏好（全局）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label>主题</Label>
                        <Select
                            value={app.theme}
                            onValueChange={(value) => {
                                const parsed = AppThemeSchema.safeParse(value)
                                if (!parsed.success) {
                                    toast.error("主题值不合法")
                                    return
                                }
                                persistAppPatch({ theme: parsed.data })
                            }}
                            disabled={baseDisabled || appSaving}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="system">跟随系统</SelectItem>
                                <SelectItem value="light">浅色</SelectItem>
                                <SelectItem value="dark">深色</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>密度</Label>
                        <Select
                            value={app.density}
                            onValueChange={(value) => {
                                const parsed = AppDensitySchema.safeParse(value)
                                if (!parsed.success) {
                                    toast.error("密度值不合法")
                                    return
                                }
                                persistAppPatch({ density: parsed.data })
                            }}
                            disabled={baseDisabled || appSaving}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="comfortable">舒适</SelectItem>
                                <SelectItem value="compact">紧凑</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>主色调</Label>
                        <Select
                            value={app.accent}
                            onValueChange={(value) => {
                                const parsed = AppAccentSchema.safeParse(value)
                                if (!parsed.success) {
                                    toast.error("主色调值不合法")
                                    return
                                }
                                persistAppPatch({ accent: parsed.data })
                            }}
                            disabled={baseDisabled || appSaving}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="orange">律时橙</SelectItem>
                                <SelectItem value="blue">信息蓝</SelectItem>
                                <SelectItem value="slate">权威蓝灰</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>对比度</Label>
                        <Select
                            value={app.contrast}
                            onValueChange={(value) => {
                                const parsed = AppContrastSchema.safeParse(value)
                                if (!parsed.success) {
                                    toast.error("对比度值不合法")
                                    return
                                }
                                persistAppPatch({ contrast: parsed.data })
                            }}
                            disabled={baseDisabled || appSaving}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="system">跟随系统</SelectItem>
                                <SelectItem value="normal">正常</SelectItem>
                                <SelectItem value="high">高对比</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>{tGlobal("locale")}</Label>
                        <Select
                            value={app.locale}
                            onValueChange={(value) => {
                                const parsed = AppLocaleSchema.safeParse(value)
                                if (!parsed.success) {
                                    toast.error("语言值不合法")
                                    return
                                }
                                persistAppPatch({ locale: parsed.data })
                            }}
                            disabled={baseDisabled || appSaving}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="zh-CN">{tLocale("zhCN")}</SelectItem>
                                <SelectItem value="en-US">{tLocale("enUS")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-2">       
                    <div className="text-xs text-muted-foreground">
                        以上配置写入数据库，跨设备同步；可随时恢复默认。
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={baseDisabled || appSaving}
                        onClick={() => persistAppPatch(DEFAULT_APP_UI_PREFERENCES)}
                    >
                        恢复默认
                    </Button>
                </div>
            </CardContent>
        </Card>
    )

    const floatingLauncherPanel = (
        <Card className="h-full">
            <CardHeader className="pb-3">
                <CardTitle className="text-base">浮动球（全局）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                    <div className="space-y-1">
                        <div className="text-sm font-medium">启用浮动球</div>
                        <div className="text-xs text-muted-foreground">用于打开计时器、聊天、乐高浮窗等窗口</div>
                    </div>
                    <Switch
                        checked={floatingLauncher.enabled}
                        onCheckedChange={(checked) => persistFloatingLauncherPatch({ enabled: checked })}
                        disabled={baseDisabled || floatingLauncherSaving}
                    />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label>停靠边</Label>
                        <Select
                            value={floatingLauncher.dockSide}
                            onValueChange={(value) => {
                                const parsed = FloatingLauncherDockSideSchema.safeParse(value)
                                if (!parsed.success) {
                                    toast.error("停靠边值不合法")
                                    return
                                }
                                persistFloatingLauncherPatch({ dockSide: parsed.data })
                            }}
                            disabled={baseDisabled || floatingLauncherSaving}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="left">左</SelectItem>
                                <SelectItem value="right">右</SelectItem>
                                <SelectItem value="top">上</SelectItem>
                                <SelectItem value="bottom">下</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>偏移比例（0-1）</Label>
                        <div className="flex items-center gap-2">
                            <Input
                                value={offsetRatioDraft}
                                onChange={(e) => setOffsetRatioDraft(e.target.value)}
                                inputMode="decimal"
                                disabled={baseDisabled || floatingLauncherSaving}
                            />
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={baseDisabled || floatingLauncherSaving}
                                onClick={() => {
                                    const next = Number(offsetRatioDraft)
                                    if (!Number.isFinite(next) || next < 0 || next > 1) {
                                        toast.error("偏移比例必须在 0 到 1 之间")
                                        return
                                    }
                                    persistFloatingLauncherPatch({ offsetRatio: next })
                                }}
                            >
                                应用
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">浮动球位置支持跨设备同步。</div>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={baseDisabled || floatingLauncherSaving}
                        onClick={() => persistFloatingLauncherPatch(DEFAULT_FLOATING_LAUNCHER_CONFIG)}
                    >
                        恢复默认
                    </Button>
                </div>
            </CardContent>
        </Card>
    )

    const pageUiPanel = (
        <Card className="h-full">
            <CardHeader className="pb-3">
                <CardTitle className="text-base">页面偏好</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label>仪表盘密度</Label>
                        <Select
                            value={dashboard.density}
                            onValueChange={(value) => {
                                const parsed = DashboardDensitySchema.safeParse(value)
                                if (!parsed.success) {
                                    toast.error("仪表盘密度值不合法")
                                    return
                                }
                                persistDashboardPatch({ density: parsed.data })
                            }}
                            disabled={baseDisabled || dashboardSaving}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="comfortable">舒适</SelectItem>
                                <SelectItem value="compact">紧凑</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>立案看板视图</Label>
                        <Select
                            value={cases.intakeViewMode}
                            onValueChange={(value) => {
                                const parsed = IntakeCasesViewModeSchema.safeParse(value)
                                if (!parsed.success) {
                                    toast.error("立案视图值不合法")
                                    return
                                }
                                persistCasesPatch({ intakeViewMode: parsed.data })
                            }}
                            disabled={baseDisabled || casesSaving}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="split">分屏（看板+列表）</SelectItem>
                                <SelectItem value="list">列表</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={baseDisabled || dashboardSaving}
                        onClick={() => persistDashboardPatch(DEFAULT_DASHBOARD_UI_PREFERENCES)}
                    >
                        仪表盘恢复默认
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={baseDisabled || casesSaving}
                        onClick={() => persistCasesPatch(DEFAULT_CASES_UI_PREFERENCES)}
                    >
                        案件页恢复默认
                    </Button>
                </div>
            </CardContent>
        </Card>
    )

    const onboardingPanel = (
        <Card className="h-full">
            <CardHeader className="pb-3">
                <CardTitle className="text-base">新手引导</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                    <div className="space-y-1">
                        <div className="text-sm font-medium">显示浮动球引导</div>
                        <div className="text-xs text-muted-foreground">用于重新展示浮动球的操作提示</div>
                    </div>
                    <Switch
                        checked={!onboarding.floatingLauncherCoachmarkDismissed}
                        onCheckedChange={(checked) =>
                            persistOnboardingPatch({ floatingLauncherCoachmarkDismissed: !checked })
                        }
                        disabled={baseDisabled || onboardingSaving}
                    />
                </div>

                <div className="flex items-center justify-end">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={baseDisabled || onboardingSaving}
                        onClick={() => persistOnboardingPatch(DEFAULT_ONBOARDING_UI_PREFERENCES)}
                    >
                        恢复默认
                    </Button>
                </div>
            </CardContent>
        </Card>
    )

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_global_ui",
            title: "界面偏好",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 10, minW: 8, minH: 8 },
            content: globalUiPanel,
        },
        {
            id: "b_floating_launcher",
            title: "浮动球",
            chrome: "none",
            defaultSize: { w: 12, h: 10, minW: 8, minH: 8 },
            content: floatingLauncherPanel,
        },
        {
            id: "b_page_ui",
            title: "页面偏好",
            chrome: "none",
            defaultSize: { w: 12, h: 10, minW: 8, minH: 8 },
            content: pageUiPanel,
        },
        {
            id: "b_onboarding",
            title: "新手引导",
            chrome: "none",
            defaultSize: { w: 12, h: 8, minW: 8, minH: 6 },
            content: onboardingPanel,
        },
    ]

    return (
        <SectionWorkspace
            title={`设置${canEdit ? "" : "（只读）"}`}
            sectionId="settings"
            catalog={catalog}
            className="h-full"
        />
    )
}
