"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import ReactGridLayout, { WidthProvider, type Layout } from "react-grid-layout/legacy"
import { toast } from "sonner"
import { ExternalLink, GripVertical, Plus, RotateCcw, Save, Settings2, Trash2 } from "lucide-react"

import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/AlertDialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/DropdownMenu"
import { useSidebarOptional } from "@/components/ui/Sidebar"
import { cn } from "@/lib/utils"
import { buildSectionWorkspaceKey } from "@/lib/workspace-keys"
import { toGridLayoutItems, toReactGridLayoutLayout } from "@/lib/react-grid-layout"
import { useRglAutoResize } from "@/components/layout/use-rgl-auto-resize"
import {
    DEFAULT_SECTION_WORKSPACE_CONFIG_VERSION,
    type SectionWorkspaceConfig,
} from "@/lib/section-workspace"
import {
    getMySectionWorkspaceConfig,
    resetMySectionWorkspaceConfig,
    saveMySectionWorkspaceConfig,
} from "@/actions/section-layout"
import { useFloatStore } from "@/store/float-store"
import { useLegoBlockRegistryStore } from "@/store/lego-block-registry-store"   
import type { FloatingLegoBlockData } from "@/lib/ui/floating-windows"
import { buildFloatingLegoBlockWindowId, buildSectionBlockRegistryKey } from "@/lib/ui/floating-lego"
import {
    blocksEqual,
    buildFallbackSectionWorkspaceConfig,
    findFirstAvailableGridPosition,
    getMyLocalSectionWorkspaceConfig,
    hashWorkspaceKeyToClassSuffix,
    layoutItemKey,
    layoutEqual,
    resetMyLocalSectionWorkspaceConfig,
    saveMyLocalSectionWorkspaceConfig,
} from "@/components/layout/section-workspace-utils"

const RGL = WidthProvider(ReactGridLayout)

export type SectionBlockDefaultSize = {
    w: number
    h: number
    minW: number
    minH: number
    maxW?: number
    maxH?: number
}

export type SectionCatalogItem = {
    id: string
    title: string
    pinned?: boolean
    defaultSize?: SectionBlockDefaultSize
    content: React.ReactNode
    chrome?: "card" | "none"
    cardClassName?: string
    headerClassName?: string
    contentClassName?: string
}

function SectionWorkspaceUrlFocusBridge({
    enabled,
    sectionId,
    entityId,
    onFocus,
}: {
    enabled: boolean
    sectionId: string
    entityId: string | null
    onFocus: (blockId: string) => void
}) {
    const searchParams = useSearchParams()

    useEffect(() => {
        if (!enabled) return
        const focusBlockIdParam = searchParams.get("lcFocusBlockId")
        if (!focusBlockIdParam) return

        const focusSectionId = searchParams.get("lcFocusSectionId") || ""
        const focusEntityId = searchParams.get("lcFocusEntityId") || ""
        if (focusSectionId && focusSectionId !== sectionId) return
        if ((entityId ?? "") !== focusEntityId) return

        onFocus(focusBlockIdParam)
    }, [enabled, entityId, onFocus, sectionId, searchParams])

    return null
}

export function SectionWorkspace({
    title,
    sectionId = "main",
    entityId,
    catalog,
    className,
    rowHeight = 34,
    margin = [16, 16],
    headerVariant = "full",
    storage = "db",
    autoSave = true,
    autoSaveDebounceMs = 1200,
}: {
    title?: string
    sectionId?: string
    entityId?: string | null
    catalog: SectionCatalogItem[]
    className?: string
    rowHeight?: number
    margin?: [number, number]
    headerVariant?: "full" | "compact"
    storage?: "db" | "local"
    autoSave?: boolean
    autoSaveDebounceMs?: number
}) {
    const pathname = usePathname()
    const workspaceKey = useMemo(
        () => buildSectionWorkspaceKey(pathname || "/", { sectionId, entityId }),
        [pathname, sectionId, entityId]
    )
    const dragHandleClass = useMemo(
        () => `section-widget-drag-handle--${hashWorkspaceKeyToClassSuffix(workspaceKey)}`,
        [workspaceKey]
    )

    const { openWindow } = useFloatStore()
    const registerLegoBlock = useLegoBlockRegistryStore((state) => state.register)
    const unregisterLegoBlock = useLegoBlockRegistryStore((state) => state.unregister)

    const catalogById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog])

    const [loading, setLoading] = useState(true)
    const [initialConfig, setInitialConfig] = useState<SectionWorkspaceConfig | null>(null)
    const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
    const [lastSaveError, setLastSaveError] = useState<string | null>(null)
    const autoSaveTimerRef = useRef<number | null>(null)
    const autoSaveScheduledKeyRef = useRef<string | null>(null)
    const autoSaveAttemptedKeyRef = useRef<string | null>(null)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setInitialConfig(null)

        const loadPromise =
            storage === "local"
                ? getMyLocalSectionWorkspaceConfig(workspaceKey)
                : getMySectionWorkspaceConfig(workspaceKey)
        loadPromise
            .then((res) => {
                if (cancelled) return
                if (!res.success) {
                    toast.error("加载布局失败", { description: res.error })
                }
                setInitialConfig(res.data)
            })
            .catch(() => {
                if (cancelled) return
                toast.error("加载布局失败")
            })
            .finally(() => {
                if (cancelled) return
                setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [storage, workspaceKey])

    const sanitizedInitial = useMemo(() => {
        const allowedIds = new Set(catalog.map((c) => c.id))
        const pinned = catalog.filter((c) => c.pinned).map((c) => c.id)

        const config = initialConfig ?? buildFallbackSectionWorkspaceConfig()

        const hasAnyBlocks = (config.blocks || []).some((b) => allowedIds.has(b.id))
        const baseBlocks = hasAnyBlocks ? config.blocks : catalog.map((c) => ({ id: c.id }))

        const blocks = (baseBlocks || []).filter((b) => allowedIds.has(b.id))
        const dedup = Array.from(new Map(blocks.map((b) => [b.id, b])).values())

        const blockIds = new Set(dedup.map((b) => b.id))
        for (const pid of pinned) {
            if (!blockIds.has(pid)) {
                dedup.unshift({ id: pid })
                blockIds.add(pid)
            }
        }

        const layout = toReactGridLayoutLayout((config.layout || []).filter((l) => blockIds.has(l.i)))

        const itemsById = new Map(layout.map((l) => [l.i, l]))
        const normalizedLayout: Layout[number][] = [...layout]
        for (const blockId of dedup.map((b) => b.id)) {
            if (itemsById.has(blockId)) continue
            const meta = catalogById.get(blockId)
            const size = meta?.defaultSize || { w: 12, h: 8, minW: 6, minH: 4 }
            const safeW = Math.max(1, Math.min(12, size.w))
            const safeH = Math.max(1, size.h)
            const safeMinW = Math.max(1, Math.min(safeW, size.minW))
            const safeMinH = Math.max(1, Math.min(safeH, size.minH))
            const safeMaxW = size.maxW === undefined ? undefined : Math.max(safeW, Math.min(12, size.maxW))
            const safeMaxH = size.maxH === undefined ? undefined : Math.max(safeH, size.maxH)

            const pos = findFirstAvailableGridPosition(normalizedLayout, { w: safeW, h: safeH }, 12)
            const nextItem: Layout[number] = {
                i: blockId,
                x: pos.x,
                y: pos.y,
                w: safeW,
                h: safeH,
                minW: safeMinW,
                minH: safeMinH,
                maxW: safeMaxW,
                maxH: safeMaxH,
            }
            normalizedLayout.push(nextItem)
        }

        return { blocks: dedup, layout: normalizedLayout as Layout }
    }, [catalog, catalogById, initialConfig])

    const sidebar = useSidebarOptional()
    const sidebarState = sidebar?.state ?? "collapsed"
    const [isEditing, setIsEditing] = useState(false)
    const [exitConfirmOpen, setExitConfirmOpen] = useState(false)
    const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null)
    const [blocks, setBlocks] = useState(sanitizedInitial.blocks)
    const [layout, setLayout] = useState<Layout>(sanitizedInitial.layout)       
    const [saving, setSaving] = useState(false)
    const containerRef = useRef<HTMLDivElement | null>(null)

    useRglAutoResize(containerRef, sidebarState)

    const focusTimerRef = useRef<number | null>(null)
    const stableEntityId = entityId ? entityId : null

    const handleFocusFromUrl = useCallback((focusBlockId: string) => {
        if (focusTimerRef.current !== null) {
            window.clearTimeout(focusTimerRef.current)
            focusTimerRef.current = null
        }

        setFocusedBlockId(focusBlockId)
        const target = containerRef.current?.querySelector(
            `[data-section-block-id="${focusBlockId}"]`
        ) as HTMLElement | null
        target?.scrollIntoView({ block: "center", behavior: "smooth" })

        focusTimerRef.current = window.setTimeout(() => {
            setFocusedBlockId((current) => (current === focusBlockId ? null : current))
        }, 3500)
    }, [])

    useEffect(() => {
        return () => {
            if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current)
        }
    }, [])

    useEffect(() => {
        const baseOrigin = {
            kind: "SECTION_BLOCK" as const,
            pathname: pathname || "/",
            sectionId,
            entityId: entityId ? entityId : null,
            blockId: "",
        }
        const registeredKeys: string[] = []
        for (const item of catalog) {
            const key = buildSectionBlockRegistryKey(workspaceKey, item.id)
            registeredKeys.push(key)
            registerLegoBlock({
                key,
                title: item.title,
                content: item.content,
                origin: { ...baseOrigin, blockId: item.id },
            })
        }
        return () => {
            for (const key of registeredKeys) unregisterLegoBlock(key)
        }
    }, [
        catalog,
        entityId,
        pathname,
        registerLegoBlock,
        sectionId,
        unregisterLegoBlock,
        workspaceKey,
    ])

    useEffect(() => {
        if (isEditing) return
        setBlocks((prev) => (blocksEqual(prev, sanitizedInitial.blocks) ? prev : sanitizedInitial.blocks))
        setLayout((prev) => (layoutEqual(prev, sanitizedInitial.layout) ? prev : sanitizedInitial.layout))
    }, [isEditing, sanitizedInitial])

    const isDirty = useMemo(() => {
        if (!isEditing) return false
        return !blocksEqual(blocks, sanitizedInitial.blocks) || !layoutEqual(layout, sanitizedInitial.layout)
    }, [blocks, isEditing, layout, sanitizedInitial.blocks, sanitizedInitial.layout])

    const requestToggleEditing = () => {
        if (isEditing && isDirty) {
            setExitConfirmOpen(true)
            return
        }
        setIsEditing((v) => !v)
    }

    const discardChangesAndExit = () => {
        setBlocks(sanitizedInitial.blocks)
        setLayout(sanitizedInitial.layout)
        setExitConfirmOpen(false)
        setIsEditing(false)
    }

    const activeBlockIds = useMemo(() => new Set(blocks.map((b) => b.id)), [blocks])
    const availableToAdd = useMemo(
        () => catalog.filter((c) => !activeBlockIds.has(c.id) && !c.pinned),    
        [activeBlockIds, catalog]
    )

    const handleAddBlock = (id: string) => {
        const item = catalogById.get(id)
        if (!item) return
        if (activeBlockIds.has(id)) return

        const nextBlocks = [...blocks, { id }]
        const size = item.defaultSize || { w: 12, h: 8, minW: 6, minH: 4 }
        const position = findFirstAvailableGridPosition(
            layout,
            { w: size.w, h: size.h },
            12
        )
        const nextItem: Layout[number] = {
            i: id,
            x: position.x,
            y: position.y,
            w: size.w,
            h: size.h,
            minW: size.minW,
            minH: size.minH,
            maxW: size.maxW,
            maxH: size.maxH,
        }

        setBlocks(nextBlocks)
        setLayout((prev) => [...prev, nextItem])
        toast.success(autoSave ? "模块已添加（已开启自动保存）" : "模块已添加（记得保存布局）")
    }

    const handleRemoveBlock = (id: string) => {
        const item = catalogById.get(id)
        if (!item || item.pinned) return
        setBlocks((prev) => prev.filter((b) => b.id !== id))
        setLayout((prev) => prev.filter((l) => l.i !== id))
    }

    const openBlockInFloatingWindow = (blockId: string) => {
        if (isEditing) return
        const item = catalogById.get(blockId)
        if (!item) return

        const registryKey = buildSectionBlockRegistryKey(workspaceKey, blockId)
        const data = {
            kind: "SECTION_BLOCK",
            registryKey,
            origin: {
                pathname: pathname || "/",
                sectionId,
                entityId: entityId ? entityId : null,
                blockId,
            },
        } satisfies FloatingLegoBlockData

        openWindow(buildFloatingLegoBlockWindowId(registryKey), "LEGO_BLOCK", item.title, data)
    }

    type SaveConfigOptions = {
        exitEditing?: boolean
        toastOnSuccess?: boolean
        toastOnError?: boolean
    }

    const saveConfig = useCallback(
        async (options: SaveConfigOptions = {}) => {
            const exitEditing = options.exitEditing ?? false
            const toastOnSuccess = options.toastOnSuccess ?? false
            const toastOnError = options.toastOnError ?? false

            setSaving(true)
            try {
                const nextConfig: SectionWorkspaceConfig = {
                    configVersion: DEFAULT_SECTION_WORKSPACE_CONFIG_VERSION,
                    blocks,
                    layout: toGridLayoutItems(layout),
                }
                const res =
                    storage === "local"
                        ? await saveMyLocalSectionWorkspaceConfig({
                              workspaceKey,
                              config: nextConfig,
                          })
                        : await saveMySectionWorkspaceConfig({
                              workspaceKey,
                              config: nextConfig,
                          })
                if (!res.success) {
                    setLastSaveError(res.error || "保存失败")
                    if (toastOnError) toast.error("保存失败", { description: res.error })
                    return
                }

                setLastSavedAt(Date.now())
                setLastSaveError(null)
                if (toastOnSuccess) toast.success("布局已保存")
                setInitialConfig(nextConfig)
                if (exitEditing) setIsEditing(false)
            } catch {
                setLastSaveError("保存失败")
                if (toastOnError) toast.error("保存失败")
            } finally {
                setSaving(false)
            }
        },
        [blocks, layout, storage, workspaceKey]
    )

    const handleSaveNow = () => {
        void saveConfig({ toastOnSuccess: true, toastOnError: true })
    }

    const handleReset = async () => {
        try {
            const res =
                storage === "local"
                    ? await resetMyLocalSectionWorkspaceConfig(workspaceKey)
                    : await resetMySectionWorkspaceConfig(workspaceKey)
            if (!res.success) {
                toast.error("重置失败", { description: res.error })
                return
            }
            toast.success("已恢复默认布局")
            setIsEditing(false)
            setInitialConfig(buildFallbackSectionWorkspaceConfig())
        } catch {
            toast.error("重置失败")
        }
    }

    useEffect(() => {
        if (!autoSave || !isEditing || !isDirty || saving) {
            if (autoSaveTimerRef.current !== null) {
                window.clearTimeout(autoSaveTimerRef.current)
                autoSaveTimerRef.current = null
                autoSaveScheduledKeyRef.current = null
            }
            return
        }

        const blocksKey = blocks.map((b) => b.id).join("|")
        const layoutKey = layout.map(layoutItemKey).sort().join("|")
        const key = `${blocksKey}::${layoutKey}`

        if (autoSaveScheduledKeyRef.current === key) return
        if (autoSaveAttemptedKeyRef.current === key && lastSaveError) return

        if (autoSaveTimerRef.current !== null) {
            window.clearTimeout(autoSaveTimerRef.current)
            autoSaveTimerRef.current = null
        }

        autoSaveScheduledKeyRef.current = key
        autoSaveTimerRef.current = window.setTimeout(() => {
            autoSaveTimerRef.current = null
            autoSaveScheduledKeyRef.current = null
            autoSaveAttemptedKeyRef.current = key
            void saveConfig()
        }, Math.max(300, autoSaveDebounceMs))

        return () => {
            if (autoSaveTimerRef.current !== null) {
                window.clearTimeout(autoSaveTimerRef.current)
                autoSaveTimerRef.current = null
                autoSaveScheduledKeyRef.current = null
            }
        }
    }, [autoSave, autoSaveDebounceMs, blocks, isDirty, isEditing, lastSaveError, layout, saveConfig, saving])

    const gridItems = blocks
        .map((b) => {
            const item = catalogById.get(b.id)
            if (!item) return null
            const chrome = item.chrome ?? "card"
            const isFocused = focusedBlockId === b.id

            if (chrome === "none") {
                return (
                    <div key={b.id} className="h-full" data-section-block-id={b.id}>
                        <div
                            className={cn(
                                "relative h-full overflow-auto group",
                                isEditing && "ring-1 ring-primary/20 rounded-xl",
                                isFocused && "ring-2 ring-primary/40 rounded-xl"
                            )}
                        >
                            {!isEditing ? (
                                <div className="absolute bottom-2 right-2 z-10 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto">
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="在浮窗打开"
                                        className="h-7 w-7 bg-background/70 backdrop-blur hover:bg-accent/80"
                                        onClick={() => openBlockInFloatingWindow(b.id)}
                                        title="在浮窗打开"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                    </Button>
                                </div>
                            ) : null}
                            {isEditing ? (
                                <div className="absolute top-2 left-2 z-10 flex items-center gap-2 rounded-md border bg-background/80 backdrop-blur px-2 py-1"> 
                                    <GripVertical
                                        className={cn(
                                            "h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing",
                                            "section-widget-drag-handle",
                                            dragHandleClass
                                        )}
                                    />
                                    <span className="text-xs font-medium truncate max-w-[180px]">{item.title}</span>
                                    {!item.pinned ? (
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label="移除模块"
                                            className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() => handleRemoveBlock(b.id)}
                                            title="移除模块"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    ) : null}
                                </div>
                            ) : null}
                            <div className="h-full">{item.content}</div>
                        </div>
                    </div>
                )
            }

            return (
                <div key={b.id} className="h-full" data-section-block-id={b.id}>
                    <Card
                        className={cn(
                            "h-full flex flex-col overflow-hidden gap-0 group",
                            isEditing && "ring-1 ring-primary/20",
                            isFocused && "ring-2 ring-primary/40",
                            item.cardClassName
                        )}
                    >
                        <div
                            className={cn(
                                "flex items-center justify-between border-b border-border/60 bg-muted/20 px-[var(--lc-card-padding)] py-3",
                                item.headerClassName
                            )}
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <GripVertical
                                    className={cn(
                                        "h-4 w-4 text-muted-foreground transition-opacity",
                                        isEditing
                                            ? "cursor-grab active:cursor-grabbing"
                                            : "opacity-0 group-hover:opacity-100",
                                        "section-widget-drag-handle",
                                        dragHandleClass
                                    )}
                                />
                                <span className="text-sm font-medium truncate">{item.title}</span>
                            </div>
                            {!isEditing ? (
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="在浮窗打开"
                                    className="h-7 w-7 hover:bg-accent/80"
                                    onClick={() => openBlockInFloatingWindow(b.id)}
                                    title="在浮窗打开"
                                >
                                    <ExternalLink className="h-4 w-4" />
                                </Button>
                            ) : null}
                            {isEditing && !item.pinned ? (
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="移除模块"
                                    className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => handleRemoveBlock(b.id)}
                                    title="移除模块"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            ) : null}
                        </div>
                        <div
                            className={cn("flex-1 min-h-0 overflow-auto p-[var(--lc-card-padding)]", item.contentClassName)}
                        >
                            {item.content}
                        </div>
                    </Card>
                </div>
            )
        })
        .filter((item): item is React.ReactElement => item !== null)

    return (
        <div
            ref={containerRef}
            className={cn(headerVariant === "compact" ? "space-y-2" : "space-y-3", className)}
        >
            <Suspense fallback={null}>
                <SectionWorkspaceUrlFocusBridge
                    enabled={!isEditing}
                    sectionId={sectionId}
                    entityId={stableEntityId}
                    onFocus={handleFocusFromUrl}
                />
            </Suspense>
            <AlertDialog open={exitConfirmOpen} onOpenChange={setExitConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>保存布局变更？</AlertDialogTitle>     
                        <AlertDialogDescription>
                            检测到未保存的布局调整。你可以保存并退出编辑，也可以放弃本次修改。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={saving}>继续编辑</AlertDialogCancel>
                        <Button type="button" variant="outline" onClick={discardChangesAndExit} disabled={saving}>
                            放弃修改
                        </Button>
                        <AlertDialogAction
                            disabled={saving}
                            onClick={async () => {
                                await saveConfig({ exitEditing: true, toastOnSuccess: true, toastOnError: true })
                            }}
                        >
                            保存并退出
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    {title ? <h2 className="text-sm font-medium truncate">{title}</h2> : null}
                    {headerVariant === "full" ? (
                        <div className="text-xs text-muted-foreground truncate">
                            可拖拽/缩放模块，布局
                            {storage === "local" ? "在本设备记忆" : "跨设备记忆"}，
                            可随时恢复默认
                        </div>
                    ) : null}
                </div>
                <div className="flex items-center gap-2">
                    {headerVariant === "compact" ? (
                        <Button
                            variant={isEditing ? "default" : "ghost"}
                            size="icon-sm"
                            onClick={requestToggleEditing}
                            disabled={loading}
                            title={`调整本区块布局（${storage === "local" ? "本设备记忆" : "跨设备记忆"}）`}
                        >
                            <Settings2 className="h-4 w-4" />
                        </Button>
                    ) : (
                        <Button
                            variant={isEditing ? "default" : "outline"}
                            onClick={requestToggleEditing}
                            disabled={loading}
                            title={`调整本区块布局（${storage === "local" ? "本设备记忆" : "跨设备记忆"}）`}
                        >
                            <Settings2 className="h-4 w-4 mr-2" />
                            {isEditing ? "退出编辑" : "编辑布局"}
                        </Button>
                    )}
                    {isEditing ? (
                        <>
                            <div className="hidden md:block text-xs text-muted-foreground truncate max-w-[260px]">
                                {saving
                                    ? "保存中…"
                                    : lastSaveError
                                      ? `自动保存失败：${lastSaveError}`
                                      : isDirty
                                        ? "未保存"
                                        : lastSavedAt
                                          ? `已保存 ${new Date(lastSavedAt).toLocaleTimeString("zh-CN", {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}`
                                          : ""}
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    {headerVariant === "compact" ? (
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            disabled={!availableToAdd.length}
                                            title="添加模块"
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    ) : (
                                        <Button variant="outline" disabled={!availableToAdd.length}>
                                            <Plus className="h-4 w-4 mr-2" />
                                            添加模块
                                        </Button>
                                    )}
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                    {availableToAdd.length ? (
                                        availableToAdd.map((item) => (
                                            <DropdownMenuItem key={item.id} onClick={() => handleAddBlock(item.id)}>
                                                {item.title}
                                            </DropdownMenuItem>
                                        ))
                                    ) : (
                                        <DropdownMenuItem disabled>暂无可添加模块</DropdownMenuItem>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            {headerVariant === "compact" ? (
                                <>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={handleSaveNow}
                                        disabled={saving}
                                        title={saving ? "保存中..." : "保存"}
                                    >
                                        <Save className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={handleReset}
                                        disabled={saving}
                                        title="恢复默认"
                                    >
                                        <RotateCcw className="h-4 w-4" />
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button onClick={handleSaveNow} disabled={saving}>
                                        <Save className="h-4 w-4 mr-2" />
                                        {saving ? "保存中..." : "保存"}
                                    </Button>
                                    <Button variant="outline" onClick={handleReset} disabled={saving}>
                                        恢复默认
                                    </Button>
                                </>
                            )}
                        </>
                    ) : null}
                </div>
            </div>

            <RGL
                layout={layout}
                cols={12}
                rowHeight={rowHeight}
                margin={margin}
                containerPadding={[0, 0]}
                isDraggable={isEditing}
                isResizable={isEditing}
                draggableHandle={`.${dragHandleClass}`}
                resizeHandles={["se", "s", "e"]}
                onLayoutChange={(next) => setLayout(next)}
            >
                {gridItems}
            </RGL>
        </div>
    )
}
