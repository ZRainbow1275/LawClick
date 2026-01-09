# Database Design Audit (2026-01-04)

> 目的：面向 30–300 人规模：尽量保证常用外键（*Id）有索引，避免热路径全表扫描。
> 说明：这是启发式审计（schema 静态扫描），并不等同于实际查询计划分析；候选项需结合真实查询确认。

## Summary
- models: 53
- index candidates (*Id fields missing @@index): 0

## Candidates

- ✅ None
