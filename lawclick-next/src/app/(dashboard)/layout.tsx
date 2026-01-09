import { SidebarProvider, SidebarInset } from "@/components/ui/Sidebar"
import { AppSidebar } from '@/components/layout/AppSidebar';
import { AppHeader } from '@/components/layout/AppHeader';
import { FloatingLayer } from '@/components/layout/FloatingLayer';
import { RoleProvider } from '@/components/layout/RoleContext';
import { TenantPermissionProvider } from "@/components/providers/TenantPermissionProvider"
import { UiPreferencesProvider } from "@/components/layout/UiPreferencesProvider"
import { FloatingLauncher } from "@/components/layout/FloatingLauncher"
import {
    getMyAppUiPreferences,
    getMyCasesUiPreferences,
    getMyDashboardUiPreferences,
    getMyFloatingLauncherConfig,
    getMyOnboardingUiPreferences,
} from "@/actions/ui-settings"
import { getMyTenantContext } from "@/actions/tenant-actions"
import { getActiveTenantContextOrThrow, hasTenantPermission } from "@/lib/server-auth"
import { ALL_PERMISSIONS, type Permission } from "@/lib/permissions"
import { DEFAULT_FLOATING_LAUNCHER_CONFIG } from "@/lib/ui/floating-launcher"
import { DEFAULT_DASHBOARD_UI_PREFERENCES } from "@/lib/ui/dashboard-preferences"
import { DEFAULT_ONBOARDING_UI_PREFERENCES } from "@/lib/ui/onboarding-preferences"
import { DEFAULT_CASES_UI_PREFERENCES } from "@/lib/ui/cases-preferences"       
import { DEFAULT_APP_UI_PREFERENCES } from "@/lib/ui/app-preferences"
import { PageWorkspace } from "@/components/layout/PageWorkspace"

export const dynamic = "force-dynamic"

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const emptyPermissionMap = Object.fromEntries(ALL_PERMISSIONS.map((p) => [p, false])) as Record<Permission, boolean>

    const [appRes, launcherRes, dashboardRes, onboardingRes, casesRes, tenantRes, permissionCtx] = await Promise.all([
        getMyAppUiPreferences(),
        getMyFloatingLauncherConfig(),
        getMyDashboardUiPreferences(),
        getMyOnboardingUiPreferences(),
        getMyCasesUiPreferences(),
        getMyTenantContext(),
        getActiveTenantContextOrThrow().catch(() => null),
    ])

    const initialAppUi = appRes.success ? appRes.data : DEFAULT_APP_UI_PREFERENCES
    const initialFloatingLauncher = launcherRes.success ? launcherRes.data : DEFAULT_FLOATING_LAUNCHER_CONFIG
    const initialDashboardUi = dashboardRes.success ? dashboardRes.data : DEFAULT_DASHBOARD_UI_PREFERENCES
    const initialOnboardingUi = onboardingRes.success ? onboardingRes.data : DEFAULT_ONBOARDING_UI_PREFERENCES
    const initialCasesUi = casesRes.success ? casesRes.data : DEFAULT_CASES_UI_PREFERENCES

    const tenantPermissionMap =
        permissionCtx === null
            ? emptyPermissionMap
            : (Object.fromEntries(ALL_PERMISSIONS.map((p) => [p, hasTenantPermission(permissionCtx, p)])) as Record<
                  Permission,
                  boolean
              >)

    return (
        <RoleProvider>
            <TenantPermissionProvider permissions={tenantPermissionMap}>
                <SidebarProvider
                    data-density={initialAppUi.density}
                    data-accent={initialAppUi.accent}
                    data-contrast={initialAppUi.contrast}
                    className="h-screen bg-background overflow-hidden font-sans antialiased text-foreground"
                >
                    {/* Wrapper used to keep UI state consistent across pages */}
                    <UiPreferencesProvider
                        initialAppUi={initialAppUi}
                        initialFloatingLauncher={initialFloatingLauncher}
                        initialDashboardUi={initialDashboardUi}
                        initialOnboardingUi={initialOnboardingUi}
                        initialCasesUi={initialCasesUi}
                    >
                        <AppSidebar />
                        <SidebarInset className="min-w-0 transition-all duration-300 ease-in-out relative">
                            <AppHeader initialTenantContext={tenantRes.success ? tenantRes.data : null} />
                            <div className="flex-1 overflow-auto p-[var(--lc-page-padding)] relative scroll-smooth">
                                <PageWorkspace>{children}</PageWorkspace>
                            </div>
                            {/* Global Floating Elements */}
                            <FloatingLayer />
                            <FloatingLauncher />
                        </SidebarInset>
                    </UiPreferencesProvider>
                </SidebarProvider>
            </TenantPermissionProvider>
        </RoleProvider>
    );
}
