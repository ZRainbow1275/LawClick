# 修复开发工作记录（对齐审计方向）_2026-01-06

> 参照：
> - `docs/批判性13维度深度审计报告_2026-01-04.md`
> - `docs/法律文书模板完整清单_2026-01-04.md`
> - `docs/DESIGN_HANDBOOK.md`（便当盒/磁吸/分屏/乐高化）
>
> 范围：`lawclick-next/`（Web 主线），Rust 原型仅做“漂移风险”治理校验，不作为主线交付。

---

## 0. 不可违背的约束（AGENTS.md）

- 禁止 Mock / 占位壳：所有入口必须真实落库、真实权限、真实错误处理。
- 强类型 + 防御性：输入用 Zod 严格校验；避免 `any`；异常在边界显式捕获并返回业务语义错误。
- 一致性优先：权限逻辑、API 形态、日志/错误模式、限流策略必须统一。

---

## 1. 关键需求对齐结论（本轮关注“真实功能缺口”）

### 1.1 全站 Widget 拖拽（不仅仪表盘）

- 主线 `(dashboard)` 全部页面由 `PageWorkspace` 包裹：`lawclick-next/src/app/(dashboard)/layout.tsx`。
- `PageWorkspace` 对每个 pathname 生成独立 workspaceKey，并默认提供 `w_page`（页面主体）+ 可加挂的通用组件库（计时器、通知、任务、调度热力图等），实现“乐高化/便当盒化”的全局一致体验：`lawclick-next/src/components/layout/PageWorkspace.tsx`。
- “实时在线编辑工作台”明确保留为外部项目占位与入口，不在本项目实现协作编辑内核：`lawclick-next/src/components/documents/DocumentWorkbenchWorkspaceClient.tsx`。

### 1.2 30–300 人规模调度/泳道支持

- 前端泳道选择上限明确为 300，并采用虚拟列表渲染（`@tanstack/react-virtual`）以支持大团队：`lawclick-next/src/components/dispatch/DispatchScheduleBoardClient.tsx`。
- 后端团队状态查询默认 `take=300`（并做 Zod 校验），与前端上限对齐：`lawclick-next/src/actions/collaboration-actions.ts`。

### 1.3 员工名片功能

- 成员名片页面 + vCard API 已为端到端真实实现（非占位），并纳入统一限流：`lawclick-next/src/app/(dashboard)/team/[id]/card/page.tsx`、`lawclick-next/src/app/api/team/[id]/vcard/route.ts`。

### 1.4 诉讼/非诉阶段文书模板完整性（以 86 种清单为准）

- `docs/法律文书模板完整清单_2026-01-04.md`（86 种）与内置模板库实现（86 条）一致，作为“生产对齐”基线：`lawclick-next/src/lib/templates/builtin/builtin-document-templates.ts`。
- 新租户创建时自动落库全套内置模板（避免“租户没有模板导致功能空壳”）：`lawclick-next/src/actions/tenant-actions.ts`。
- 阶段文书类型到默认模板码映射补齐关键缺口（例如网上立案截图 → L-16）：`lawclick-next/src/lib/templates/stage-document-template-map.ts`。

---

## 2. 本次修复（聚焦审计提出的“体验断链/误导性 AI 暗示/缺少治理指引”）

### 2.1 移除“模板功能”的 AI 暗示（Sparkles），并补齐“无默认模板”的明确提示

问题：模板起草/相似案件等能力属于规则/模板/数据匹配，不应使用强 AI 暗示视觉（`Sparkles`），否则与“AI 功能略掉”的产品策略冲突，且用户容易误解为 LLM 生成。

修复：
- 阶段文书“模板起草”按钮与提交按钮改用 `FilePenLine`，并在弹窗内明确展示“默认模板提示”（来自系统映射或标签 template:*）；若无默认模板，明确告知“通常为上传材料，可手动选模板写备注”：`lawclick-next/src/components/cases/StageDocumentChecklist.tsx`。
- 新建草稿（模板生成文档）按钮移除 `Sparkles`，使用 `FilePlus`：`lawclick-next/src/components/cases/NewDraftDialog.tsx`。
- 相似案件模块移除 `Sparkles`，使用 `Search`：`lawclick-next/src/components/cases/SimilarCasesBlock.tsx`。
- 模板起草弹窗在“存在推荐模板码但模板库未启用/不存在”时显示明确提示，避免用户困惑（例如历史标签 template:CODE 失效）：`lawclick-next/src/components/documents/DocumentTemplateDraftDialog.tsx`。

### 2.2 阶段文书默认模板映射审计脚本：输出可执行的治理结论

问题：仅列出“未映射类型”不足以指导治理；需要区分“应当上传的材料（无模板）”与“应当有默认模板的文书（需要补映射）”，并给出定位入口。

修复：
- 在 `lawclick-next/scripts/stage-document-template-map-audit.js` 中新增：
  - “预期 upload-only”白名单（显式记录产品决策）。
  - 将 unmapped 拆分为“Expected Upload-Only”与“Needs Decision / Mapping”两类。
  - 为每个未映射类型输出其在 stage config 中的文件与行号引用，直接可定位修复点。
  - 对“Needs Decision / Mapping”类出现时返回非 0 退出码，防止回归引入真实缺口。

---

## 3. 回归验证（本轮执行的门禁/证据）

### 3.1 代码质量门禁

- `pnpm -C lawclick-next lint` ✅
- `pnpm -C lawclick-next type-check` ✅

### 3.2 审计脚本（输出均落在 `docs/_artifacts/`）

- 模板库覆盖：`docs/_artifacts/template_library_coverage_audit_2026-01-06.md`（86/86）✅
- 阶段映射审计：`docs/_artifacts/stage_document_template_map_audit_2026-01-06.md`（“needs decision”=0）✅
- Action 限流覆盖：`docs/_artifacts/action_rate_limit_coverage_audit_2026-01-06.md`（missing=0）✅
- 错误处理/日志一致性：`docs/_artifacts/error_logging_audit_2026-01-06.md`（findings=0）✅
- UI 禁用/占位按钮：`docs/_artifacts/ui_disabled_buttons_audit_2026-01-06.md`（candidates=0）✅
- 路由断链：执行 `node lawclick-next/scripts/route-audit.js`，控制台输出 OK ✅
- 权限同步：执行 `node lawclick-next/scripts/permissions-sync-audit.js`，missing/extra=0 ✅
- 双 ORM 漂移风险：`docs/_artifacts/orm_entity_sync_audit_2026-01-06.md`（rust missing in prisma=0）✅
- API 设计一致性：`docs/_artifacts/api_design_audit_2026-01-06.md`（offenders=0）✅
- API surface 冲突：`docs/_artifacts/api_surface_audit_2026-01-06.md`（conflicts=0）✅
- 乐高化深度：`docs/_artifacts/lego_diy_depth_audit_2026-01-06.md`（thin=0）✅
- Floating Lego Block 检查：`docs/_artifacts/floating_lego_block_audit_2026-01-06.md`（failures=0）✅

---

## 4. 明确保留的“占位”范围（符合产品要求）

- “实时在线编辑工作台”：仅保留占位与外部入口（可配置工具模块 URL），不在本项目内实现协同编辑引擎。
  - 入口：`/documents/:id/workbench`
  - 代码：`lawclick-next/src/components/documents/DocumentWorkbenchWorkspaceClient.tsx`

---

## 5. 已知风险与后续建议（不做 Mock，不做空壳）

- 阶段文书“未映射默认模板”的类型目前均被标记为“预期 upload-only”，且审计报告输出其定位行号；若未来产品希望对其中某类提供模板草稿，应：
  1) 先在 `docs/法律文书模板完整清单_2026-01-04.md` 增补条目；
  2) 同步到 `builtin-document-templates.ts`；
  3) 再补齐 `stage-document-template-map.ts` 映射；
  4) 通过 `stage-document-template-map-audit.js` 自动验收。
