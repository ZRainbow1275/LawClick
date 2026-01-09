import { getMyApprovals } from "@/actions/approval-actions"
import { ApprovalsBoardClient } from "@/components/admin/ApprovalsBoardClient"

export const dynamic = "force-dynamic"

export default async function ApprovalsPage() {
    const [pendingResult, approvedResult, mineResult] = await Promise.all([
        getMyApprovals("pending"),
        getMyApprovals("approved"),
        getMyApprovals("mine"),
    ])

    const pending = pendingResult.success ? pendingResult.data : []
    const approved = approvedResult.success ? approvedResult.data : []
    const mine = mineResult.success ? mineResult.data : []

    return <ApprovalsBoardClient initialPending={pending} initialApproved={approved} initialMine={mine} />
}
