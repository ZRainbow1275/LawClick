# Lego Freeform Coverage Audit (2026-01-03)

> 目的：发现“非 grid 的固定卡片堆叠/分栏”（如 space-y/divide-y/flex-col）作为下一步把这些分区拆成可拖拽 `SectionWorkspace`/`LegoDeck` blocks 的待办清单。
> 说明：这是静态扫描（TSX AST：定位容器布局 className，并统计其子树内 `<Card>`（排除 `SectionWorkspace`/`LegoDeck`/`PageWorkspace` 子树）），仍可能存在误报/漏报；用于指引改造优先级，不作为门禁。

## Summary
- total .tsx files: 199
- scanned .tsx files: 159
- skipped ui/layout .tsx files: 40
- skipped workspace .tsx files: 0
- mode: include-workspace (use --include-workspace to include all)
- mode: skip-ui (use --include-ui to include src/components/ui/*)
- candidates: 7

## Candidates

- `src/components/admin/DocumentTemplatesClient.tsx:212` (cards:2) <div className="p-6 space-y-6">
- `src/components/admin/RecycleBinClient.tsx:103` (cards:2) <div className="space-y-6">
- `src/components/calendar/CanvasCalendar.tsx:414` (cards:5) <div className="space-y-4 h-full flex flex-col">
- `src/components/calendar/EventDetailDialog.tsx:227` (cards:3) <div className="space-y-4">
- `src/components/dashboard/widgets/TimeSummaryWidget.tsx:21` (cards:3) <div className="space-y-3">
- `src/components/features/CaseKanban.tsx:169` (cards:2) <div
- `src/components/team/UserDetailClient.tsx:132` (cards:7) <div className="space-y-3">
