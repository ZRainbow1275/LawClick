import { notFound, redirect } from "next/navigation"
import { getPartyById } from "@/actions/party-actions"
import { PartyDetailClient } from "@/components/cases/PartyDetailClient"
import { AuthError, PermissionError } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export default async function PartyDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params

    let res: Awaited<ReturnType<typeof getPartyById>>
    try {
        res = await getPartyById(id)
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        if (error instanceof PermissionError) notFound()
        throw error
    }

    if (!res.success || !res.data) notFound()

    return <PartyDetailClient party={res.data} />
}

