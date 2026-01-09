"use client"

import Link from "next/link"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"

type TenantInviteAction = {
    href: string
    label: string
    variant?: "default" | "secondary"
}

export function TenantInviteAcceptWorkspaceClient(props: {
    title: string
    message: string
    actions: TenantInviteAction[]
}) {
    const catalog: SectionCatalogItem[] = [
        {
            id: "invite_result",
            title: "处理结果",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 10, minW: 6, minH: 8 },
            content: (
                <div className="p-6">
                    <Card className="max-w-xl mx-auto bg-card">
                        <CardHeader>
                            <CardTitle>{props.title}</CardTitle>
                            <CardDescription>租户邀请将切换你的工作区上下文。</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="text-sm text-muted-foreground whitespace-pre-wrap">{props.message}</div>
                            <div className="flex flex-wrap gap-2">
                                {props.actions.map((a) => (
                                    <Button
                                        key={a.href}
                                        asChild
                                        variant={a.variant === "secondary" ? "secondary" : "default"}
                                    >
                                        <Link href={a.href}>{a.label}</Link>
                                    </Button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ),
        },
        {
            id: "invite_help",
            title: "说明与注意",
            chrome: "none",
            defaultSize: { w: 12, h: 8, minW: 6, minH: 6 },
            content: (
                <div className="p-6">
                    <Card className="max-w-xl mx-auto bg-muted/10">
                        <CardHeader>
                            <CardTitle>说明与注意</CardTitle>
                            <CardDescription>确保租户切换行为可理解、可恢复。</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-muted-foreground">
                            <ul className="list-disc pl-5 space-y-2">
                                <li>接受邀请后，你的“当前工作区/租户上下文”会切换到邀请指向的机构。</li>
                                <li>若你不确定邀请来源，建议先与机构管理员确认，再进行操作。</li>
                                <li>如需恢复或切回其他机构，可前往“租户/机构”页面重新选择。</li>
                            </ul>
                            <div className="flex flex-wrap gap-2">
                                <Button asChild variant="secondary">
                                    <Link href="/tenants">前往租户/机构</Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ),
        },
    ]

    return (
        <SectionWorkspace
            title="租户邀请"
            sectionId="tenant_invite_accept"
            catalog={catalog}
            className="h-full"
            headerVariant="compact"
        />
    )
}
