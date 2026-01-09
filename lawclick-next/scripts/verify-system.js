const { createRequire } = require("node:module")

const { S3Client, ListBucketsCommand } = require("@aws-sdk/client-s3")
const { z } = require("zod")
const { loadDotEnvFile, parseEnv } = require("./_env")

loadDotEnvFile()

const adapterRequire = createRequire(require.resolve("@prisma/adapter-pg"))
const { Pool } = adapterRequire("pg")

const EnvSchema = z
    .object({
        DATABASE_URL: z.string().min(1),
        S3_ENDPOINT: z.string().url(),
        S3_ACCESS_KEY: z.string().min(1),
        S3_SECRET_KEY: z.string().min(1),
    })
    .strict()

const env = parseEnv(EnvSchema)

const s3 = new S3Client({
    region: "us-east-1",
    endpoint: env.S3_ENDPOINT,
    credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
    },
    forcePathStyle: true,
})

async function main() {
    console.log("🔍 Starting System Verification...\n")

    const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 })

    try {
        console.log("Checking Database Connection...")
        const userCountRow = await pool.query('SELECT COUNT(*) AS count FROM "User"')
        const userCount = Number(userCountRow.rows[0]?.count ?? 0)
        console.log(`✅ Database Connected. User count: ${userCount}`)

        const tokenCountRow = await pool.query('SELECT COUNT(*) AS count FROM "VerificationToken"')
        const tokenCount = Number(tokenCountRow.rows[0]?.count ?? 0)
        console.log(`✅ VerificationToken Table exists. Count: ${tokenCount}`)
    } catch (e) {
        console.error("❌ Database Error:", e)
        process.exitCode = 1
    } finally {
        await pool.end().catch(() => undefined)
    }

    try {
        console.log("\nChecking MinIO Connection...")
        const { Buckets } = await s3.send(new ListBucketsCommand({}))
        console.log("✅ MinIO Connected. Buckets:", (Buckets || []).map((b) => b.Name).join(", "))
    } catch (e) {
        console.error("❌ MinIO Error:", e)
        process.exitCode = 1
    }

    console.log("\nVerification Complete.")
}

main()
    .catch((e) => {
        console.error(e)
        process.exitCode = 1
    })
    .finally(() => undefined)
