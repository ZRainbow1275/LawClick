const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")
const { z } = require("zod")
const { loadDotEnvFile, parseEnv } = require("./_env")

loadDotEnvFile()

const EnvSchema = z
    .object({
        DATABASE_URL: z.string().min(1),
    })
    .strict()

function redactDatabaseUrl(value) {
    try {
        const url = new URL(value)
        if (url.password) url.password = "***"
        return url.toString()
    } catch {
        return "<invalid DATABASE_URL>"
    }
}

function parseDatabaseUrl(value) {
    let url
    try {
        url = new URL(value)
    } catch {
        throw new Error("DATABASE_URL 不是合法 URL")
    }

    const protocol = url.protocol
    if (protocol !== "postgresql:" && protocol !== "postgres:") {
        throw new Error(`DATABASE_URL 协议不支持: ${protocol}`)
    }

    const dbName = url.pathname.replace(/^\/+/, "")
    if (!dbName) throw new Error("DATABASE_URL 缺少数据库名（pathname）")

    const username = url.username ? decodeURIComponent(url.username) : ""
    const password = url.password ? decodeURIComponent(url.password) : ""
    if (!username) throw new Error("DATABASE_URL 缺少用户名")
    if (!password) throw new Error("DATABASE_URL 缺少密码（避免脚本误连/误判）")

    const schemaFromUrl = url.searchParams.get("schema") || "public"
    return {
        host: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        dbName,
        username,
        password,
        schema: schemaFromUrl,
    }
}

function isLocalHost(hostname) {
    const host = String(hostname || "").trim().toLowerCase()
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "host.docker.internal"
}

function run(command, args, options = {}) {
    const result = spawnSync(command, args, { encoding: "utf8", ...options })
    if (result.error) throw result.error
    if (result.status !== 0) {
        const suffix = result.status === null ? "（被信号中断）" : `（exit=${result.status}）`
        throw new Error(`命令执行失败: ${command} ${args.join(" ")} ${suffix}`)
    }
    return result
}

function parseDockerEnvLines(stdout) {
    const env = {}
    const lines = String(stdout || "").split(/\r?\n/)
    for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const idx = trimmed.indexOf("=")
        if (idx <= 0) continue
        const key = trimmed.slice(0, idx).trim()
        const value = trimmed.slice(idx + 1).trim()
        if (!key) continue
        env[key] = value
    }
    return env
}

function getContainerEnv(container) {
    const result = run("docker", ["inspect", "-f", "{{range .Config.Env}}{{println .}}{{end}}", container])
    return parseDockerEnvLines(result.stdout)
}

function getContainerHostPort(container, internalPortProto) {
    const result = run("docker", ["port", container, internalPortProto])
    const lines = String(result.stdout || "")
        .split(/\r?\n/)
        .map((v) => v.trim())
        .filter(Boolean)

    for (const line of lines) {
        const match = /:(\d+)\s*$/.exec(line)
        if (match) return Number(match[1])
    }

    return undefined
}

function mask(value) {
    return value ? "***" : "<empty>"
}

function assertDatabaseUrlMatchesContainer({ db, container, containerEnv, hostPort }) {
    const expectedDb = containerEnv.POSTGRES_DB
    const expectedUser = containerEnv.POSTGRES_USER
    const expectedPassword = containerEnv.POSTGRES_PASSWORD

    if (expectedDb && db.dbName !== expectedDb) {
        throw new Error(
            `DATABASE_URL 数据库名不匹配：db=${db.dbName}，但容器 ${container} 的 POSTGRES_DB=${expectedDb}\n请修正 DATABASE_URL 或指定正确的 --container。`
        )
    }

    if (expectedUser && db.username !== expectedUser) {
        throw new Error(
            `DATABASE_URL 用户名不匹配：user=${db.username}，但容器 ${container} 的 POSTGRES_USER=${expectedUser}\n请修正 DATABASE_URL 或指定正确的 --container。`
        )
    }

    if (expectedPassword && db.password !== expectedPassword) {
        throw new Error(
            `DATABASE_URL 密码不匹配：password=${mask(db.password)}，但容器 ${container} 的 POSTGRES_PASSWORD=${mask(
                expectedPassword
            )}\n请修正 DATABASE_URL（避免导入成功后应用仍连不上 DB）。`
        )
    }

    if (!db.port) {
        throw new Error(
            `DATABASE_URL 必须显式包含端口（避免误连到 5432 导致“导入成功但应用仍空”）。\n容器 ${container} 的 5432/tcp 映射端口为 ${hostPort ?? "<unknown>"}。`
        )
    }

    if (hostPort && db.port !== hostPort) {
        throw new Error(
            `DATABASE_URL 端口不匹配：port=${db.port}，但容器 ${container} 的 5432/tcp 映射端口为 ${hostPort}\n请修正 DATABASE_URL（否则应用不会读取到本次导入的数据）。`
        )
    }
}

function printUsage() {
    console.log(`[restore-snapshot] 使用方式:

  pnpm restore:snapshot -- --file <path> --yes [--reset] [--format auto|sql|custom] [--container <name>] [--schema <name>]

示例（推荐：重置 public schema 后导入）:
  pnpm restore:snapshot -- --file ./.data/snapshots/lawclick.dump --reset --yes

注意:
  - 严禁 synthetic seed；该命令仅用于导入“脱敏生产快照”。
  - 仅支持导入到 docker-compose Postgres 容器（默认: lawclick-postgres）；脚本会强校验 DATABASE_URL 与容器配置/端口映射一致，避免“导入成功但应用仍空”。
  - 需要本机已启动 docker compose（默认容器名: lawclick-postgres）。`)
}

function parseArgs(argv) {
    const raw = {
        file: undefined,
        yes: false,
        reset: false,
        format: "auto",
        container: "lawclick-postgres",
        schema: undefined,
        allowNonlocal: false,
        help: false,
        verbose: false,
    }

    for (let i = 0; i < argv.length; i++) {
        const token = argv[i]
        if (!token) continue

        if (token === "--help" || token === "-h") {
            raw.help = true
            continue
        }
        if (token === "--yes" || token === "-y") {
            raw.yes = true
            continue
        }
        if (token === "--reset") {
            raw.reset = true
            continue
        }
        if (token === "--verbose") {
            raw.verbose = true
            continue
        }
        if (token === "--allow-nonlocal") {
            raw.allowNonlocal = true
            continue
        }

        if (token === "--file" || token === "-f") {
            raw.file = argv[i + 1]
            i++
            continue
        }
        if (token.startsWith("--file=")) {
            raw.file = token.slice("--file=".length)
            continue
        }

        if (token === "--format") {
            raw.format = argv[i + 1]
            i++
            continue
        }
        if (token.startsWith("--format=")) {
            raw.format = token.slice("--format=".length)
            continue
        }

        if (token === "--container") {
            raw.container = argv[i + 1]
            i++
            continue
        }
        if (token.startsWith("--container=")) {
            raw.container = token.slice("--container=".length)
            continue
        }

        if (token === "--schema") {
            raw.schema = argv[i + 1]
            i++
            continue
        }
        if (token.startsWith("--schema=")) {
            raw.schema = token.slice("--schema=".length)
            continue
        }

        throw new Error(`未知参数: ${token}`)
    }

    const ArgsSchema = z
        .object({
            file: z.string().min(1).optional(),
            yes: z.boolean(),
            reset: z.boolean(),
            format: z.enum(["auto", "sql", "custom"]),
            container: z.string().min(1),
            schema: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).optional(),
            allowNonlocal: z.boolean(),
            help: z.boolean(),
            verbose: z.boolean(),
        })
        .strict()

    return ArgsSchema.parse(raw)
}

function detectFormat(filePath, forced) {
    if (forced && forced !== "auto") return forced
    const lower = String(filePath).toLowerCase()
    if (lower.endsWith(".sql")) return "sql"
    if (lower.endsWith(".dump") || lower.endsWith(".backup") || lower.endsWith(".tar")) return "custom"
    return null
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    if (args.help) {
        printUsage()
        return
    }

    if (!args.file) {
        printUsage()
        throw new Error("缺少 --file <path>")
    }

    const env = parseEnv(EnvSchema)
    const db = parseDatabaseUrl(env.DATABASE_URL)
    const schema = args.schema || db.schema || "public"

    if (args.allowNonlocal) {
        throw new Error(
            "`--allow-nonlocal` 已废弃：restore:snapshot 仅允许导入到本机 docker-compose Postgres。\n如需导入到外部 Postgres，请在目标环境使用 pg_restore/psql 手动导入。"
        )
    }

    if (!isLocalHost(db.host)) {
        throw new Error(
            `出于安全考虑，restore:snapshot 仅允许操作本机数据库。当前 DATABASE_URL=${redactDatabaseUrl(env.DATABASE_URL)}`
        )
    }

    const absFilePath = path.resolve(args.file)
    if (!fs.existsSync(absFilePath)) {
        throw new Error(`未找到快照文件: ${absFilePath}`)
    }

    const format = detectFormat(absFilePath, args.format)
    if (!format) {
        throw new Error(`无法自动识别快照格式（仅支持 .sql/.dump/.backup/.tar），请使用 --format 显式指定。`)
    }

    if (!args.yes) {
        console.log(`[restore-snapshot] 将执行以下操作（需要 --yes 才会继续）:`)
        console.log(`- DATABASE_URL: ${redactDatabaseUrl(env.DATABASE_URL)}`)
        console.log(`- docker container: ${args.container}`)
        console.log(`- snapshot: ${absFilePath}`)
        console.log(`- format: ${format}`)
        console.log(`- reset schema: ${args.reset ? "YES" : "NO"} (schema=${schema})`)
        console.log(`\n重新执行并追加 --yes 以继续。`)
        process.exitCode = 2
        return
    }

    run("docker", ["--version"], { stdio: args.verbose ? "inherit" : "ignore" })

    const runningCheck = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", args.container], {
        encoding: "utf8",
    })
    if (runningCheck.status !== 0) {
        throw new Error(`未找到/无法检查容器: ${args.container}\n请先在 lawclick-next/ 执行: docker compose up -d`)
    }
    if (!String(runningCheck.stdout || "").trim().toLowerCase().startsWith("true")) {
        throw new Error(`容器未运行: ${args.container}\n请先在 lawclick-next/ 执行: docker compose up -d`)
    }

    const containerEnv = getContainerEnv(args.container)
    const hostPort = getContainerHostPort(args.container, "5432/tcp")
    assertDatabaseUrlMatchesContainer({
        db,
        container: args.container,
        containerEnv,
        hostPort,
    })

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const containerFile = `/tmp/lawclick-snapshot-${suffix}${path.extname(absFilePath) || ""}`

    console.log(`[restore-snapshot] 准备导入快照...`)
    console.log(`- DATABASE_URL: ${redactDatabaseUrl(env.DATABASE_URL)}`)
    console.log(`- container: ${args.container}`)
    console.log(`- snapshot: ${absFilePath}`)
    console.log(`- container file: ${containerFile}`)

    run("docker", ["cp", absFilePath, `${args.container}:${containerFile}`], { stdio: "inherit" })

    try {
        if (args.reset) {
            console.log(`[restore-snapshot] 重置 schema: ${schema}...`)
            run(
                "docker",
                [
                    "exec",
                    "-e",
                    `PGPASSWORD=${db.password}`,
                    args.container,
                    "psql",
                    "-v",
                    "ON_ERROR_STOP=1",
                    "-U",
                    db.username,
                    "-d",
                    db.dbName,
                    "-c",
                    `DROP SCHEMA IF EXISTS "${schema}" CASCADE; CREATE SCHEMA "${schema}";`,
                ],
                { stdio: "inherit" }
            )
        }

        console.log(`[restore-snapshot] 开始导入（format=${format}）...`)
        if (format === "sql") {
            run(
                "docker",
                [
                    "exec",
                    "-e",
                    `PGPASSWORD=${db.password}`,
                    args.container,
                    "psql",
                    "-v",
                    "ON_ERROR_STOP=1",
                    "-U",
                    db.username,
                    "-d",
                    db.dbName,
                    "-f",
                    containerFile,
                ],
                { stdio: "inherit" }
            )
        } else {
            const pgRestoreArgs = [
                "exec",
                "-e",
                `PGPASSWORD=${db.password}`,
                args.container,
                "pg_restore",
                "--exit-on-error",
                "--no-owner",
                "--no-acl",
                "-U",
                db.username,
                "-d",
                db.dbName,
            ]
            if (args.verbose) pgRestoreArgs.push("--verbose")
            pgRestoreArgs.push(containerFile)
            run("docker", pgRestoreArgs, { stdio: "inherit" })
        }

        console.log("[restore-snapshot] ✅ 导入完成")
        console.log("[restore-snapshot] 下一步建议：pnpm exec prisma migrate deploy（若需要对齐当前迁移）")
    } finally {
        try {
            run("docker", ["exec", args.container, "rm", "-f", containerFile], { stdio: "ignore" })
        } catch {
            // ignore cleanup failures
        }
    }
}

main().catch((e) => {
    console.error("[restore-snapshot] ❌ 失败:", e && e.message ? e.message : e)
    process.exitCode = 1
})
