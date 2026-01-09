"use client"

import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { DocumentTemplatesClient } from "@/components/admin/DocumentTemplatesClient"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import type { DocumentTemplateListItem } from "@/lib/templates/types"

export function DocumentTemplatesWorkspaceClient(props: { initialTemplates: DocumentTemplateListItem[] }) {
    const catalog: SectionCatalogItem[] = [
        {
            id: "templates_main",
            title: "模板管理",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 18, minW: 8, minH: 12 },
            content: <DocumentTemplatesClient initialTemplates={props.initialTemplates} />,
        },
        {
            id: "templates_help",
            title: "变量与规则",
            chrome: "none",
            defaultSize: { w: 12, h: 10, minW: 6, minH: 6 },
            content: (
                <Card className="h-full">
                    <CardHeader>
                        <CardTitle>变量与规则</CardTitle>
                        <CardDescription>
                            占位符格式：<code>{"{{VAR_KEY}}"}</code>；变量 key 仅允许字母/数字/下划线。模板代码允许 A-Z/0-9/下划线/连字符(-)。
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                        <div className="rounded-md border bg-muted/20 p-3">
                            <div className="font-medium">内置变量</div>
                            <div className="mt-1 text-xs text-muted-foreground">系统会在起草时注入常用字段。</div>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                <code className="px-1 py-0.5 rounded bg-muted">{"{{date}}"}</code>
                            </div>
                        </div>
                        <div className="rounded-md border bg-muted/20 p-3">
                            <div className="font-medium">建议实践</div>
                            <ul className="mt-2 list-disc pl-5 text-muted-foreground">
                                <li>模板变量必须在“变量定义”中声明，否则起草时应拒绝生成。</li>
                                <li>模板内容建议拆段落，便于后续版本演进与差异对比。</li>
                                <li>涉及敏感信息时应搭配文档权限与保密标记使用。</li>
                            </ul>
                        </div>
                    </CardContent>
                </Card>
            ),
        },
    ]

    return (
        <SectionWorkspace
            title="文书模板"
            sectionId="admin_document_templates"
            catalog={catalog}
            className="h-full"
        />
    )
}
