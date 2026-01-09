import { notFound, redirect } from "next/navigation"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { EmployeeBusinessCard } from "@/components/team/EmployeeBusinessCard"
import { Badge } from "@/components/ui/Badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { getUserBusinessCard } from "@/actions/user-business-card"
import { AuthError, getActiveTenantContextWithPermissionOrThrow, PermissionError } from "@/lib/server-auth"
import { UuidSchema } from "@/lib/zod"

export const dynamic = "force-dynamic"

export default async function TeamMemberCardPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    try {
        await getActiveTenantContextWithPermissionOrThrow("team:view")
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        if (error instanceof PermissionError) notFound()
        throw error
    }

    const { id } = await params
    const parsedId = UuidSchema.safeParse(id)
    if (!parsedId.success) notFound()

    const res = await getUserBusinessCard(parsedId.data)
    if (!res.success) notFound()

    const profile = res.data

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_business_card",
            title: "员工名片",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 8, minW: 8, minH: 6 },
            content: (
                <EmployeeBusinessCard
                    user={{
                        id: profile.id,
                        name: profile.name,
                        email: profile.email,
                        role: profile.role,
                        avatarUrl: profile.avatarUrl,
                        department: profile.department,
                        title: profile.title,
                        phone: profile.phone,
                        employeeNo: profile.employeeNo,
                    }}
                    organizationName={profile.tenantName}
                />
            ),
        },
        {
            id: "b_email",
            title: "邮箱",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
            content: (
                <div className="rounded-md border bg-card/50 px-4 py-3 h-full">
                    <div className="text-xs text-muted-foreground">邮箱</div>
                    <div className="mt-1 text-sm break-all">{profile.email}</div>
                </div>
            ),
        },
        {
            id: "b_phone",
            title: "手机",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 6, h: 4, minW: 4, minH: 3 },
            content: (
                <div className="rounded-md border bg-card/50 px-4 py-3 h-full">
                    <div className="text-xs text-muted-foreground">手机</div>
                    <div className="mt-1 text-sm">{profile.phone || "-"}</div>
                </div>
            ),
        },
        {
            id: "b_status",
            title: "状态摘要",
            chrome: "none",
            defaultSize: { w: 12, h: 6, minW: 6, minH: 5 },
            content: (
                <Card className="h-full">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">状态摘要</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">状态</span>
                            <Badge variant="outline">{String(profile.status)}</Badge>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">状态说明</span>
                            <span className="truncate max-w-[70%]" title={profile.statusMessage || "-"}>
                                {profile.statusMessage || "-"}
                            </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">最后活跃</span>
                            <span>{profile.lastActiveAt ? new Date(profile.lastActiveAt).toLocaleString("zh-CN") : "-"}</span>
                        </div>
                    </CardContent>
                </Card>
            ),
        },
    ]

    return <SectionWorkspace title="成员名片" sectionId="team_member_card" entityId={profile.id} catalog={catalog} className="h-full" />
}
