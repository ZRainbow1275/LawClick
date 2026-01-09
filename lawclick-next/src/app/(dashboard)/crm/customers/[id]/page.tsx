import Link from "next/link"
import { notFound } from "next/navigation"
import {
    Building2,
    ChevronLeft,
    Clock,
    FileText,
    Mail,
    MapPin,
    Phone,
    Star,
    User,
} from "lucide-react"

import { getCustomerById, getServiceRecords, getTags } from "@/actions/customer-actions"
import { getTeamDirectory } from "@/actions/team-directory"
import { AddServiceRecordDialog } from "@/components/crm/AddServiceRecordDialog"
import { CreateCaseFromCustomerDialog } from "@/components/crm/CreateCaseFromCustomerDialog"
import { CustomerDeleteButton } from "@/components/crm/CustomerDeleteButton"
import { CustomerEditDialog } from "@/components/crm/CustomerEditDialog"
import { CustomerStageEditorClient } from "@/components/crm/CustomerStageEditorClient"
import { ManageCustomerTagsDialog } from "@/components/crm/ManageCustomerTagsDialog"
import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { getCustomerGradeMeta, getCustomerStageMeta } from "@/lib/crm/customer-meta"

export default async function CustomerDetailPage({
    params,
}: {
    params: Promise<{ id: string }>
}) {
    const { id } = await params

    const [result, tagsResult, teamResult] = await Promise.all([
        getCustomerById(id),
        getTags(),
        getTeamDirectory({ take: 300 }),
    ])

    if (!result.success || !result.data) {
        notFound()
    }

    const serviceRecordsResult = await getServiceRecords(id)

    const customer = result.data
    const stageConfig = getCustomerStageMeta(customer.stage)
    const gradeMeta = getCustomerGradeMeta(customer.grade)
    const allTags = tagsResult.success ? tagsResult.data : []
    const teamMembers = teamResult.success
        ? teamResult.data.map((u) => ({ id: u.id, name: u.name }))
        : []

    const catalog: SectionCatalogItem[] = [
        {
            id: "b_header",
            title: "客户与快捷入口",
            pinned: true,
            defaultSize: { w: 12, h: 4, minW: 8, minH: 3 },
            content: (
                <div className="flex items-center gap-4">
                    <Link href="/crm/customers">
                        <Button variant="ghost" size="icon">
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="text-2xl font-bold truncate">{customer.name}</div>
                            {customer.grade === "VIP" ? (
                                <Badge variant={gradeMeta.badgeVariant}>
                                    <Star className="h-3 w-3 mr-1" />
                                    {gradeMeta.label}
                                </Badge>
                            ) : null}
                            <Badge variant={stageConfig.badgeVariant}>{stageConfig.label}</Badge>
                        </div>
                        <p className="text-muted-foreground truncate">
                            {customer.type === "COMPANY" ? "企业客户" : "个人客户"} · 创建于{" "}
                            {new Date(customer.createdAt).toLocaleDateString("zh-CN")}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end">
                        <CreateCaseFromCustomerDialog
                            customerId={customer.id}
                            customerName={customer.name}
                        />
                        <CustomerEditDialog customer={customer} teamMembers={teamMembers} />
                        <CustomerDeleteButton customerId={customer.id} customerName={customer.name} />
                    </div>
                </div>
            ),
        },
        {
            id: "b_basic",
            title: "基本信息",
            defaultSize: { w: 6, h: 7, minW: 4, minH: 5 },
            content: (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {customer.type === "COMPANY" ? (
                            <Building2 className="h-4 w-4" />
                        ) : (
                            <User className="h-4 w-4" />
                        )}
                        <span>{customer.type === "COMPANY" ? "企业" : "个人"}</span>
                    </div>
                    {customer.email ? (
                        <div className="flex items-center gap-3">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span className="break-all">{customer.email}</span>
                        </div>
                    ) : null}
                    {customer.phone ? (
                        <div className="flex items-center gap-3">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span className="break-all">{customer.phone}</span>
                        </div>
                    ) : null}
                    {customer.address ? (
                        <div className="flex items-center gap-3">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span className="break-all">{customer.address}</span>
                        </div>
                    ) : null}
                    {customer.industry ? (
                        <div className="flex items-center gap-3">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="break-all">{customer.industry}</span>
                        </div>
                    ) : null}
                    {customer.source ? (
                        <div className="flex items-center gap-3">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="break-all">来源: {customer.source}</span>
                        </div>
                    ) : null}
                    {customer.email || customer.phone || customer.address || customer.industry || customer.source ? null : (
                        <div className="text-sm text-muted-foreground">暂无可展示信息</div>
                    )}
                </div>
            ),
        },
        {
            id: "b_tags",
            title: "标签",
            defaultSize: { w: 6, h: 6, minW: 4, minH: 4 },
            content: (
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground truncate">用于筛选与分层管理客户</div>
                        <ManageCustomerTagsDialog
                            customerId={customer.id}
                            currentTags={customer.tags || []}
                            allTags={allTags}
                        />
                    </div>
                    {customer.tags && customer.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {customer.tags.map((tag) => (
                                <Badge
                                    key={tag.id}
                                    variant="outline"
                                    style={{ borderColor: tag.color, color: tag.color }}
                                >
                                    {tag.name}
                                </Badge>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">暂无标签</p>
                    )}
                </div>
            ),
        },
        {
            id: "b_owner",
            title: "负责人",
            defaultSize: { w: 6, h: 6, minW: 4, minH: 4 },
            content: customer.assignee ? (
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <Avatar>
                            <AvatarImage src={customer.assignee.avatarUrl ?? undefined} />
                            <AvatarFallback>{customer.assignee.name?.[0]}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                            <p className="font-medium truncate">{customer.assignee.name}</p>
                            {customer.assignee.title ? (
                                <p className="text-sm text-muted-foreground truncate">
                                    {customer.assignee.title}
                                </p>
                            ) : null}
                        </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                        可在「编辑客户」中调整负责人
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">暂无负责人</p>
                    <div className="text-xs text-muted-foreground">
                        可在「编辑客户」中设置负责人
                    </div>
                </div>
            ),
        },
        {
            id: "b_stage",
            title: "阶段推进",
            defaultSize: { w: 6, h: 6, minW: 4, minH: 4 },
            content: <CustomerStageEditorClient customerId={customer.id} stage={customer.stage} />,
        },
        {
            id: "b_service_records",
            title: "服务记录",
            defaultSize: { w: 12, h: 10, minW: 6, minH: 7 },
            content: (
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
                            <Clock className="h-4 w-4" />
                            沟通要点、结论与后续动作
                        </div>
                        <AddServiceRecordDialog contactId={customer.id} />
                    </div>

                    {serviceRecordsResult.success && serviceRecordsResult.data.length > 0 ? (
                        <div className="space-y-4">
                            {serviceRecordsResult.data.map((record) => (
                                <div key={record.id} className="border-l-2 border-primary pl-4 pb-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline">{record.type}</Badge>
                                            {typeof record.satisfaction === "number" ? (
                                                <span className="text-sm text-muted-foreground">
                                                    满意度: {record.satisfaction}/5
                                                </span>
                                            ) : null}
                                        </div>
                                        <span className="text-sm text-muted-foreground">
                                            {new Date(record.serviceDate).toLocaleDateString("zh-CN")}
                                        </span>
                                    </div>
                                    <p className="mt-2 text-sm whitespace-pre-wrap">{record.content}</p>
                                    {record.nextAction ? (
                                        <p className="mt-2 text-sm text-primary">
                                            下一步: {record.nextAction}
                                        </p>
                                    ) : null}
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        by {record.lawyer?.name || "—"}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-muted-foreground">
                            {serviceRecordsResult.success
                                ? "暂无服务记录"
                                : `加载失败：${serviceRecordsResult.error || "未知错误"}`}
                        </div>
                    )}
                </div>
            ),
        },
        {
            id: "b_cases",
            title: "关联案件",
            defaultSize: { w: 12, h: 8, minW: 6, minH: 6 },
            content:
                customer.casesAsClient && customer.casesAsClient.length > 0 ? (
                    <div className="space-y-2">
                        {customer.casesAsClient.map((c) => (
                            <Link href={`/cases/${c.id}`} key={c.id}>
                                <div className="flex items-center justify-between gap-3 p-3 rounded-lg hover:bg-muted transition-colors">
                                    <div className="min-w-0">
                                        <p className="font-medium truncate">{c.title}</p>
                                        <p className="text-sm text-muted-foreground truncate">{c.caseCode}</p>
                                    </div>
                                    <Badge variant="outline" className="shrink-0">
                                        {c.status}
                                    </Badge>
                                </div>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8 text-muted-foreground">暂无关联案件</div>
                ),
        },
        ...(customer.notes
            ? ([
                  {
                      id: "b_notes",
                      title: "备注",
                      defaultSize: { w: 12, h: 6, minW: 6, minH: 4 },
                      content: <p className="text-sm whitespace-pre-wrap">{customer.notes}</p>,
                  },
              ] satisfies SectionCatalogItem[])
            : []),
    ]

    return (
        <SectionWorkspace
            title="客户详情"
            sectionId="crm_customer_detail"
            entityId={customer.id}
            catalog={catalog}
        />
    )
}
