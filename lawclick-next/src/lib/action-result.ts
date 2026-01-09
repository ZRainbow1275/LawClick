export type ActionErrorCode =
    | "VALIDATION_ERROR"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT"
    | "PRECONDITION_FAILED"
    | "DEPENDENCY_ERROR"
    | "INTERNAL_ERROR"

export type ActionError = {
    code: ActionErrorCode
    message: string
    details?: unknown
}

export type ActionResult<T> =
    | { success: true; data: T }
    | { success: false; error: ActionError }

export function ok<T>(data: T): ActionResult<T> {
    return { success: true, data }
}

export function fail(code: ActionErrorCode, message: string, details?: unknown): ActionResult<never> {
    return { success: false, error: { code, message, details } }
}

export function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) return error.message
    if (typeof error === "string" && error) return error
    return fallback
}

