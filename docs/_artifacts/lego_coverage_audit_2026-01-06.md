# Lego Coverage Audit (2026-01-06)

> 目的：枚举“固定网格/卡片栏 + Card”热点，作为下一步把更多卡片栏/分栏拆成可拖拽 `SectionWorkspace`/`LegoDeck` 的待办清单。
> 说明：这是静态扫描（TSX AST 解析：定位布局容器（grid-cols / flex-row|col）并统计其子树中的 <Card> 数量），仍可能存在误报/漏报；用于指导改造优先级，不作为门禁。

## Summary
- total .tsx files: 212
- scanned .tsx files: 114
- skipped ui/layout .tsx files: 40
- skipped (already using Page/SectionWorkspace or LegoDeck): 58
- mode: skip-workspace (use --include-workspace to include all)
- mode: skip-ui (use --include-ui to include src/components/ui/*)
- candidate fixed card grids: 1

## Candidates

- `src/components/ai/AiHeaderPanel.tsx:44` (3 cards) <div className="mt-3 grid gap-3 md:grid-cols-3">
