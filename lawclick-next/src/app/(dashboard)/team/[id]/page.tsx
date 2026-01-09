import { notFound, redirect } from "next/navigation"
import { getUserActivity, getUserDetail } from "@/actions/collaboration-actions"
import { UserDetailClient } from "@/components/team/UserDetailClient"
import { AuthError, getSessionUserOrThrow, PermissionError } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export default async function TeamMemberDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params

    let currentUser: Awaited<ReturnType<typeof getSessionUserOrThrow>>
    try {
        currentUser = await getSessionUserOrThrow()
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        throw error
    }

    let res: Awaited<ReturnType<typeof getUserDetail>>
    let activityRes: Awaited<ReturnType<typeof getUserActivity>> | null = null
    try {
        ;[res, activityRes] = await Promise.all([getUserDetail(id), getUserActivity(id)])
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        if (error instanceof PermissionError) notFound()
        throw error
    }

    if (!res.success || !res.data) notFound()

    return (
        <UserDetailClient
            currentUserId={currentUser.id}
            user={res.data}
            activities={activityRes?.success ? activityRes.data : []}
            activityError={activityRes && !activityRes.success ? activityRes.error : null}
        />
    )
}
