# Code Structure Audit (2026-01-03)

> 目的：以“可维护性/一致性/规模化(30–300人)”为目标，对代码结构做轻量静态审计。
> 说明：这是结构审计（非功能门禁）。发现项用于指导重构与治理优先级。

## Summary
- scanned source files: 359
- large files (>=900 lines): 4
- non-kebab action files: 0
- non-pascal component files: 0
- non-pascal app special files: 0

## Large Files (>=900 lines)

- `src/actions/tasks-crud.ts` (1924 lines)
- `src/actions/documents.ts` (1715 lines)
- `src/actions/timelogs-crud.ts` (1579 lines)
- `src/components/tasks/TaskKanban.tsx` (1325 lines)

## Action File Naming (kebab-case.ts)

- ✅ None

## Component File Naming (PascalCase.tsx)

- ✅ None

## App Route Special Files (allowed)

- ✅ None
