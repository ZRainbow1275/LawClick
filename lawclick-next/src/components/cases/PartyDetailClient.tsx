"use client"

import Link from "next/link"
import { ArrowLeft, Building2, Mail, Phone, User } from "lucide-react"
import type { Party, PartyRelation, PartyType } from "@/lib/prisma-browser"
import { PARTY_RELATION_LABELS, PARTY_TYPE_LABELS } from "@/lib/party-labels"
import { LegoDeck } from "@/components/layout/LegoDeck"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Separator } from "@/components/ui/Separator"

function getEntityLabel(entityType: Party["entityType"]) {
    if (entityType === "COMPANY") return "企业/机构"
    if (entityType === "INDIVIDUAL") return "自然人"
    return "-"
}

function safePartyTypeLabel(type: PartyType) {
    return PARTY_TYPE_LABELS[type] ?? String(type)
}

function safePartyRelationLabel(relation: PartyRelation) {
    return PARTY_RELATION_LABELS[relation] ?? String(relation)
}

export function PartyDetailClient(props: { party: Party }) {
    const { party } = props

    const header = (
        <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
                <Button asChild variant="ghost" size="sm" className="gap-2">
                    <Link href={`/cases/${party.caseId}?tab=parties`}>
                        <ArrowLeft className="h-4 w-4" />
                        返回案件当事人
                    </Link>
                </Button>
                <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">当事人详情</div>
                    <div className="text-lg font-semibold truncate">{party.name}</div>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <Badge variant="outline">{safePartyTypeLabel(party.type)}</Badge>
                <Badge variant="secondary">{safePartyRelationLabel(party.relation)}</Badge>
            </div>
        </div>
    )

    const basicInfo = (
        <Card className="bg-card">
            <CardHeader className="pb-3">
                <CardTitle className="text-base">基本信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-md border bg-card/50 px-3 py-2">
                    <span className="text-muted-foreground">主体类型</span>
                    <span className="flex items-center gap-2">
                        {party.entityType === "COMPANY" ? (
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                        ) : (
                            <User className="h-4 w-4 text-muted-foreground" />
                        )}
                        {getEntityLabel(party.entityType)}
                    </span>
                </div>
                <div className="flex flex-col gap-1 rounded-md border bg-card/50 px-3 py-2">
                    <span className="text-muted-foreground">关联案件</span>
                    <Link href={`/cases/${party.caseId}`} className="font-mono text-xs hover:underline">
                        {party.caseId}
                    </Link>
                </div>

                <Separator />

                <LegoDeck
                    title="字段布局（可拖拽）"
                    sectionId="party_basic_fields"
                    entityId={party.id}
                    rowHeight={22}
                    margin={[12, 12]}
                    catalog={[
                        {
                            id: "b_party_field_id_type",
                            title: "证件类型",
                            pinned: true,
                            chrome: "none",
                            defaultSize: { w: 6, h: 4, minW: 3, minH: 3 },
                            content: (
                                <div className="rounded-md border bg-card/50 px-3 py-2">
                                    <div className="text-xs text-muted-foreground">证件类型</div>
                                    <div className="text-sm">{party.idType || "-"}</div>
                                </div>
                            ),
                        },
                        {
                            id: "b_party_field_id_number",
                            title: "证件号码",
                            pinned: true,
                            chrome: "none",
                            defaultSize: { w: 6, h: 4, minW: 3, minH: 3 },
                            content: (
                                <div className="rounded-md border bg-card/50 px-3 py-2">
                                    <div className="text-xs text-muted-foreground">证件号码</div>
                                    <div className="text-sm">{party.idNumber || "-"}</div>
                                </div>
                            ),
                        },
                        {
                            id: "b_party_field_phone",
                            title: "电话",
                            pinned: true,
                            chrome: "none",
                            defaultSize: { w: 6, h: 4, minW: 3, minH: 3 },
                            content: (
                                <div className="rounded-md border bg-card/50 px-3 py-2">
                                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Phone className="h-3 w-3" />
                                        电话
                                    </div>
                                    <div className="text-sm">{party.phone || "-"}</div>
                                </div>
                            ),
                        },
                        {
                            id: "b_party_field_email",
                            title: "邮箱",
                            pinned: true,
                            chrome: "none",
                            defaultSize: { w: 6, h: 4, minW: 3, minH: 3 },
                            content: (
                                <div className="rounded-md border bg-card/50 px-3 py-2">
                                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Mail className="h-3 w-3" />
                                        邮箱
                                    </div>
                                    <div className="text-sm break-all">{party.email || "-"}</div>
                                </div>
                            ),
                        },
                        {
                            id: "b_party_field_address",
                            title: "地址",
                            pinned: true,
                            chrome: "none",
                            defaultSize: { w: 12, h: 5, minW: 6, minH: 4 },
                            content: (
                                <div className="rounded-md border bg-card/50 px-3 py-2">
                                    <div className="text-xs text-muted-foreground">地址</div>
                                    <div className="text-sm whitespace-pre-wrap">{party.address || "-"}</div>
                                </div>
                            ),
                        },
                    ]}
                />
            </CardContent>
        </Card>
    )

    const attorneyInfo = (
        <Card className="bg-card">
            <CardHeader className="pb-3">
                <CardTitle className="text-base">代理人信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <LegoDeck
                    title="字段布局（可拖拽）"
                    sectionId="party_attorney_fields"
                    entityId={party.id}
                    rowHeight={22}
                    margin={[12, 12]}
                    catalog={[
                        {
                            id: "b_party_field_attorney",
                            title: "代理人",
                            pinned: true,
                            chrome: "none",
                            defaultSize: { w: 6, h: 4, minW: 3, minH: 3 },
                            content: (
                                <div className="rounded-md border bg-card/50 px-3 py-2">
                                    <div className="text-xs text-muted-foreground">代理人</div>
                                    <div className="text-sm">{party.attorney || "-"}</div>
                                </div>
                            ),
                        },
                        {
                            id: "b_party_field_attorney_phone",
                            title: "代理人电话",
                            pinned: true,
                            chrome: "none",
                            defaultSize: { w: 6, h: 4, minW: 3, minH: 3 },
                            content: (
                                <div className="rounded-md border bg-card/50 px-3 py-2">
                                    <div className="text-xs text-muted-foreground">代理人电话</div>
                                    <div className="text-sm">{party.attorneyPhone || "-"}</div>
                                </div>
                            ),
                        },
                    ]}
                />
            </CardContent>
        </Card>
    )

    const notes = (
        <Card className="bg-card">
            <CardHeader className="pb-3">
                <CardTitle className="text-base">备注</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {party.notes || "暂无备注"}
                </div>
            </CardContent>
        </Card>
    )

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_party_header",
            title: "导航",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 4, minW: 8, minH: 3 },
            content: header,
        },
        {
            id: "b_party_basic",
            title: "基本信息",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 12, minW: 6, minH: 8 },
            content: basicInfo,
        },
        {
            id: "b_party_attorney",
            title: "代理人信息",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 7, minW: 6, minH: 6 },
            content: attorneyInfo,
        },
        {
            id: "b_party_notes",
            title: "备注",
            pinned: true,
            chrome: "none",
            defaultSize: { w: 12, h: 6, minW: 6, minH: 5 },
            content: notes,
        },
    ]

    return (
        <SectionWorkspace
            title="当事人详情"
            sectionId="party_detail"
            entityId={party.id}
            catalog={catalog}
            className="h-full"
        />
    )
}
