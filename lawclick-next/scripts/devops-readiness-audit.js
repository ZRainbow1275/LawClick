const fs = require("fs")
const path = require("path")

const PROJECT_ROOT = path.join(__dirname, "..")
const REPO_ROOT = path.join(PROJECT_ROOT, "..")
const OUT_DIR = path.join(REPO_ROOT, "docs", "_artifacts")

function formatDate(d) {
    const pad = (n) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function safeExists(p) {
    try {
        return fs.existsSync(p)
    } catch {
        return false
    }
}

function fileContains(filePath, needles) {
    try {
        const text = fs.readFileSync(filePath, "utf8")
        return needles.every((n) => text.includes(n))
    } catch {
        return false
    }
}

function countDirEntries(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) return 0
        return fs.readdirSync(dirPath).length
    } catch {
        return 0
    }
}

function main() {
    const date = formatDate(new Date())
    const outPath = path.join(OUT_DIR, `devops_readiness_audit_${date}.md`)     

    const dockerCompose = path.join(PROJECT_ROOT, "docker-compose.yml")
    const rootDockerfile = path.join(REPO_ROOT, "Dockerfile")
    const ciWorkflow = path.join(REPO_ROOT, ".github", "workflows", "ci.yml")
    const migrationsDir = path.join(PROJECT_ROOT, "prisma", "migrations")       

    const checks = [
        {
            id: "dockerfile",
            title: "根目录 Dockerfile 存在（生产构建入口）",
            ok: safeExists(rootDockerfile),
        },
        {
            id: "ci-workflow",
            title: "CI 工作流存在（.github/workflows/ci.yml）",
            ok: safeExists(ciWorkflow),
        },
        {
            id: "docker-compose",
            title: "Docker Compose（Postgres + MinIO）存在",
            ok: safeExists(dockerCompose),
        },
        {
            id: "docker-compose-services",
            title: "docker-compose.yml 包含 postgres/minio 服务",
            ok: fileContains(dockerCompose, ["postgres", "minio"]),
        },
        {
            id: "schema",
            title: "Prisma schema 存在",
            ok: safeExists(path.join(PROJECT_ROOT, "prisma", "schema.prisma")),
        },
        {
            id: "prisma-config",
            title: "Prisma v7 配置存在（prisma.config.ts）",
            ok: safeExists(path.join(PROJECT_ROOT, "prisma.config.ts")),
        },
        {
            id: "migrations",
            title: "Prisma migrations 存在且非空",
            ok: countDirEntries(migrationsDir) > 0,
        },
        {
            id: "verify-system",
            title: "verify:system 脚本存在",
            ok: safeExists(path.join(PROJECT_ROOT, "scripts", "verify-system.js")),
        },
        {
            id: "playwright",
            title: "Playwright 配置存在（E2E 可复跑）",
            ok: safeExists(path.join(PROJECT_ROOT, "playwright.config.ts")),
        },
        {
            id: "next-config",
            title: "Next 配置存在",
            ok: safeExists(path.join(PROJECT_ROOT, "next.config.ts")),
        },
        {
            id: "health-endpoint",
            title: "健康检查端点存在（/api/health）",
            ok: safeExists(path.join(PROJECT_ROOT, "src", "app", "api", "health", "route.ts")),
        },
        {
            id: "middleware",
            title: "middleware 存在（请求治理入口）",
            ok: safeExists(path.join(PROJECT_ROOT, "middleware.ts")),
        },
        {
            id: "env-present",
            title: "本地 .env 存在（不读取内容）",
            ok: safeExists(path.join(PROJECT_ROOT, ".env")),
        },
    ]

    const offenders = checks.filter((c) => !c.ok)

    const lines = []
    lines.push(`# DevOps Readiness Audit (${date})`)
    lines.push("")
    lines.push("> 目的：对“可启动/可迁移/可验证/可回归”的 DevOps 最小集做可复跑检查。")
    lines.push("> 说明：本审计只做静态存在性检查；运行态验证请结合 `pnpm -C lawclick-next verify:system` 与 E2E。")
    lines.push("")
    lines.push("## Summary")
    lines.push(`- checks: ${checks.length}`)
    lines.push(`- offenders: ${offenders.length}`)
    lines.push("")
    lines.push("## Checklist")
    lines.push("")
    for (const c of checks) {
        lines.push(`- ${c.ok ? "✅" : "❌"} ${c.title} (${c.id})`)
    }

    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

    console.log(`[devops] checks: ${checks.length}`)
    console.log(`[devops] offenders: ${offenders.length}`)
    console.log(`[devops] wrote: ${path.relative(REPO_ROOT, outPath).replace(/\\\\/g, "/")}`)
}

main()
