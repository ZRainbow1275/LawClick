import { notFound, redirect } from "next/navigation"
import { getContractById } from "@/actions/contract-actions"
import { ContractDetailClient } from "@/components/finance/ContractDetailClient"
import { AuthError, PermissionError } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export default async function ContractDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params

    let res: Awaited<ReturnType<typeof getContractById>>
    try {
        res = await getContractById(id)
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        if (error instanceof PermissionError) notFound()
        throw error
    }

    if (!res.success || !res.data) notFound()

    return <ContractDetailClient contract={res.data} />
}

