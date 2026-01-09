import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getAiStatus, listAiConversations } from "@/actions/ai-actions"
import { AiWorkspaceProvider } from "@/components/ai/AiWorkspaceProvider"
import { AiHeaderPanel } from "@/components/ai/AiHeaderPanel"
import { AiConversationListPanel } from "@/components/ai/AiConversationListPanel"
import { AiChatPanel } from "@/components/ai/AiChatPanel"
import { AiDraftGeneratorPanel } from "@/components/ai/AiDraftGeneratorPanel"
import { AiInvocationLogPanel } from "@/components/ai/AiInvocationLogPanel"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { AuthError, PermissionError, getActiveTenantContextWithPermissionOrThrow } from "@/lib/server-auth"

export const dynamic = "force-dynamic"

export default async function AiPage() {
    try {
        await getActiveTenantContextWithPermissionOrThrow("ai:use")
    } catch (error) {
        if (error instanceof AuthError) redirect("/auth/login")
        if (error instanceof PermissionError) {
            const tCommon = await getTranslations("common")
            return <div className="p-6 text-sm text-muted-foreground">{tCommon("noPermission")}</div>
        }
        throw error
    }

    const tPage = await getTranslations("ai.page")
    const tWidgets = await getTranslations("ai.widgets")

    const [statusRes, conversationsRes] = await Promise.all([
        getAiStatus(),
        listAiConversations({ take: 30 }),
    ])

    const initialStatus = statusRes.success ? statusRes.data : null
    const initialConversations = conversationsRes.success ? conversationsRes.data : []

    const catalog: SectionCatalogItem[] = [
        {
            id: "ai_header",
            title: tWidgets("header"),
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 5, minW: 8, minH: 4 },
            content: <AiHeaderPanel />,
        },
        {
            id: "ai_conversations",
            title: tWidgets("conversations"),
            pinned: true,
            chrome: "none",
            defaultSize: { w: 4, h: 16, minW: 3, minH: 10 },
            content: <AiConversationListPanel />,
        },
        {
            id: "ai_chat",
            title: tWidgets("chat"),
            pinned: true,
            chrome: "none",
            defaultSize: { w: 8, h: 16, minW: 5, minH: 10 },
            content: <AiChatPanel />,
        },
        {
            id: "ai_draft",
            title: tWidgets("draft"),
            chrome: "none",
            defaultSize: { w: 6, h: 16, minW: 4, minH: 10 },
            content: <AiDraftGeneratorPanel />,
        },
        {
            id: "ai_invocations",
            title: tWidgets("invocations"),
            chrome: "none",
            defaultSize: { w: 6, h: 16, minW: 4, minH: 10 },
            content: <AiInvocationLogPanel />,
        },
    ]

    return (
        <AiWorkspaceProvider initialStatus={initialStatus} initialConversations={initialConversations}>
            <SectionWorkspace title={tPage("title")} sectionId="ai" catalog={catalog} className="h-full" />
        </AiWorkspaceProvider>
    )
}
