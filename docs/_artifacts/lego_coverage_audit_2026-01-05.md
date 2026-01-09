# Lego Coverage Audit (2026-01-05)

> 目的：枚举“固定网格/卡片栏 + Card”热点，作为下一步把更多卡片栏/分栏拆成可拖拽 `SectionWorkspace`/`LegoDeck` 的待办清单。
> 说明：这是静态扫描（TSX AST 解析：定位布局容器（grid-cols / flex-row|col）并统计其子树中的 <Card> 数量），仍可能存在误报/漏报；用于指导改造优先级，不作为门禁。

## Summary
- total .tsx files: 205
- scanned .tsx files: 108
- skipped ui/layout .tsx files: 40
- skipped (already using Page/SectionWorkspace or LegoDeck): 57
- mode: skip-workspace (use --include-workspace to include all)
- mode: skip-ui (use --include-ui to include src/components/ui/*)
- candidate fixed card grids: 0

## Candidates

- ✅ None
