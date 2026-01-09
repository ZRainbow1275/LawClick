"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { RefreshCcw, Save, Trash2 } from "lucide-react"

import { getMyWorkspaceNote, resetMyWorkspaceNote, saveMyWorkspaceNote } from "@/actions/workspace-notes"
import { Button } from "@/components/ui/Button"
import { Textarea } from "@/components/ui/Textarea"
import { buildPageWorkspaceKey } from "@/lib/workspace-keys"

function safeDateTime(value: string | null) {
    if (!value) return "—"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "—"
    return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export function WorkspaceNotesWidgetClient() {
    const pathname = usePathname()
    const workspaceKey = React.useMemo(() => buildPageWorkspaceKey(pathname || "/"), [pathname])

    const [loading, setLoading] = React.useState(true)
    const [saving, setSaving] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [content, setContent] = React.useState("")
    const [updatedAt, setUpdatedAt] = React.useState<string | null>(null)

    const savedContentRef = React.useRef("")
    const dirty = content !== savedContentRef.current

    const load = React.useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await getMyWorkspaceNote(workspaceKey)
            if (!res.success) {
                setError(res.error || "加载失败")
            }
            const next = res.data?.content ?? ""
            savedContentRef.current = next
            setContent(next)
            setUpdatedAt(res.data?.updatedAt ?? null)
        } catch (e) {
            setError(e instanceof Error ? e.message : "加载失败")
        } finally {
            setLoading(false)
        }
    }, [workspaceKey])

    React.useEffect(() => {
        void load()
    }, [load])

    const save = React.useCallback(async () => {
        if (!dirty || saving) return
        setSaving(true)
        setError(null)
        try {
            const res = await saveMyWorkspaceNote({ workspaceKey, content })
            if (!res.success) {
                setError(res.error || "保存失败")
                return
            }
            savedContentRef.current = res.data.content
            setContent(res.data.content)
            setUpdatedAt(res.data.updatedAt)
        } catch (e) {
            setError(e instanceof Error ? e.message : "保存失败")
        } finally {
            setSaving(false)
        }
    }, [content, dirty, saving, workspaceKey])

    React.useEffect(() => {
        if (loading) return
        if (!dirty) return
        const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
            void save()
        }, 900)
        return () => clearTimeout(timer)
    }, [dirty, loading, save])

    const reset = React.useCallback(async () => {
        setSaving(true)
        setError(null)
        try {
            const res = await resetMyWorkspaceNote(workspaceKey)
            if (!res.success) {
                setError(res.error || "重置失败")
                return
            }
            savedContentRef.current = res.data.content
            setContent(res.data.content)
            setUpdatedAt(res.data.updatedAt)
        } catch (e) {
            setError(e instanceof Error ? e.message : "重置失败")
        } finally {
            setSaving(false)
        }
    }, [workspaceKey])

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-sm font-medium truncate">工作台便签</div>
                    <div className="text-xs text-muted-foreground truncate">
                        仅自己可见；跨设备保存；支持恢复空白（按页面/实体记忆）
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7"
                        onClick={() => void load()}
                        disabled={loading || saving}
                        title="刷新"
                    >
                        <RefreshCcw className="h-4 w-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void save()}
                        disabled={loading || saving || !dirty}
                    >
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? "保存中..." : dirty ? "保存" : "已保存"}
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => void reset()} disabled={loading || saving} title="恢复空白">
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="写点什么吧…（例如：今日优先事项、关键联系人、案件要点、会议纪要）"
                className="min-h-[180px]"
                disabled={loading}
            />

            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <div className="min-w-0 truncate">
                    {error ? (
                        <span className="text-destructive">错误：{error}</span>
                    ) : loading ? (
                        <span>加载中...</span>
                    ) : dirty ? (
                        <span>未保存</span>
                    ) : (
                        <span>已保存 · {safeDateTime(updatedAt)}</span>
                    )}
                </div>
                <div className="shrink-0">{content.length}/20000</div>
            </div>
        </div>
    )
}

