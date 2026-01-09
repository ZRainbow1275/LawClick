# API Design Consistency Audit (2026-01-06)

> 目的：Route Handlers（`src/app/api/**/route.ts`）在鉴权/限流/输入校验/运行时配置上保持一致。
> 说明：这是启发式静态审计，用于暴露“潜在不一致风险”，不替代人工安全审计。

## Summary
- route files: 6
- offenders: 0

## Results

- `src/app/api/auth/[...nextauth]/route.ts:1` ✅ OK
- `src/app/api/documents/[id]/file/route.ts:1` ✅ OK
- `src/app/api/health/route.ts:1` ✅ OK
- `src/app/api/queue/process/route.ts:1` ✅ OK
- `src/app/api/realtime/signals/route.ts:1` ✅ OK
- `src/app/api/team/[id]/vcard/route.ts:1` ✅ OK
