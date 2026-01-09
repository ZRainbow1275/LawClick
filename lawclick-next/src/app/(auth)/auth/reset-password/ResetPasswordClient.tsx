"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"

import { requestPasswordReset, resetPassword } from "@/actions/auth"
import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"

export default function ResetPasswordClient(props: { token: string }) {
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    async function handleSubmit(formData: FormData) {
        setLoading(true)
        try {
            const res = await requestPasswordReset(formData)
            if (!res.success) {
                toast.error("请求失败", { description: res.error })
                return
            }
            toast.success("请求成功", { description: res.message })
        } catch {
            toast.error("请求出错")
        } finally {
            setLoading(false)
        }
    }

    async function handleReset(formData: FormData) {
        const pwd = formData.get("password")
        const confirm = formData.get("confirmPassword")
        if (typeof pwd === "string" && typeof confirm === "string" && pwd !== confirm) {
            toast.error("两次输入的密码不一致")
            return
        }

        setLoading(true)
        try {
            const res = await resetPassword(formData)
            if (!res.success) {
                toast.error("重置失败", { description: res.error })
                return
            }
            toast.success("密码已重置", { description: "请使用新密码登录" })
            router.push("/auth/login")
        } catch {
            toast.error("重置出错")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card className="w-[350px]">
            <CardHeader>
                <CardTitle>{props.token ? "设置新密码" : "重置密码"}</CardTitle>
                <CardDescription>{props.token ? "请输入新密码" : "请输入您的注册邮箱"}</CardDescription>
            </CardHeader>
            <CardContent>
                {props.token ? (
                    <form action={handleReset} className="space-y-4">
                        <input type="hidden" name="token" value={props.token} />
                        <div className="space-y-2">
                            <Label htmlFor="password">新密码</Label>
                            <Input id="password" name="password" type="password" placeholder="••••••••" required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">确认新密码</Label>
                            <Input id="confirmPassword" name="confirmPassword" type="password" placeholder="••••••••" required />
                        </div>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? "提交中..." : "提交新密码"}
                        </Button>
                    </form>
                ) : (
                    <form action={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">邮箱</Label>
                            <Input id="email" name="email" type="email" placeholder="name@example.com" required />
                        </div>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? "发送中..." : "发送重置链接"}
                        </Button>
                    </form>
                )}
                <div className="mt-4 text-center text-sm text-muted-foreground">
                    <Link href="/auth/login" className="text-primary hover:underline">返回登录</Link>
                </div>
            </CardContent>
        </Card>
    )
}
