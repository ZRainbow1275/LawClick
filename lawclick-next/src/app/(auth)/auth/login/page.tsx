"use client"

import { useState } from "react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import Link from "next/link"
import { Gavel, Loader2 } from "lucide-react"

export default function LoginPage() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)

        try {
            const result = await signIn("credentials", {
                email,
                password,
                redirect: false,
            })

            if (result?.error) {
                toast.error("登录失败", { description: "邮箱或密码错误" })
            } else {
                toast.success("登录成功")
                router.push("/dashboard")
                router.refresh()
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "未知错误"
            toast.error("登录出错: " + message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <GlassPanel intensity="high" className="w-full max-w-md p-8 shadow-2xl">
            <div className="flex flex-col items-center justify-center mb-8 space-y-2">
                <div className="bg-primary/10 p-3 rounded-xl ring-1 ring-border">
                    <Gavel className="h-8 w-8 text-primary" />
                </div>
                <div className="text-center">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">欢迎回来</h1>
                    <p className="text-sm text-muted-foreground mt-1">登录您的 LawClick 工作台</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="email">邮箱</Label>
                    <Input
                        id="email"
                        type="email"
                        placeholder="name@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="bg-background/60 border-border focus-visible:ring-primary/50"
                    />
                </div>
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="password">密码</Label>
                        <a href="/auth/reset-password" className="text-xs text-primary hover:text-primary/80 transition-colors">
                            忘记密码？
                        </a>
                    </div>
                    <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="bg-background/60 border-border focus-visible:ring-primary/50"
                    />
                </div>
                <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {loading ? "登录中..." : "登录"}
                </Button>
            </form>

            <div className="mt-6 text-center text-sm">
                <span className="text-muted-foreground">还没有账号？ </span>
                <Link href="/auth/register" className="text-primary hover:text-primary/80 font-medium transition-colors">
                    立即注册
                </Link>
            </div>
        </GlassPanel>
    )
}
