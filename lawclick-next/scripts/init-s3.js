const { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand, S3Client } = require("@aws-sdk/client-s3")
const { z } = require("zod")
const { loadDotEnvFile, parseEnv } = require("./_env")

loadDotEnvFile()

const S3EnvSchema = z
    .object({
        S3_ENDPOINT: z.string().url(),
        S3_ACCESS_KEY: z.string().min(1),
        S3_SECRET_KEY: z.string().min(1),
        S3_BUCKET_NAME: z.string().min(3),
        S3_CORS_ORIGINS: z.string().optional(),
    })
    .strict()

const env = parseEnv(S3EnvSchema)

const s3 = new S3Client({
    region: "us-east-1",
    endpoint: env.S3_ENDPOINT,
    credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
    },
    forcePathStyle: true,
})

const BUCKET_NAME = env.S3_BUCKET_NAME

function stripUnsupportedChecksumHeaders(headers) {
    if (!headers || typeof headers !== "object") return
    for (const headerName of Object.keys(headers)) {
        const lower = headerName.toLowerCase()
        if (lower.startsWith("x-amz-checksum-") || lower.startsWith("x-amz-sdk-checksum-")) {
            delete headers[headerName]
        }
    }
}

const minioCompatMiddleware = (next, context) => async (args) => {
    if (context.commandName !== "PutBucketCorsCommand") {
        return next(args)
    }
    const request = args.request
    if (request && typeof request === "object") {
        const headers = request.headers
        stripUnsupportedChecksumHeaders(headers)
    }
    return next(args)
}

// Some S3-compatible services (MinIO) may not support the newer checksum headers.
s3.middlewareStack.add(minioCompatMiddleware, {
    step: "build",
    name: "minioCompatCors",
    priority: "low",
    tags: ["MINIO_COMPAT"],
})

function parseCorsOrigins(value) {
    if (!value || typeof value !== "string") {
        return ["http://localhost:3000", "http://127.0.0.1:3000"]
    }
    const origins = value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    return origins.length ? origins : ["http://localhost:3000", "http://127.0.0.1:3000"]
}

function getHttpStatusCode(error) {
    if (!error || typeof error !== "object") return undefined
    const metadata = error.$metadata
    if (!metadata || typeof metadata !== "object") return undefined
    const status = metadata.httpStatusCode
    return typeof status === "number" ? status : undefined
}

function getAwsErrorName(error) {
    if (!error || typeof error !== "object") return undefined
    const name = error.name
    return typeof name === "string" ? name : undefined
}

function isBucketNotFound(error) {
    const status = getHttpStatusCode(error)
    if (status === 404) return true
    const name = getAwsErrorName(error)
    return name === "NotFound" || name === "NoSuchBucket"
}

function isNotImplemented(error) {
    const status = getHttpStatusCode(error)
    if (status === 501) return true
    const name = getAwsErrorName(error)
    return name === "NotImplemented"
}

async function main() {
    console.log(`🪣 Initializing S3 Bucket: ${BUCKET_NAME}...`)
    try {
        await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }))
        console.log("✅ Bucket already exists.")
    } catch (e) {
        if (!isBucketNotFound(e)) {
            console.error("❌ HeadBucket failed:", e)
            process.exitCode = 1
            return
        }

        console.log("Bucket not found, creating...")
        await s3.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }))
        console.log("✅ Bucket created successfully.")
    }

    const origins = parseCorsOrigins(env.S3_CORS_ORIGINS)
    console.log(`🌐 Configuring bucket CORS (origins: ${origins.join(", ")})...`)
    try {
        await s3.send(
            new PutBucketCorsCommand({
                Bucket: BUCKET_NAME,
                CORSConfiguration: {
                    CORSRules: [
                        {
                            AllowedHeaders: ["*"],
                            AllowedMethods: ["GET", "HEAD", "PUT"],
                            AllowedOrigins: origins,
                            ExposeHeaders: ["ETag"],
                            MaxAgeSeconds: 3000,
                        },
                    ],
                },
            })
        )
        console.log("✅ Bucket CORS configured.")
    } catch (e) {
        if (isNotImplemented(e)) {
            console.log("⚠️ 当前 S3 兼容服务不支持 PutBucketCors（MinIO 常见）。")
            console.log("   直传若遇到 CORS，请检查 MinIO 全局配置：`mc admin config export <alias>/ | findstr cors_allow_origin`。")
            return
        }
        throw e
    }
}

main().catch((e) => {
    console.error(e)
    process.exitCode = 1
})
