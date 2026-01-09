export type LogLevel = "debug" | "info" | "warn" | "error"

export type LogMeta = Record<string, unknown>

function toErrorPayload(error: unknown) {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            ...(process.env.NODE_ENV === "development" ? { stack: error.stack } : {}),
        }
    }
    if (typeof error === "string") return { message: error }
    try {
        return { message: JSON.stringify(error) }
    } catch {
        return { message: String(error) }
    }
}

function emit(level: LogLevel, message: string, meta?: LogMeta, error?: unknown) {
    const payload = {
        level,
        message,
        time: new Date().toISOString(),
        ...(meta ? { meta } : {}),
        ...(typeof error !== "undefined" ? { error: toErrorPayload(error) } : {}),
    }

    if (level === "error") {
        console.error(JSON.stringify(payload))
        return
    }
    if (level === "warn") {
        console.warn(JSON.stringify(payload))
        return
    }
    console.log(JSON.stringify(payload))
}

export const logger = {
    debug(message: string, meta?: LogMeta) {
        if (process.env.NODE_ENV !== "development") return
        emit("debug", message, meta)
    },
    info(message: string, meta?: LogMeta) {
        emit("info", message, meta)
    },
    warn(message: string, meta?: LogMeta) {
        emit("warn", message, meta)
    },
    error(message: string, error?: unknown, meta?: LogMeta) {
        emit("error", message, meta, error)
    },
}

