"use client"

import { useMemo, useState } from "react"
import { Tag } from "lucide-react"

import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover"

export function AddTagPopover(props: {
    existingTags: string[]
    suggestions: string[]
    onAddTag: (tag: string) => Promise<void> | void
}) {
    const [draft, setDraft] = useState("")

    const available = useMemo(() => {
        const exists = new Set((props.existingTags || []).map((t) => t.trim()).filter(Boolean))
        const uniq = new Map<string, string>()
        for (const raw of props.suggestions || []) {
            const t = (raw || "").trim()
            if (!t) continue
            if (exists.has(t)) continue
            if (!uniq.has(t)) uniq.set(t, t)
        }
        return Array.from(uniq.values()).slice(0, 20)
    }, [props.existingTags, props.suggestions])

    const submit = async () => {
        const tag = draft.trim()
        if (!tag) return
        await props.onAddTag(tag)
        setDraft("")
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full mt-2 text-xs justify-start">
                    <Tag className="h-3 w-3 mr-1" />
                    添加标签
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72">
                <div className="space-y-3">
                    <div className="space-y-2">
                        <div className="text-sm font-medium">添加标签</div>
                        <div className="flex gap-2">
                            <Input
                                placeholder="输入新标签"
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault()
                                        void submit()
                                    }
                                }}
                            />
                            <Button onClick={() => void submit()} disabled={!draft.trim()}>
                                添加
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">建议标签（来自当前真实文档）</div>
                        <div className="flex flex-wrap gap-2">
                            {available.length ? (
                                available.map((tag) => (
                                    <Button
                                        key={tag}
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => {
                                            setDraft(tag)
                                            void props.onAddTag(tag)
                                        }}
                                    >
                                        {tag}
                                    </Button>
                                ))
                            ) : (
                                <div className="text-xs text-muted-foreground px-2 py-1">暂无可用建议标签</div>
                            )}
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}

