# Performance Audit (2026-01-03)

> 目的：在 30–300 人协作场景下，优先避免“无界查询/无界列表”导致的数据库与渲染压力。
> 说明：这是启发式静态审计：当前仅聚焦 Prisma `findMany` 是否显式限制（`take/cursor/skip`）。

## Summary
- scanned files: 47
- prisma findMany calls: 99
- unbounded findMany candidates: 0

## Candidates

- ✅ None
