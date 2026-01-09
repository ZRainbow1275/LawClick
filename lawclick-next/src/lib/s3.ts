import "server-only"

import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { z } from "zod"
import type { Readable } from "node:stream"

import { parseEnv } from "@/lib/server-env"

const S3EnvSchema = z.object({
    S3_ENDPOINT: z.string().url(),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_BUCKET_NAME: z.string().min(3),
})

type S3Env = z.infer<typeof S3EnvSchema>

let cachedEnv: S3Env | null = null
function getS3Env(): S3Env {
    if (!cachedEnv) {
        cachedEnv = parseEnv(S3EnvSchema)
    }
    return cachedEnv
}

let cachedClient: S3Client | null = null
export function getS3Client(): S3Client {
    if (!cachedClient) {
        const env = getS3Env()
        cachedClient = new S3Client({
            region: "us-east-1",
            endpoint: env.S3_ENDPOINT,
            credentials: {
                accessKeyId: env.S3_ACCESS_KEY,
                secretAccessKey: env.S3_SECRET_KEY,
            },
            forcePathStyle: true,
        })
    }
    return cachedClient
}

export function getBucketName(): string {
    return getS3Env().S3_BUCKET_NAME
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

function isBucketNotFound(error: unknown): boolean {
    const status = getHttpStatusCode(error)
    if (status === 404) return true
    const name = getAwsErrorName(error)
    return name === "NotFound" || name === "NoSuchBucket"
}

function isObjectNotFound(error: unknown): boolean {
    const status = getHttpStatusCode(error)
    if (status === 404) return true
    const name = getAwsErrorName(error)
    return name === "NotFound" || name === "NoSuchKey"
}

export type PutObjectBody = Uint8Array | Readable | ReadableStream<Uint8Array>
export type PutObjectInput = {
    key: string
    body: PutObjectBody
    contentType?: string
    contentLength?: number
}
export type GetObjectOutput = { body: unknown; contentType?: string }
export type HeadObjectOutput = { contentType?: string; contentLength: number; eTag?: string }

export interface StorageProvider {
    ensureBucketExists(): Promise<void>
    putObject(input: PutObjectInput): Promise<void>
    presignPutObject(input: { key: string; contentType?: string; expiresInSeconds?: number }): Promise<{ url: string }>
    headObject(key: string): Promise<HeadObjectOutput | null>
    getObject(key: string): Promise<GetObjectOutput>
    deleteObject(key: string): Promise<void>
}

class S3StorageProvider implements StorageProvider {
    private ensureBucketPromise: Promise<void> | null = null

    async ensureBucketExists(): Promise<void> {
        if (!this.ensureBucketPromise) {
            this.ensureBucketPromise = (async () => {
                const Bucket = getBucketName()
                const client = getS3Client()
                try {
                    await client.send(new HeadBucketCommand({ Bucket }))
                } catch (error) {
                    if (!isBucketNotFound(error)) throw error
                    await client.send(new CreateBucketCommand({ Bucket }))
                }
            })()
            this.ensureBucketPromise = this.ensureBucketPromise.catch((error) => {
                this.ensureBucketPromise = null
                throw error
            })
        }
        return this.ensureBucketPromise
    }

    async putObject(input: PutObjectInput): Promise<void> {
        await this.ensureBucketExists()
        await getS3Client().send(
            new PutObjectCommand({
                Bucket: getBucketName(),
                Key: input.key,
                Body: input.body,
                ...(input.contentType ? { ContentType: input.contentType } : {}),
                ...(Number.isFinite(input.contentLength) && (input.contentLength || 0) > 0
                    ? { ContentLength: input.contentLength }
                    : {}),
            })
        )
    }

    async presignPutObject(input: { key: string; contentType?: string; expiresInSeconds?: number }): Promise<{ url: string }> {
        await this.ensureBucketExists()
        const Bucket = getBucketName()
        const command = new PutObjectCommand({
            Bucket,
            Key: input.key,
            ...(input.contentType ? { ContentType: input.contentType } : {}),
        })
        const expiresIn = Math.max(60, Math.min(60 * 60, Math.floor(input.expiresInSeconds ?? 600)))
        const url = await getSignedUrl(getS3Client(), command, {
            expiresIn,
            ...(input.contentType ? { signableHeaders: new Set(["content-type"]) } : {}),
        })
        return { url }
    }

    async headObject(key: string): Promise<HeadObjectOutput | null> {
        await this.ensureBucketExists()
        try {
            const object = await getS3Client().send(
                new HeadObjectCommand({
                    Bucket: getBucketName(),
                    Key: key,
                })
            )
            const contentLength = typeof object.ContentLength === "number" ? object.ContentLength : 0
            return { contentType: object.ContentType, contentLength, eTag: object.ETag }
        } catch (error) {
            if (isObjectNotFound(error)) return null
            throw error
        }
    }

    async getObject(key: string): Promise<GetObjectOutput> {
        await this.ensureBucketExists()
        const object = await getS3Client().send(
            new GetObjectCommand({
                Bucket: getBucketName(),
                Key: key,
            })
        )
        return { body: object.Body, contentType: object.ContentType }
    }

    async deleteObject(key: string): Promise<void> {
        await this.ensureBucketExists()
        await getS3Client().send(
            new DeleteObjectCommand({
                Bucket: getBucketName(),
                Key: key,
            })
        )
    }
}

let cachedProvider: StorageProvider | null = null
export function getStorageProvider(): StorageProvider {
    if (!cachedProvider) cachedProvider = new S3StorageProvider()
    return cachedProvider
}

export async function ensureBucketExists(): Promise<void> {
    return getStorageProvider().ensureBucketExists()
}
