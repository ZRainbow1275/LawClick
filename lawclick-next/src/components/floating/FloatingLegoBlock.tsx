"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/Button"
import { useLegoBlockRegistryStore } from "@/store/lego-block-registry-store"
import { FloatingLegoBlockDataSchema } from "@/lib/ui/floating-windows"

export function FloatingLegoBlock(props: { data: unknown }) {
    const router = useRouter()

    const parsed = React.useMemo(
        () => FloatingLegoBlockDataSchema.safeParse(props.data),
        [props.data]
    )

    const entry = useLegoBlockRegistryStore((state) => {
        if (!parsed.success) return null
        return state.entries[parsed.data.registryKey] || null
    })

    const originUrl = React.useMemo(() => {
        if (!parsed.success) return null
        const { kind, origin } = parsed.data
        const params = new URLSearchParams()
        if (kind === "SECTION_BLOCK") {
            params.set("lcFocusSectionId", origin.sectionId)
            if (origin.entityId) params.set("lcFocusEntityId", origin.entityId) 
            params.set("lcFocusBlockId", origin.blockId)
        } else if (kind === "PAGE_WIDGET") {
            params.set("lcFocusWidgetId", origin.widgetId)
        }
        return `${origin.pathname}?${params.toString()}`
    }, [parsed])

    if (!parsed.success) {
        return (
            <div className="space-y-3">
                <div className="text-sm font-medium">模块数据损坏或版本不兼容</div>
                <div className="text-sm text-muted-foreground">
                    该浮窗无法解析其来源信息。你可以关闭此浮窗后，从页面内重新打开。
                </div>
            </div>
        )
    }

    if (!entry) {
        return (
            <div className="space-y-3">
                <div className="text-sm font-medium">模块尚未就绪</div>
                <div className="text-sm text-muted-foreground">
                    该浮窗需要在“来源页面”加载后才能渲染内容（例如刷新后、或在其他页面直接恢复浮窗时）。
                </div>
                {originUrl ? (
                    <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => router.push(originUrl)}
                    >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        打开来源页面
                    </Button>
                ) : null}
            </div>
        )
    }

    return <div className="h-full min-h-0">{entry.content}</div>
}
