# Action Rate Limit Coverage Audit (2026-01-04)

> 目的：发现“导出的 Server Actions 缺少 Rate Limiting”的入口，避免在 30–300 人规模下出现滥用/高频请求导致的系统不稳定。
> 方法：TypeScript AST 扫描 `src/actions/*.ts` 的导出 async 函数（function / async arrow），检查函数体内是否存在 `checkRateLimit(...)` / `enforceActionRateLimit(...)` / `enforceRateLimit(...)` 调用。
> 补充：若 action 仅为薄 wrapper 且调用了 import 的 `*Impl`（或同类 server-only 函数），则进一步解析该被调用函数体内是否存在限流调用。

## Summary
- action exports scanned: 233
- rate-limited (direct): 221
- rate-limited (via delegation): 12
- rate-limited (total): 233
- missing rate limit: 0

## Missing Rate Limit

- ✅ None

