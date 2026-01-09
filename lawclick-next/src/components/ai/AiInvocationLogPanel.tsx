"use client"

import * as React from "react"
import { z } from "zod"
import { useTranslations } from "next-intl"
import { Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { listAiInvocations } from "@/actions/ai-invocations"
import { useAiWorkspace } from "@/components/ai/AiWorkspaceProvider"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { ScrollArea } from "@/components/ui/ScrollArea"
import { Switch } from "@/components/ui/Switch"
import { cn } from "@/lib/utils"

type InvocationRow = Awaited<ReturnType<typeof listAiInvocations>>["data"][number]

const TokenUsageSchema = z
    .object({
        promptTokens: z.number().optional(),
        completionTokens: z.number().optional(),
        totalTokens: z.number().optional(),
    })
    .strict()

function parseTotalTokens(value: unknown): number | null {
    const parsed = TokenUsageSchema.safeParse(value)
    return parsed.success && typeof parsed.data.totalTokens === "number" ? parsed.data.totalTokens : null
}

function formatShortTime(iso: string): string {
    const d = new Date(iso)
    if (!Number.isFinite(d.getTime())) return ""
    return d.toLocaleString()
}

export function AiInvocationLogPanel() {
    const tWidgets = useTranslations("ai.widgets")
    const tInv = useTranslations("ai.invocations")
    const tStatus = useTranslations("ai.status")
    const tToast = useTranslations("ai.toast")
    const { selectedConversationId } = useAiWorkspace()

    const [filterByConversation, setFilterByConversation] = React.useState(true)
    const [loading, setLoading] = React.useState(false)
    const [rows, setRows] = React.useState<InvocationRow[]>([])

    const load = React.useCallback(async () => {
        setLoading(true)
        try {
            const res = await listAiInvocations({
                take: 60,
                conversationId: filterByConversation ? selectedConversationId || undefined : undefined,
            })
            if (!res.success) {
                toast.error(tToast("invocationsLoadFailed"), { description: res.error })
                setRows([])
                return
            }
            setRows(res.data)
        } catch {
            toast.error(tToast("invocationsLoadFailed"))
            setRows([])
        } finally {
            setLoading(false)
        }
    }, [filterByConversation, selectedConversationId, tToast])

    React.useEffect(() => {
        void load()
    }, [load])

    return (
        <div className="rounded-lg border bg-card/60 h-full flex flex-col overflow-hidden">
            <div className="p-3 border-b bg-muted/20 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">{tWidgets("invocations")}</div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch
                            checked={filterByConversation}
                            onCheckedChange={setFilterByConversation}
                            disabled={!selectedConversationId}
                        />
                        <span className={cn(!selectedConversationId && "opacity-60")}>
                            {tInv("filterByConversation")}
                        </span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {tInv("refresh")}
                    </Button>
                </div>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-3 space-y-2">
                    {loading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {tInv("refresh")}
                        </div>
                    ) : null}

                    {!loading && rows.length === 0 ? (
                        <div className="text-sm text-muted-foreground">{tInv("empty")}</div>
                    ) : null}

                    {rows.map((r) => {
                        const totalTokens = parseTotalTokens(r.tokenUsage)
                        return (
                            <div key={r.id} className="rounded-md border bg-background/60 p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <Badge
                                                variant={r.status === "SUCCESS" ? "secondary" : "outline"}
                                                className={cn(
                                                    "text-[11px]",
                                                    r.status === "ERROR" && "border-destructive/40 text-destructive"
                                                )}
                                            >
                                                {r.status}
                                            </Badge>
                                            <div className="text-xs text-muted-foreground">{r.type}</div>
                                        </div>
                                        <div className="mt-1 text-sm font-medium truncate">
                                            {r.provider} · {r.model}
                                        </div>
                                        {r.error ? (
                                            <div className="mt-1 text-xs text-destructive line-clamp-2">
                                                {r.error}
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground text-right shrink-0">
                                        <div>{formatShortTime(r.createdAt)}</div>
                                        {typeof totalTokens === "number" ? (
                                            <div className="mt-1">
                                                {tStatus("tokens")}: {totalTokens}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </ScrollArea>
        </div>
    )
}
