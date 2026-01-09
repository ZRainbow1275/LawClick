import { redirect } from "next/navigation"
import { TenantInviteStatus } from "@prisma/client"

import { listTenantMembers } from "@/actions/tenant-actions"
import { prisma } from "@/lib/prisma"
import { AuthError, PermissionError, getActiveTenantContextWithPermissionOrThrow } from "@/lib/server-auth"
import { TenantAdminClient } from "@/components/admin/TenantAdminClient"

export const dynamic = "force-dynamic"

export default async function AdminTenantsPage() {
    let ctx: Awaited<ReturnType<typeof getActiveTenantContextWithPermissionOrThrow>>
    try {
        ctx = await getActiveTenantContextWithPermissionOrThrow("admin:settings")
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        if (error instanceof PermissionError) {
            return <div className="p-6 text-sm text-muted-foreground">无权限访问</div>
        }
        throw error
    }

    const tenantId = ctx.tenantId
    const canOffboard = ctx.membership.role === "OWNER"

    const membersRes = await listTenantMembers({ tenantId, includeInactive: true })
    const members = membersRes.success ? membersRes.data : []

    const [tenant, invites] = await prisma.$transaction([
        prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { id: true, name: true, firm: { select: { id: true, name: true } } },
        }),
        prisma.tenantInvite.findMany({
            where: { tenantId, status: { in: [TenantInviteStatus.PENDING, TenantInviteStatus.EXPIRED, TenantInviteStatus.REVOKED] } },
            orderBy: { createdAt: "desc" },
            take: 200,
            select: {
                id: true,
                email: true,
                role: true,
                status: true,
                expiresAt: true,
                createdAt: true,
                createdBy: { select: { id: true, name: true, email: true } },
            },
        }),
    ])

    if (!tenant) {
        return <div className="p-6 text-sm text-muted-foreground">租户不存在：{tenantId}</div>
    }
    if (!tenant.firm) {
        return <div className="p-6 text-sm text-muted-foreground">租户未绑定机构（firm）：{tenantId}</div>
    }

    return (
        <div className="space-y-4">
            {!membersRes.success ? (
                <div className="rounded-lg border bg-destructive/5 p-4 text-sm text-destructive">
                    成员加载失败：{membersRes.error}
                </div>
            ) : null}
            <TenantAdminClient
                currentUserId={ctx.user.id}
                canOffboard={canOffboard}
                tenant={tenant}
                firm={tenant.firm}
                members={members}
                invites={invites.map((i) => ({
                    ...i,
                    expiresAt: i.expiresAt.toISOString(),
                    createdAt: i.createdAt.toISOString(),
                }))}
            />
        </div>
    )
}
