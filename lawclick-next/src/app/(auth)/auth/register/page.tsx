"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { RegisterSchema } from "@/lib/schemas"
import { registerUser } from "@/actions/auth"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Label } from "@/components/ui/Label"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { toast } from "sonner"
import Link from "next/link"
import { Loader2, Scale } from "lucide-react"
import { z } from "zod"

type RegisterForm = z.infer<typeof RegisterSchema>

export default function RegisterPage() {
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    // Convert Zod schema type
    const { register: registerField, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
        resolver: zodResolver(RegisterSchema)
    })

    const onSubmit = async (data: RegisterForm) => {
        setLoading(true)
        const formData = new FormData()
        formData.append("name", data.name)
        formData.append("email", data.email)
        formData.append("password", data.password)

        try {
            const res = await registerUser(formData)
            if (!res.success) {
                toast.error("注册失败", { description: res.error })
                return
            }
            toast.success("注册成功", { description: "请登录您的账号" })
            router.push("/auth/login")
        } catch {
            toast.error("系统错误", { description: "请稍后重试" })
        } finally {
            setLoading(false)
        }
    }

    return (
        <GlassPanel intensity="high" className="w-full max-w-md p-8 shadow-2xl">
            <div className="flex flex-col items-center justify-center mb-8 space-y-2">
                <div className="bg-primary/10 p-3 rounded-xl ring-1 ring-border">
                    <Scale className="h-8 w-8 text-primary" />
                </div>
                <div className="text-center">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">创建账号</h1>
                    <p className="text-sm text-muted-foreground mt-1">加入 LawClick 生态系统</p>
                </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                    <Label>姓名</Label>
                    <Input
                        {...registerField("name")}
                        placeholder="真实姓名"
                        className="bg-background/60 border-border focus-visible:ring-primary/50"
                    />
                    {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label>邮箱</Label>
                    <Input
                        {...registerField("email")}
                        type="email"
                        placeholder="lawyer@firm.com"
                        className="bg-background/60 border-border focus-visible:ring-primary/50"
                    />
                    {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                </div>

                <div className="space-y-2">
                    <Label>密码</Label>
                    <Input
                        {...registerField("password")}
                        type="password"
                        placeholder="••••••••"
                        className="bg-background/60 border-border focus-visible:ring-primary/50"
                    />
                    {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                </div>

                <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {loading ? "注册中..." : "立即注册"}
                </Button>
            </form>

            <div className="mt-6 text-center text-sm">
                <span className="text-muted-foreground">已有账号？ </span>
                <Link href="/auth/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
                    立即登录
                </Link>
            </div>
        </GlassPanel>
    )
}
