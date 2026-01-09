"use client"

import * as React from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { aiGenerateDocumentDraft } from "@/actions/ai-actions"
import { getAiCaseOptions } from "@/actions/ai-case-options"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { ScrollArea } from "@/components/ui/ScrollArea"
import { Textarea } from "@/components/ui/Textarea"
import { usePermission } from "@/hooks/use-permission"
import { cn } from "@/lib/utils"

type CaseOption = Awaited<ReturnType<typeof getAiCaseOptions>>["data"][number]

export function AiDraftGeneratorPanel() {
    const tWidgets = useTranslations("ai.widgets")
    const tDraft = useTranslations("ai.draft")
    const tToast = useTranslations("ai.toast")
    const { can } = usePermission()

    const canViewCases = can("case:view")

    const [query, setQuery] = React.useState("")
    const [loadingCases, setLoadingCases] = React.useState(false)
    const [cases, setCases] = React.useState<CaseOption[]>([])
    const [caseId, setCaseId] = React.useState<string>("")

    const [title, setTitle] = React.useState("")
    const [instructions, setInstructions] = React.useState("")
    const [generating, setGenerating] = React.useState(false)
    const [documentId, setDocumentId] = React.useState<string | null>(null)

    const seqRef = React.useRef(0)

    const loadCases = React.useCallback(
        async (nextQuery: string) => {
            setLoadingCases(true)
            try {
                const res = await getAiCaseOptions({ query: nextQuery || undefined, take: 60 })
                if (!res.success) {
                    toast.error(tToast("caseOptionsLoadFailed"), { description: res.error })
                    setCases([])
                    return
                }
                setCases(res.data)
                if (!caseId && res.data[0]?.id) setCaseId(res.data[0].id)
            } catch {
                toast.error(tToast("caseOptionsLoadFailed"))
                setCases([])
            } finally {
                setLoadingCases(false)
            }
        },
        [caseId, tToast]
    )

    React.useEffect(() => {
        if (!canViewCases) return
        const seq = ++seqRef.current
        const timer = setTimeout(() => {
            void (async () => {
                if (seq !== seqRef.current) return
                await loadCases(query.trim())
            })()
        }, 250)
        return () => clearTimeout(timer)
    }, [canViewCases, loadCases, query])

    const handleGenerate = async () => {
        if (!caseId) {
            toast.error(tToast("selectCaseRequired"))
            return
        }
        const trimmed = instructions.trim()
        if (!trimmed) {
            toast.error(tToast("instructionsRequired"))
            return
        }

        setGenerating(true)
        setDocumentId(null)
        try {
            const res = await aiGenerateDocumentDraft({
                caseId,
                title: title.trim() || undefined,
                instructions: trimmed,
            })
            if (!res.success) {
                toast.error(tToast("draftGenerateFailed"), { description: res.error })
                return
            }
            setDocumentId(res.data.documentId)
            toast.success(tToast("draftGenerated"), {
                description: tToast("draftGeneratedDescription", { documentId: res.data.documentId }),
            })
        } catch {
            toast.error(tToast("draftGenerateFailed"))
        } finally {
            setGenerating(false)
        }
    }

    if (!canViewCases) {
        return (
            <div className="rounded-lg border bg-card/60 p-4 text-sm text-muted-foreground">
                <div className="font-medium mb-1">{tWidgets("draft")}</div>
                <div>{tDraft("noCasePermission")}</div>
            </div>
        )
    }

    const selected = cases.find((c) => c.id === caseId) || null

    return (
        <div className="rounded-lg border bg-card/60 h-full flex flex-col overflow-hidden">
            <div className="p-3 border-b bg-muted/20">
                <div className="text-sm font-semibold">{tWidgets("draft")}</div>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                    <div className="space-y-2">
                        <Label>{tDraft("case")}</Label>
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={tDraft("caseSearch")}
                            disabled={loadingCases}
                        />
                        <div className="grid gap-2">
                            {loadingCases ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {tDraft("caseSelect")}
                                </div>
                            ) : null}

                            <div className="max-h-48 overflow-auto rounded-md border bg-background/60">
                                {cases.length === 0 ? (
                                    <div className="p-3 text-sm text-muted-foreground">{tDraft("caseSelect")}</div>
                                ) : (
                                    <div className="divide-y">
                                        {cases.map((c) => (
                                            <button
                                                key={c.id}
                                                type="button"
                                                className={cn(
                                                    "w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors",
                                                    c.id === caseId && "bg-primary/5"
                                                )}
                                                onClick={() => setCaseId(c.id)}
                                            >
                                                <div className="text-sm font-medium truncate">
                                                    {c.caseCode ? `#${c.caseCode} ` : ""}
                                                    {c.title}
                                                </div>
                                                <div className="text-xs text-muted-foreground truncate">
                                                    {c.serviceType} · {c.status}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        {selected ? (
                            <div className="text-xs text-muted-foreground">
                                {selected.caseCode ? `#${selected.caseCode} ` : ""}
                                {selected.title}
                            </div>
                        ) : null}
                    </div>

                    <div className="space-y-2">
                        <Label>{tDraft("titleOptional")}</Label>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                    </div>

                    <div className="space-y-2">
                        <Label>{tDraft("instructions")}</Label>
                        <Textarea
                            value={instructions}
                            onChange={(e) => setInstructions(e.target.value)}
                            rows={10}
                            className="resize-none"
                        />
                    </div>

                    {documentId ? (
                        <div className="rounded-md border bg-emerald-50/30 p-3 text-sm">
                            <div className="font-medium">{tDraft("generated")}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{documentId}</div>
                            <div className="mt-2">
                                <Link href={`/documents/${documentId}`} className="text-primary underline">
                                    {tDraft("openDocument")}
                                </Link>
                            </div>
                        </div>
                    ) : null}
                </div>
            </ScrollArea>

            <div className="p-3 border-t bg-background/60 flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground truncate">
                    {selected ? (selected.caseCode ? `#${selected.caseCode} ` : "") + selected.title : ""}
                </div>
                <Button onClick={handleGenerate} disabled={generating || !instructions.trim() || !caseId}>
                    {generating ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {tDraft("generating")}
                        </>
                    ) : (
                        <>
                            <Sparkles className="h-4 w-4 mr-2" />
                            {tDraft("generate")}
                        </>
                    )}
                </Button>
            </div>
        </div>
    )
}
