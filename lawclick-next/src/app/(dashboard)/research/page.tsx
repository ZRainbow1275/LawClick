import { redirect } from "next/navigation"

export default function ResearchPage() {
    // TG12 审计：Research 为 TG13+ 规划入口，当前不提供占位/假功能页面。
    // 统一重定向到已闭环的工具箱页。
    redirect("/tools")
}

