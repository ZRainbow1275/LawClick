import { redirect } from "next/navigation"

import { acceptTenantInvite } from "@/actions/tenant-actions"
import { TenantInviteAcceptWorkspaceClient } from "@/components/tenants/TenantInviteAcceptWorkspaceClient"
import { AuthError } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export default async function TenantInviteAcceptPage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string }>
}) {
    const { token } = await searchParams
    const tokenValue = typeof token === "string" ? token.trim() : ""

    if (!tokenValue) {
        return (
            <TenantInviteAcceptWorkspaceClient
                title="邀请码无效"
                message="缺少 token 参数。"
                actions={[
                    { href: "/tenants", label: "返回租户页", variant: "secondary" },
                    { href: "/dashboard", label: "回到工作台" },
                ]}
            />
        )
    }

    let res: Awaited<ReturnType<typeof acceptTenantInvite>>
    try {
        res = await acceptTenantInvite({ token: tokenValue })
    } catch (error) {
        if (error instanceof AuthError) {
            redirect(`/auth/login?next=${encodeURIComponent(`/tenants/accept?token=${tokenValue}`)}`)
        }
        throw error
    }

    if (!res.success) {
        return (
            <TenantInviteAcceptWorkspaceClient
                title="接受邀请失败"
                message={res.error}
                actions={[
                    { href: "/tenants", label: "查看租户与邀请", variant: "secondary" },
                    { href: "/dashboard", label: "回到工作台" },
                ]}
            />
        )
    }

    return (
        <TenantInviteAcceptWorkspaceClient
            title="已加入租户"
            message="已成功加入租户并切换工作区；现在可以继续使用项目/任务/看板等功能。"
            actions={[
                { href: "/dashboard", label: "进入工作台" },
                { href: "/tenants", label: "管理租户与邀请", variant: "secondary" },
            ]}
        />
    )
}
