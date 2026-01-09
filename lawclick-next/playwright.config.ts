import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PLAYWRIGHT_PORT ? Number(process.env.PLAYWRIGHT_PORT) : 3001;
const BASE_URL = `http://localhost:${PORT}`;
const WORKERS = process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : 1;
const IS_CI = !!process.env.CI;

const DEFAULT_E2E_QUEUE_PROCESS_SECRET = "e2e-queue-secret"
const DEFAULT_E2E_QUEUE_PROCESS_IP_ALLOWLIST = "203.0.113.0/24"
 
export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: WORKERS,
    reporter: 'html',
    use: {
        baseURL: BASE_URL,
        reducedMotion: "reduce",
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: {
        command: `pnpm exec prisma generate && pnpm exec prisma migrate deploy && pnpm exec next build && pnpm exec next start -p ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !IS_CI,
        timeout: 120 * 1000,
        stdout: IS_CI ? "pipe" : "ignore",
        stderr: IS_CI ? "pipe" : "ignore",
        env: {
            ...process.env,
            PORT: String(PORT),
            NEXTAUTH_URL: BASE_URL,
            LC_NEXT_DIST_DIR: ".next-playwright",
            NODE_ENV: "production",
            QUEUE_PROCESS_SECRET: process.env.QUEUE_PROCESS_SECRET || DEFAULT_E2E_QUEUE_PROCESS_SECRET,
            QUEUE_PROCESS_IP_ALLOWLIST:
                process.env.QUEUE_PROCESS_IP_ALLOWLIST || DEFAULT_E2E_QUEUE_PROCESS_IP_ALLOWLIST,
        },
    },
});
