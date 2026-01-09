import ResetPasswordClient from "./ResetPasswordClient"

export const dynamic = "force-dynamic"

export default async function ResetPasswordPage(props: { searchParams?: Promise<{ token?: string | string[] }> }) {
    const resolvedParams = await props.searchParams
    const tokenParam = resolvedParams?.token
    const token = typeof tokenParam === "string" ? tokenParam.trim() : ""
    return <ResetPasswordClient token={token} />
}
