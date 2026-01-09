import { redirect } from "next/navigation"
import { getRecycleBinSnapshot } from "@/actions/recycle-bin"
import { RecycleBinClient } from "@/components/admin/RecycleBinClient"
import { AuthError, PermissionError, getActiveTenantContextWithPermissionOrThrow } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export default async function AdminRecycleBinPage() {
    try {
        await getActiveTenantContextWithPermissionOrThrow("admin:settings")
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        if (error instanceof PermissionError) {
            return <div className="p-6 text-sm text-muted-foreground">无权限访问</div>
        }
        throw error
    }

    const snapshot = await getRecycleBinSnapshot()
    return <RecycleBinClient initial={snapshot.data} initialError={snapshot.success ? null : snapshot.error} />
}

