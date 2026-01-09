import type { NextConfig } from "next";
import path from "path";
import createNextIntlPlugin from "next-intl/plugin"

function resolveDistDirFromEnv(): string | undefined {
  const raw = process.env.LC_NEXT_DIST_DIR;
  if (typeof raw !== "string") return undefined;

  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === ".next") return undefined;
  if (path.isAbsolute(trimmed)) return undefined;

  const normalized = trimmed.replaceAll("\\", "/");
  const posixNormalized = path.posix.normalize(normalized);
  if (
    posixNormalized === "" ||
    posixNormalized === "." ||
    posixNormalized === ".." ||
    posixNormalized.startsWith("../") ||
    posixNormalized.includes("/../")
  ) {
    return undefined;
  }

  return posixNormalized;
}

const distDir = resolveDistDirFromEnv();
const isProduction = process.env.NODE_ENV === "production"

function buildCsp() {
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    // Next.js dev runtime may require eval; keep it out of prod.
    ...(isProduction ? [] : ["'unsafe-eval'"]),
  ].join(" ")

  return [
    `default-src 'self'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data: https:`,
    `style-src 'self' 'unsafe-inline'`,
    `script-src ${scriptSrc}`,
    `connect-src 'self' https: wss:`,
    `frame-src 'self'`,
    `worker-src 'self' blob:`,
  ].join("; ")
}

const nextConfig: NextConfig = {
  ...(distDir ? { distDir } : {}),
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  async headers() {
    const csp = buildCsp()
    const securityHeaders = [
      { key: "Content-Security-Policy", value: csp },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=()",
      },
      ...(isProduction
        ? [
            {
              key: "Strict-Transport-Security",
              value: "max-age=31536000; includeSubDomains; preload",
            },
          ]
        : []),
    ]

    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ]
  },
  webpack(config) {
    config.resolve.alias["@prisma/client"] = path.resolve(
      __dirname,
      "src/generated/prisma/client"
    )
    return config
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

export default withNextIntl(nextConfig);
