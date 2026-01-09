# Actions ↔ UI 调用覆盖审计（2026-01-06）

> 目的：枚举「Server Actions 已导出但 UI 未真实调用/绑定」的缺口，避免仅 import/仅引用导致的“伪覆盖”。
> 方法：TypeScript AST 扫描。统计以下“调用入口”：直接调用 `action()`、绑定 `action.bind()`、JSX `action/formAction` 属性。

## Summary
- actions exports: 233
- scanned src files: 481
- UI-invoked exports: 233
- UI-referenced-only exports: 0
- no UI usage exports: 0

## ⚠️ UI 仅引用未调用（可能缺接线）

- ✅ None

## ❌ 无 UI 使用（可能缺入口/或应取消导出）

- ✅ None

