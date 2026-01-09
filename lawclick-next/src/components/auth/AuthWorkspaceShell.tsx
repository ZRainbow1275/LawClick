"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo } from "react"
import { AlertTriangle, KeyRound, ShieldCheck } from "lucide-react"

import { SectionWorkspace, type SectionCatalogItem } from "@/components/layout/SectionWorkspace"
import { Badge } from "@/components/ui/Badge"

function getAuthPageTitle(pathname: string) {
    const path = (pathname || "").toLowerCase()
    if (path.includes("/auth/register")) return "注册"
    if (path.includes("/auth/reset-password")) return "重置密码"
    return "登录"
}

function AuthHelpBlock() {
    return (
        <div className="space-y-3">
            <div className="flex items-start gap-2">
                <ShieldCheck className="h-5 w-5 text-primary mt-0.5" />
                <div className="space-y-1">
                    <div className="text-sm font-medium">安全提示</div>
                    <div className="text-sm text-muted-foreground">
                        请勿在公共电脑保存密码；若发现异常登录，请立即修改密码并联系管理员。
                    </div>
                </div>
            </div>

            <div className="flex items-start gap-2">
                <KeyRound className="h-5 w-5 text-primary mt-0.5" />
                <div className="space-y-1">
                    <div className="text-sm font-medium">密码重置</div>
                    <div className="text-sm text-muted-foreground">
                        忘记密码可前往 <Link className="text-primary hover:underline" href="/auth/reset-password">重置密码</Link> 发送重置链接。
                    </div>
                </div>
            </div>

            <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-primary mt-0.5" />
                <div className="space-y-1">
                    <div className="text-sm font-medium">协作与租户</div>
                    <div className="text-sm text-muted-foreground">
                        如需加入团队，请使用租户邀请链接或联系租户管理员处理。
                    </div>
                </div>
            </div>

            <div className="pt-2 flex flex-wrap gap-2">
                <Badge variant="secondary">可拖拽布局</Badge>
                <Badge variant="secondary">本设备记忆</Badge>
                <Badge variant="secondary">可恢复默认</Badge>
            </div>
        </div>
    )
}

export function AuthWorkspaceShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const pageTitle = useMemo(() => getAuthPageTitle(pathname || ""), [pathname])

    const catalog = useMemo<SectionCatalogItem[]>(
        () => [
            {
                id: "b_auth_form",
                title: `${pageTitle}表单`,
                pinned: true,
                chrome: "none",
                defaultSize: { w: 12, h: 18, minW: 4, minH: 12 },
                content: (
                    <div className="h-full w-full flex items-center justify-center p-2">
                        <div className="w-full max-w-md">{children}</div>
                    </div>
                ),
            },
            {
                id: "b_auth_help",
                title: "使用提示",
                defaultSize: { w: 12, h: 12, minW: 4, minH: 8 },
                content: <AuthHelpBlock />,
            },
        ],
        [children, pageTitle]
    )

    return (
        <div className="h-screen overflow-auto bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/15 via-background to-background p-4 text-foreground">
            <div className="mx-auto w-full max-w-5xl">
                <SectionWorkspace
                    title={`${pageTitle} · LawClick`}
                    sectionId="auth"
                    catalog={catalog}
                    storage="local"
                    className="pb-10"
                />
            </div>
        </div>
    )
}

