import { redirect } from "next/navigation"

import { SettingsClient } from "@/components/settings/SettingsClient"
import { AuthError, PermissionError, getActiveTenantContextWithPermissionOrThrow } from "@/lib/server-auth"

export default async function SettingsPage() {
    try {
        await getActiveTenantContextWithPermissionOrThrow("dashboard:view")
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        if (error instanceof PermissionError) {
            return <div className="p-6 text-sm text-muted-foreground">无权限访问</div>
        }
        throw error
    }

    return <SettingsClient />
}

