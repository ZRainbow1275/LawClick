import { AuthError, PermissionError } from "@/lib/server-auth"

export class UserFacingError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "UserFacingError"
    }
}

function shouldMaskPermissionMessage(message: string): boolean {
    const trimmed = message.trim()
    if (!trimmed) return true
    if (trimmed.startsWith("缺少权限：")) return true
    if (/[\\w-]+:[\\w-]+/.test(trimmed)) return true
    return false
}

export function getPublicActionErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof UserFacingError) return error.message
    if (error instanceof AuthError) return error.message || "请先登录"
    if (error instanceof PermissionError) {
        const message = error.message || ""
        if (shouldMaskPermissionMessage(message)) return "权限不足"
        return message
    }
    return fallback
}
