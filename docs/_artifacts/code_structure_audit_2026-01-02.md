# Code Structure Audit (2026-01-02)

> 目的：以“可维护性/一致性/规模化(30–300人)”为目标，对代码结构做轻量静态审计。
> 说明：这是结构审计（非功能门禁）。发现项用于指导重构与治理优先级。

## Summary
- scanned source files: 343
- large files (>=900 lines): 11
- non-kebab action files: 0
- non-pascal component files: 50
- non-pascal app special files: 0

## Large Files (>=900 lines)

- `src/actions/tasks-crud.ts` (1893 lines)
- `src/actions/documents.ts` (1705 lines)
- `src/actions/timelogs-crud.ts` (1573 lines)
- `src/components/tasks/TaskKanban.tsx` (1325 lines)
- `src/actions/tenant-actions.ts` (1157 lines)
- `src/app/(dashboard)/tools/page.tsx` (1124 lines)
- `src/actions/collaboration-actions.ts` (1102 lines)
- `src/components/cases/CaseDetailClient.tsx` (1092 lines)
- `src/actions/cases-crud.ts` (1065 lines)
- `src/actions/event-actions.ts` (959 lines)
- `src/components/documents/DocumentListClient.tsx` (902 lines)

## Action File Naming (kebab-case.ts)

- ✅ None

## Component File Naming (PascalCase.tsx)

- `src/components/cases/new-draft-dialog.tsx`
- `src/components/features/case-kanban.tsx`
- `src/components/features/conflict-check-wizard.tsx`
- `src/components/features/new-case-wizard.tsx`
- `src/components/features/rbac-verification.tsx`
- `src/components/features/team-heatmap.tsx`
- `src/components/features/timesheet/timesheet-calendar.tsx`
- `src/components/floating/ai-assistant-content.tsx`
- `src/components/floating/floating-chat.tsx`
- `src/components/floating/timer-content.tsx`
- `src/components/layout/app-header.tsx`
- `src/components/layout/app-sidebar.tsx`
- `src/components/layout/floating-launcher.tsx`
- `src/components/layout/floating-layer.tsx`
- `src/components/layout/floating-window-frame.tsx`
- `src/components/layout/header-components.tsx`
- `src/components/layout/page-workspace.tsx`
- `src/components/layout/role-context.tsx`
- `src/components/layout/section-workspace.tsx`
- `src/components/layout/ui-preferences-provider.tsx`
- `src/components/layout/workspace-header.tsx`
- `src/components/providers/session-provider.tsx`
- `src/components/ui/alert-dialog.tsx`
- `src/components/ui/avatar.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/calendar.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/command.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/dropdown-menu.tsx`
- `src/components/ui/glass-panel.tsx`
- `src/components/ui/hover-card.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/label.tsx`
- `src/components/ui/popover.tsx`
- `src/components/ui/progress.tsx`
- `src/components/ui/radio-group.tsx`
- `src/components/ui/scroll-area.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/separator.tsx`
- `src/components/ui/sheet.tsx`
- `src/components/ui/sidebar.tsx`
- `src/components/ui/skeleton.tsx`
- `src/components/ui/sonner.tsx`
- `src/components/ui/switch.tsx`
- `src/components/ui/table.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/ui/tooltip.tsx`

## App Route Special Files (allowed)

- ✅ None
