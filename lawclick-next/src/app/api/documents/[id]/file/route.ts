import { prisma } from "@/lib/prisma"
import { getStorageProvider } from "@/lib/s3"
import { buildCaseVisibilityWhere } from "@/lib/case-visibility"
import { AuthError, getActiveTenantContextWithPermissionOrThrow, PermissionError } from "@/lib/server-auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"
import { getPublicActionErrorMessage } from "@/lib/action-errors"
import { UuidSchema } from "@/lib/zod"
import { NextRequest, NextResponse } from "next/server"
import { Readable } from "stream"

export const runtime = "nodejs"

function toWebStream(body: unknown): BodyInit {
    if (body instanceof Readable) {
        const ReadableWithToWeb = Readable as unknown as { toWeb?: (stream: Readable) => BodyInit }
        if (typeof ReadableWithToWeb.toWeb === "function") {
            return ReadableWithToWeb.toWeb(body)
        }
    }
    return body as BodyInit
}

function getHttpStatusCode(error: unknown): number | undefined {
    if (!error || typeof error !== "object") return undefined
    const metadata = (error as { $metadata?: unknown }).$metadata
    if (!metadata || typeof metadata !== "object") return undefined
    const status = (metadata as { httpStatusCode?: unknown }).httpStatusCode
    return typeof status === "number" ? status : undefined
}

function getAwsErrorName(error: unknown): string | undefined {
    if (!error || typeof error !== "object") return undefined
    const name = (error as { name?: unknown }).name
    return typeof name === "string" ? name : undefined
}

function isObjectNotFound(error: unknown): boolean {
    const status = getHttpStatusCode(error)
    if (status === 404) return true
    const name = getAwsErrorName(error)
    return name === "NoSuchKey" || name === "NotFound"
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        let { id } = await params
        const parsedId = UuidSchema.safeParse(id)
        if (!parsedId.success) {
            return NextResponse.json({ error: "输入校验失败" }, { status: 400 })
        }
        id = parsedId.data

        const url = new URL(request.url)
        const versionIdRaw = url.searchParams.get("versionId")
        const download = url.searchParams.get("download") === "1"

        const ctx = await getActiveTenantContextWithPermissionOrThrow("document:view")
        const { user, tenantId } = ctx

        const rate = await checkRateLimit({
            key: `documents:file:${tenantId}:${user.id}`,
            limit: 120,
            windowMs: 60_000,
        })
        if (!rate.allowed) {
            return NextResponse.json(
                { error: "请求过于频繁，请稍后重试" },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(rate.retryAfterSeconds),
                        "X-RateLimit-Limit": String(rate.limit),
                        "X-RateLimit-Remaining": String(rate.remaining),
                        "X-RateLimit-Reset": String(Math.floor(rate.resetAt.getTime() / 1000)),
                    },
                }
            )
        }

        const document = await prisma.document.findFirst({
            where: {
                id,
                case: buildCaseVisibilityWhere({ userId: user.id, role: user.role, tenantId }),
            },
            select: {
                id: true,
                title: true,
                caseId: true,
                fileUrl: true,
                fileType: true,
            },
        })

        if (!document) {
            return NextResponse.json({ error: "文档不存在" }, { status: 404 })
        }

        let fileKey = document.fileUrl
        let fileType = document.fileType || "application/octet-stream"
        let filename = document.title || "document"

        if (versionIdRaw) {
            const parsedVersionId = UuidSchema.safeParse(versionIdRaw)
            if (!parsedVersionId.success) {
                return NextResponse.json({ error: "输入校验失败" }, { status: 400 })
            }

            const version = await prisma.documentVersion.findFirst({
                where: { id: parsedVersionId.data, documentId: document.id },
                select: { id: true, documentId: true, version: true, fileKey: true, fileType: true },
            })
            if (!version) {
                return NextResponse.json({ error: "版本不存在" }, { status: 404 })
            }

            fileKey = version.fileKey
            fileType = version.fileType || fileType
            filename = `${filename}_v${version.version}`
        }

        if (!fileKey) {
            return NextResponse.json({ error: "文档尚未上传文件" }, { status: 404 })
        }

        const storage = getStorageProvider()
        let body: unknown
        let storedContentType: string | undefined
        try {
            const object = await storage.getObject(fileKey)
            body = object.body
            storedContentType = object.contentType
        } catch (error) {
            if (isObjectNotFound(error)) {
                return NextResponse.json({ error: "文件不存在" }, { status: 404 })
            }
            throw error
        }

        if (!body) {
            return NextResponse.json({ error: "文件不存在" }, { status: 404 })
        }

        const headers = new Headers()
        headers.set("Content-Type", storedContentType || fileType)
        headers.set("Cache-Control", "private, no-store")
        headers.set("X-Content-Type-Options", "nosniff")
        headers.set("X-RateLimit-Limit", String(rate.limit))
        headers.set("X-RateLimit-Remaining", String(rate.remaining))
        headers.set("X-RateLimit-Reset", String(Math.floor(rate.resetAt.getTime() / 1000)))

        const disposition = download ? "attachment" : "inline"
        headers.set(
            "Content-Disposition",
            `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`
        )

        return new Response(toWebStream(body), { headers })
    } catch (error) {
        if (error instanceof AuthError) {
            return NextResponse.json({ error: getPublicActionErrorMessage(error, "请先登录") }, { status: 401 })
        }
        if (error instanceof PermissionError) {
            return NextResponse.json({ error: getPublicActionErrorMessage(error, "权限不足") }, { status: 403 })
        }
        logger.error("下载/预览文档失败", error)
        return NextResponse.json({ error: "下载/预览文档失败" }, { status: 500 })
    }
}
