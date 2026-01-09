"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/AlertDialog"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs"
import { SectionWorkspace } from "@/components/layout/SectionWorkspace"
import { restoreRecycleBinItem, type RecycleBinSnapshot } from "@/actions/recycle-bin"

type RestoreTarget =
    | { type: "case"; id: string; code: string; title: string }
    | { type: "project"; id: string; code: string; title: string }
    | { type: "contract"; id: string; code: string; title: string }
    | { type: "contact"; id: string; code: string; title: string }

function formatDateTime(value: string) {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return value
    return d.toLocaleString("zh-CN")
}

function getTypeLabel(type: RestoreTarget["type"]) {
    if (type === "case") return "案件"
    if (type === "project") return "项目"
    if (type === "contract") return "合同"
    return "客户"
}

export function RecycleBinClient(props: { initial: RecycleBinSnapshot; initialError?: string | null }) {
    const { initial, initialError } = props
    const router = useRouter()

    const [tab, setTab] = React.useState<"cases" | "projects" | "contracts" | "contacts">("cases")
    const [query, setQuery] = React.useState("")
    const [restoreOpen, setRestoreOpen] = React.useState(false)
    const [restoreTarget, setRestoreTarget] = React.useState<RestoreTarget | null>(null)
    const [restoreConfirm, setRestoreConfirm] = React.useState("")
    const [restoring, setRestoring] = React.useState(false)

    const openRestore = (target: RestoreTarget) => {
        setRestoreTarget(target)
        setRestoreConfirm("")
        setRestoreOpen(true)
    }

    const handleRestore = async () => {
        if (!restoreTarget) return
        if (restoreConfirm.trim() !== restoreTarget.code) {
            toast.error("确认信息不匹配", { description: `请输入「${restoreTarget.code}」以确认恢复。` })
            return
        }

        setRestoring(true)
        try {
            const res = await restoreRecycleBinItem({ type: restoreTarget.type, id: restoreTarget.id })
            if (!res.success) {
                toast.error("恢复失败", { description: res.error })
                return
            }
            toast.success("已恢复", { description: `${getTypeLabel(restoreTarget.type)}：${restoreTarget.title}` })
            setRestoreOpen(false)
            setRestoreTarget(null)
            router.refresh()
        } catch {
            toast.error("恢复失败", { description: "操作失败，请稍后重试。" })
        } finally {
            setRestoring(false)
        }
    }

    const q = query.trim().toLowerCase()
    const filtered = React.useMemo(() => {
        const match = (code: string, title: string) => {
            if (!q) return true
            return `${code} ${title}`.toLowerCase().includes(q)
        }
        return {
            cases: initial.cases.filter((c) => match(c.caseCode, c.title)),
            projects: initial.projects.filter((p) => match(p.projectCode, p.title)),
            contracts: initial.contracts.filter((c) => match(c.contractNo, c.title)),
            contacts: initial.contacts.filter((c) => match(c.name, `${c.type} ${c.stage} ${c.grade}`)),
        }
    }, [initial.cases, initial.contracts, initial.projects, initial.contacts, q])

    return (
        <SectionWorkspace
            title="回收站"
            sectionId="admin_recycle_bin"
            className="h-full"
            catalog={[
                {
                    id: "b_recycle_header",
                    title: "概览",
                    pinned: true,
                    chrome: "none",
                    defaultSize: { w: 12, h: 12, minW: 8, minH: 10 },
                    content: (
                        <>
                            <AlertDialog
                open={restoreOpen}
                onOpenChange={(next) => {
                    setRestoreOpen(next)
                    if (!next) {
                        setRestoreTarget(null)
                        setRestoreConfirm("")
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认恢复？</AlertDialogTitle>
                        <AlertDialogDescription>
                            将把该{restoreTarget ? getTypeLabel(restoreTarget.type) : ""}恢复到默认视图（解除软删除标记）。为防止误操作，请输入确认信息。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {restoreTarget ? (
                        <div className="space-y-3">
                            <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                                <div className="font-medium truncate" title={restoreTarget.title}>
                                    {restoreTarget.title}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                    {getTypeLabel(restoreTarget.type)} · <span className="font-mono">{restoreTarget.code}</span>
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <div className="text-sm font-medium">确认信息</div>
                                <Input value={restoreConfirm} onChange={(e) => setRestoreConfirm(e.target.value)} placeholder={restoreTarget.code} />
                            </div>
                        </div>
                    ) : null}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={restoring}>取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleRestore}
                            disabled={restoring || !restoreTarget || restoreConfirm.trim() !== (restoreTarget?.code ?? "")}
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                            {restoring ? "恢复中..." : "确认恢复"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
                            <div className="space-y-6">
                                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div>
                    <div className="text-xs text-muted-foreground">行政中心 · 回收站</div>
                    <h1 className="text-xl font-semibold tracking-tight">软删除恢复</h1>
                    <p className="text-sm text-muted-foreground">用于恢复被软删除的案件、项目与合同（仅管理员可用）。</p>
                </div>
                <div className="flex items-center gap-2">
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索编号/标题..." className="w-64" />
                    <Button variant="outline" onClick={() => router.refresh()}>
                        刷新
                    </Button>
                </div>
            </div>

            {initialError ? (
                <Card className="border-destructive/20 bg-destructive/5">
                    <CardContent className="py-3 text-sm text-destructive flex items-center justify-between gap-3">
                        <div>加载失败：{initialError}</div>
                        <Button variant="outline" onClick={() => router.refresh()}>
                            刷新重试
                        </Button>
                    </CardContent>
                </Card>
            ) : null}
                            </div>
                        </>
                    ),
                },
                {
                    id: "b_recycle_main",
                    title: "已删除记录",
                    pinned: true,
                    chrome: "none",
                    defaultSize: { w: 12, h: 20, minW: 8, minH: 12 },
                    content: (
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                <TabsList>
                    <TabsTrigger value="cases">案件（{initial.cases.length}）</TabsTrigger>
                    <TabsTrigger value="projects">项目（{initial.projects.length}）</TabsTrigger>
                    <TabsTrigger value="contacts">客户（{initial.contacts.length}）</TabsTrigger>
                    <TabsTrigger value="contracts">合同（{initial.contracts.length}）</TabsTrigger>
                </TabsList>

                <TabsContent value="cases" className="mt-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">已删除案件</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {filtered.cases.length === 0 ? (
                                <div className="text-sm text-muted-foreground">暂无记录</div>
                            ) : (
                                filtered.cases.map((c) => (
                                    <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="font-mono text-xs text-muted-foreground shrink-0">{c.caseCode}</span>
                                                <span className="font-medium truncate">{c.title}</span>
                                            </div>
                                            <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
                                                <Badge variant="outline" className="text-[10px]">
                                                    {c.status}
                                                </Badge>
                                                <span>删除于 {formatDateTime(c.deletedAt)}</span>
                                                <span>·</span>
                                                <span>操作者 {c.deletedBy?.name || c.deletedBy?.id || "未知"}</span>
                                            </div>
                                        </div>
                                        <Button onClick={() => openRestore({ type: "case", id: c.id, code: c.caseCode, title: c.title })}>
                                            恢复
                                        </Button>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="projects" className="mt-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">已删除项目</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {filtered.projects.length === 0 ? (
                                <div className="text-sm text-muted-foreground">暂无记录</div>
                            ) : (
                                filtered.projects.map((p) => (
                                    <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="font-mono text-xs text-muted-foreground shrink-0">{p.projectCode}</span>
                                                <span className="font-medium truncate">{p.title}</span>
                                            </div>
                                            <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
                                                <Badge variant="outline" className="text-[10px]">
                                                    {p.status}
                                                </Badge>
                                                <Badge variant="secondary" className="text-[10px]">
                                                    {p.type}
                                                </Badge>
                                                <span>删除于 {formatDateTime(p.deletedAt)}</span>
                                                <span>·</span>
                                                <span>操作者 {p.deletedBy?.name || p.deletedBy?.id || "未知"}</span>
                                            </div>
                                        </div>
                                        <Button onClick={() => openRestore({ type: "project", id: p.id, code: p.projectCode, title: p.title })}>
                                            恢复
                                        </Button>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="contacts" className="mt-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">已删除客户</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {filtered.contacts.length === 0 ? (
                                <div className="text-sm text-muted-foreground">暂无记录</div>
                            ) : (
                                filtered.contacts.map((c) => (
                                    <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="font-medium truncate">{c.name}</span>
                                            </div>
                                            <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
                                                <Badge variant="outline" className="text-[10px]">
                                                    {c.type}
                                                </Badge>
                                                <Badge variant="secondary" className="text-[10px]">
                                                    {c.stage}
                                                </Badge>
                                                <Badge variant="secondary" className="text-[10px]">
                                                    {c.grade}
                                                </Badge>
                                                <span>删除于 {formatDateTime(c.deletedAt)}</span>
                                                <span>·</span>
                                                <span>操作者 {c.deletedBy?.name || c.deletedBy?.id || "未知"}</span>
                                            </div>
                                        </div>
                                        <Button onClick={() => openRestore({ type: "contact", id: c.id, code: c.name, title: c.name })}>
                                            恢复
                                        </Button>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="contracts" className="mt-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">已删除合同</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {filtered.contracts.length === 0 ? (
                                <div className="text-sm text-muted-foreground">暂无记录</div>
                            ) : (
                                filtered.contracts.map((c) => (
                                    <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="font-mono text-xs text-muted-foreground shrink-0">{c.contractNo}</span>
                                                <span className="font-medium truncate">{c.title}</span>
                                            </div>
                                            <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
                                                <Badge variant="outline" className="text-[10px]">
                                                    {c.status}
                                                </Badge>
                                                {c.case ? (
                                                    <Badge variant="secondary" className="text-[10px]">
                                                        {c.case.caseCode}
                                                    </Badge>
                                                ) : null}
                                                <span>删除于 {formatDateTime(c.deletedAt)}</span>
                                                <span>·</span>
                                                <span>操作者 {c.deletedBy?.name || c.deletedBy?.id || "未知"}</span>
                                            </div>
                                        </div>
                                        <Button onClick={() => openRestore({ type: "contract", id: c.id, code: c.contractNo, title: c.title })}>
                                            恢复
                                        </Button>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
                    ),
                },
            ]}
        />
    )
}
