import { notFound, redirect } from "next/navigation"
import { getApprovalById } from "@/actions/approval-actions"
import { ApprovalDetailClient } from "@/components/admin/ApprovalDetailClient"
import { AuthError, PermissionError } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export default async function ApprovalDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params

    let res: Awaited<ReturnType<typeof getApprovalById>>
    try {
        res = await getApprovalById(id)
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        if (error instanceof PermissionError) notFound()
        throw error
    }

    if (!res.success || !res.data) notFound()
    return <ApprovalDetailClient approval={res.data} />
}

