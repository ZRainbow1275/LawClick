import Link from "next/link"
import { redirect } from "next/navigation"
import { TenantMembershipRole, TenantMembershipStatus } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { AuthError, getSessionUserOrThrow, getTenantId, hasTenantRole } from "@/lib/server-auth"
import { getMyPendingTenantInvites } from "@/actions/tenant-actions"
import { TenantsClient } from "@/components/tenants/TenantsClient"
import { GlassPanel } from "@/components/ui/GlassPanel"

export const dynamic = "force-dynamic"

export default async function TenantsPage() {
    let user: Awaited<ReturnType<typeof getSessionUserOrThrow>>
    try {
        user = await getSessionUserOrThrow()
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        throw error
    }

    const tenantId = getTenantId(user)

    const [memberships, activeTenant, invitesRes] = await Promise.all([
        prisma.tenantMembership.findMany({
            where: { userId: user.id, status: TenantMembershipStatus.ACTIVE },
            orderBy: [{ role: "asc" }, { createdAt: "asc" }],
            select: {
                role: true,
                tenant: { select: { id: true, name: true } },
            },
        }),
        prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } }),
        getMyPendingTenantInvites({ take: 50 }),
    ])

    const invites = invitesRes.success ? invitesRes.data : []

    const activeName = activeTenant?.name || tenantId
    const activeRole = memberships.find((m) => m.tenant.id === tenantId)?.role ?? null
    const canManageTenant = Boolean(activeRole && hasTenantRole(activeRole, TenantMembershipRole.ADMIN))

    return (
        <div className="space-y-6">
            <GlassPanel intensity="solid" className="flex items-center justify-between gap-3 p-4">
                <div>
                    <div className="text-xs text-muted-foreground">工作区</div>
                    <div className="text-xl font-semibold tracking-tight">租户与邀请</div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                        当前：<span className="font-medium text-foreground">{activeName}</span>
                    </span>
                    {canManageTenant ? (
                        <Link href="/admin/tenants" className="text-primary hover:underline">
                            租户管理
                        </Link>
                    ) : null}
                </div>
            </GlassPanel>

            <TenantsClient
                activeTenant={{ id: tenantId, name: activeName }}
                tenants={memberships.map((m) => ({ id: m.tenant.id, name: m.tenant.name, role: m.role }))}
                pendingInvites={invites}
            />
        </div>
    )
}
