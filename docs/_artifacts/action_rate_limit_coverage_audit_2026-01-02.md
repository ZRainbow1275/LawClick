# Action Rate Limit Coverage Audit (2026-01-02)

> 目的：发现“导出的 Server Actions 缺少 Rate Limiting”的入口，避免在 30–300 人规模下出现滥用/高频请求导致的系统不稳定。
> 方法：TypeScript AST 扫描 `src/actions/*.ts` 的导出 async 函数（function / async arrow），检查函数体内是否存在 `checkRateLimit(...)` 或 `enforceActionRateLimit(...)` 调用。

## Summary
- action exports scanned: 230
- rate-limited: 230
- missing rate limit: 0

## Missing Rate Limit

- ✅ None

