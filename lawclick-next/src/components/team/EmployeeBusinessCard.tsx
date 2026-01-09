"use client"

import * as React from "react"
import { toast } from "sonner"
import Link from "next/link"
import type { Role } from "@/lib/prisma-browser"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Card, CardContent } from "@/components/ui/Card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/Avatar"
import { ROLE_DISPLAY_NAMES } from "@/lib/permissions"
import { Copy, Download, ExternalLink } from "lucide-react"

export type EmployeeBusinessCardUser = {
    id: string
    name: string | null
    email: string
    role: Role
    avatarUrl?: string | null
    department?: string | null
    title?: string | null
    phone?: string | null
    employeeNo?: string | null
}

export function EmployeeBusinessCard(props: {
    user: EmployeeBusinessCardUser
    organizationName?: string | null
    cardHref?: string
    showCopyLink?: boolean
    showVCardDownload?: boolean
    extraActions?: React.ReactNode
}) {
    const { user } = props

    const displayName = (user.name || user.email).trim()
    const roleLabel = ROLE_DISPLAY_NAMES[user.role] || user.role

    const cardHref = props.cardHref ?? `/team/${user.id}/card`
    const vcardHref = `/api/team/${user.id}/vcard`

    const copyLink = async () => {
        try {
            const origin = window.location.origin
            const url = `${origin}${cardHref}`
            await navigator.clipboard.writeText(url)
            toast.success("已复制名片链接", { description: url })
        } catch {
            toast.error("复制失败", { description: "请检查浏览器权限或手动复制链接" })
        }
    }

    return (
        <Card className="h-full">
            <CardContent className="p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-4 min-w-0">
                        <Avatar className="h-14 w-14">
                            <AvatarImage src={user.avatarUrl || undefined} />
                            <AvatarFallback>{displayName?.[0] || "U"}</AvatarFallback>
                        </Avatar>

                        <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="text-xl font-bold tracking-tight truncate">{displayName}</div>
                                <Badge variant="secondary">{roleLabel}</Badge>
                            </div>
                            <div className="text-sm text-muted-foreground truncate">{user.email}</div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                {props.organizationName ? <span>{props.organizationName}</span> : null}
                                {user.department ? <span>部门：{user.department}</span> : null}
                                {user.title ? <span>职称：{user.title}</span> : null}
                                {user.employeeNo ? <span>工号：{user.employeeNo}</span> : null}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button asChild variant="outline" size="sm">
                            <Link href={cardHref} className="gap-2">
                                <ExternalLink className="h-4 w-4" />
                                打开名片页
                            </Link>
                        </Button>
                        {props.showCopyLink === false ? null : (
                            <Button variant="outline" size="sm" onClick={() => void copyLink()}>
                                <Copy className="h-4 w-4 mr-2" />
                                复制链接
                            </Button>
                        )}
                        {props.showVCardDownload === false ? null : (
                            <Button asChild variant="outline" size="sm">
                                <a href={vcardHref}>
                                    <Download className="h-4 w-4 mr-2" />
                                    下载 vCard
                                </a>
                            </Button>
                        )}
                        {props.extraActions}
                    </div>
                </div>

            </CardContent>
        </Card>
    )
}
