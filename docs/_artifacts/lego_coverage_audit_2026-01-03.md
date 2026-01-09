# Lego Coverage Audit (2026-01-03)

> 目的：枚举“固定网格/卡片栏 + Card”热点，作为下一步把更多卡片栏/分栏拆成可拖拽 `SectionWorkspace`/`LegoDeck` 的待办清单。
> 说明：这是静态扫描（TSX AST 解析：定位布局容器（grid-cols / flex-row|col）并统计其子树中的 <Card> 数量），仍可能存在误报/漏报；用于指导改造优先级，不作为门禁。

## Summary
- total .tsx files: 199
- scanned .tsx files: 159
- skipped ui/layout .tsx files: 40
- skipped (already using Page/SectionWorkspace or LegoDeck): 0
- mode: include-workspace (use --include-workspace to include all)
- mode: skip-ui (use --include-ui to include src/components/ui/*)
- candidate fixed card grids: 6

## Candidates

- `src/components/dashboard/widgets/TimeSummaryWidget.tsx:35` (2 cards) <div className="grid grid-cols-2 gap-3">
- `src/components/documents/DocumentListClient.tsx:433` (2 cards) <div className="flex flex-col md:flex-row items-start md:items-center gap-4 bg-card p-4 rounded-lg border shadow-sm">
- `src/components/finance/ContractDetailClient.tsx:73` (4 cards) <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
- `src/components/finance/ContractDetailClient.tsx:96` (2 cards) <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
- `src/components/tasks/TaskKanban.tsx:934` (2 cards) <div className="h-[calc(100vh-260px)] flex flex-col gap-3">
- `src/components/team/UserDetailClient.tsx:146` (7 cards) <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
