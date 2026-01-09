"use client"

import { useTranslations } from "next-intl"
import { RefreshCw } from "lucide-react"
import { useAiWorkspace } from "@/components/ai/AiWorkspaceProvider"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"

export function AiHeaderPanel() {
    const tPage = useTranslations("ai.page")
    const tStatus = useTranslations("ai.status")
    const tConversations = useTranslations("ai.conversations")
    const { status, statusLoading, refreshStatus, lastInvocationId, lastUsage } = useAiWorkspace()

    const configured = status?.configured ?? false

    return (
        <div className="rounded-lg border bg-card/60 p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-semibold">{tPage("title")}</h1>
                        <Badge variant={configured ? "secondary" : "outline"} className="text-xs">
                            {configured ? tStatus("configured") : tStatus("notConfigured")}
                        </Badge>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">{tPage("subtitle")}</div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void refreshStatus()}
                        disabled={statusLoading}
                        aria-label={tConversations("refresh")}
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {tConversations("refresh")}
                    </Button>
                </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-md border bg-background/60 p-3">
                    <div className="text-xs text-muted-foreground">{tStatus("provider")}</div>
                    <div className="mt-1 text-sm font-medium">{status?.provider || "-"}</div>
                </div>
                <div className="rounded-md border bg-background/60 p-3">
                    <div className="text-xs text-muted-foreground">{tStatus("model")}</div>
                    <div className="mt-1 text-sm font-medium">{status?.defaultModel || "-"}</div>
                </div>
                <div className="rounded-md border bg-background/60 p-3">
                    <div className="text-xs text-muted-foreground">{tStatus("lastInvocation")}</div>
                    <div className="mt-1 text-sm font-medium truncate">{lastInvocationId || "-"}</div>
                    {lastUsage?.totalTokens ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                            {tStatus("tokens")}: {lastUsage.totalTokens}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    )
}
