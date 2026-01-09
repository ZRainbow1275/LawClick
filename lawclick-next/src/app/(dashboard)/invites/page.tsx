import { redirect } from "next/navigation"
import { Bell } from "lucide-react"
import { getMyInvites } from "@/actions/collaboration-actions"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { PendingInvitesPanel } from "@/components/dispatch/PendingInvitesPanel"
import { Badge } from "@/components/ui/Badge"
import { AuthError, PermissionError, getActiveTenantContextWithPermissionOrThrow } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export default async function InvitesPage() {
    try {
        await getActiveTenantContextWithPermissionOrThrow("team:view")
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        if (error instanceof PermissionError) {
            return <div className="p-6 text-sm text-muted-foreground">无权限访问</div>
        }
        throw error
    }

    const invitesRes = await getMyInvites("received")
    const invites = invitesRes.success ? invitesRes.data : []
    const pendingCount = invites.filter((i) => i.status === "PENDING").length

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_invites_header",
            title: "导航",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 4, minW: 8, minH: 3 },
            content: (
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-semibold">协作邀请</h1>
                        <Badge variant="secondary" className="text-xs">
                            待处理 {pendingCount}
                        </Badge>
                    </div>
                </div>
            ),
        },
        {
            id: "b_invites_pending",
            title: "待处理邀请",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 14, minW: 8, minH: 10 },
            content:
                pendingCount === 0 ? (
                    <div className="rounded-lg border bg-card/60 p-6 text-center text-sm text-muted-foreground">
                        <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        暂无待处理邀请
                    </div>
                ) : (
                    <PendingInvitesPanel invites={invites} />
                ),
        },
    ]

    return <SectionWorkspace title="协作邀请" sectionId="invites" catalog={catalog} className="h-full" />
}
