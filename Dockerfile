# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY lawclick-next/package.json lawclick-next/package.json
COPY lawclick-next/prisma lawclick-next/prisma
COPY lawclick-next/prisma.config.ts lawclick-next/prisma.config.ts
RUN mkdir -p lawclick-next/src/generated/prisma
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm -C lawclick-next prisma:generate
RUN pnpm -C lawclick-next build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build /app/lawclick-next ./lawclick-next

EXPOSE 3000
CMD ["pnpm", "-C", "lawclick-next", "start", "-p", "3000"]
