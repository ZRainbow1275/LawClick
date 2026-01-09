import { AuthWorkspaceShell } from "@/components/auth/AuthWorkspaceShell"
import { FloatingLayer } from "@/components/layout/FloatingLayer"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <AuthWorkspaceShell>{children}</AuthWorkspaceShell>
            <FloatingLayer allowedTypes={["LEGO_BLOCK"]} />
        </>
    )
}
