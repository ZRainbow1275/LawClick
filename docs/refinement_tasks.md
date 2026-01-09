# 任务清单 Refinement Task List (V9)

**来源**: Critical Audit & Review

## 1. 高优先级 (Blockers / 阻碍性问题)
- [x] **Database Sync**: 修复 `taskQueue` 类型错误 (Done: `prisma generate`).
- [x] **Dispatch Route**: 修复 404 错误 (Done: Server Restart).
- [x] **Smart Draft UI**: 验证组件存在.
- [x] **Code Build**: 修复 `DocumentListClient` 导入错误 (Done: Added `uploadDocument`).

## 2. P2 体验优化 (UI/UX Polish)
- [ ] **Dialog Motion**: 为所有弹窗 (`NewDraftDialog`) 增加 `Framer Motion` 进出场动画.
- [ ] **Empty States**: 为 Dispatch 看板和 Similar Cases 增加空状态插画 (SVG).
- [ ] **Dispatch Feedback**: 拖拽案件时增加 `Sonner` 反馈.

## 3. P3 代码质量 (Code Quality)
- [x] **Type Safety**: 修复 `auth.ts` 中的 User 类型不匹配警告 (Done).
- [x] **Clean Up**: 清理 `queue.ts` 的未使用引用 (Done).
