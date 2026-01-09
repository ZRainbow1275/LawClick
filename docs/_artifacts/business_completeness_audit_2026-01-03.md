# Business Logic Completeness Audit (2026-01-03)

> 目的：以“功能真实闭环/前后端一致性/无占位”为标准，复跑关键门禁并汇总证据。
> 说明：本脚本负责“聚合复跑”。具体问题明细请打开各自产物。

## Summary
- steps: 9
- artifacts: 8

## Artifacts

- `docs/_artifacts/action_rate_limit_coverage_audit_2026-01-03.md`
- `docs/_artifacts/action_result_shape_audit_2026-01-03.md`
- `docs/_artifacts/actions_ui_invocation_audit_2026-01-03.md`
- `docs/_artifacts/lego_coverage_audit_2026-01-03.md`
- `docs/_artifacts/lego_diy_coverage_audit_all_2026-01-03.md`
- `docs/_artifacts/lego_diy_depth_audit_2026-01-03.md`
- `docs/_artifacts/lego_freeform_coverage_audit_2026-01-03.md`
- `docs/_artifacts/ui_disabled_buttons_audit_2026-01-03.md`

## Run Log

### Actions↔UI 真实调用覆盖

- exit code: 0

```
node scripts/actions-ui-invocation-audit.js
```

#### stdout

```
[actions-ui-invoke] actions exports: 230
[actions-ui-invoke] scanned src files: 358
[actions-ui-invoke] UI-invoked: 230
[actions-ui-invoke] UI-referenced-only: 0
[actions-ui-invoke] no UI usage: 0
[actions-ui-invoke] wrote: docs\_artifacts\actions_ui_invocation_audit_2026-01-03.md
```

### UI 禁用/占位按钮审计

- exit code: 0

```
node scripts/ui-disabled-actions-audit.js
```

#### stdout

```
[ui-disabled-buttons] scanned tsx files: 171
[ui-disabled-buttons] candidates: 0
[ui-disabled-buttons] wrote: docs\_artifacts\ui_disabled_buttons_audit_2026-01-03.md
```

### Actions 限流覆盖

- exit code: 0

```
node scripts/action-rate-limit-coverage-audit.js
```

#### stdout

```
[action-rate-limit] exports: 230
[action-rate-limit] missing: 0
[action-rate-limit] wrote: docs\_artifacts\action_rate_limit_coverage_audit_2026-01-03.md
```

### Actions 返回形状一致性

- exit code: 0

```
node scripts/action-result-shape-audit.js
```

#### stdout

```
[action-result-shape] offenders: 0
[action-result-shape] wrote: docs\_artifacts\action_result_shape_audit_2026-01-03.md
```

### 全站乐高化 DIY 覆盖

- exit code: 0

```
node scripts/lego-diy-coverage-audit.js --all-app
```

#### stdout

```
[lego-diy] scope: all
[lego-diy] pages: 47
[lego-diy] direct: 11
[lego-diy] via-component: 29
[lego-diy] via-layout: 3
[lego-diy] redirect-only: 4
[lego-diy] unknown: 0
[lego-diy] wrote: docs\_artifacts\lego_diy_coverage_audit_all_2026-01-03.md
```

### 全站乐高化 DIY 深度审计

- exit code: 0

```
node scripts/lego-diy-depth-audit.js
```

#### stdout

```
[lego-diy-depth] instances: 79
[lego-diy-depth] SectionWorkspace: 50
[lego-diy-depth] LegoDeck: 29
[lego-diy-depth] thin: 0
[lego-diy-depth] unknown: 13
[lego-diy-depth] wrote: docs\_artifacts\lego_diy_depth_audit_2026-01-03.md
```

### 固定卡片网格残留审计

- exit code: 0

```
node scripts/lego-coverage-audit.js --include-workspace
```

#### stdout

```
[lego-coverage] total tsx files: 199
[lego-coverage] scanned tsx files: 159
[lego-coverage] skipped ui/layout tsx files: 40
[lego-coverage] skipped workspace tsx files: 0
[lego-coverage] candidate grids: 0
[lego-coverage] wrote: docs\_artifacts\lego_coverage_audit_2026-01-03.md
```

### 固定堆叠卡片栏残留审计

- exit code: 0

```
node scripts/lego-freeform-coverage-audit.js --include-workspace
```

#### stdout

```
[lego-freeform] total tsx files: 199
[lego-freeform] scanned tsx files: 159
[lego-freeform] skipped ui/layout tsx files: 40
[lego-freeform] skipped workspace tsx files: 0
[lego-freeform] candidates: 0
[lego-freeform] wrote: docs\_artifacts\lego_freeform_coverage_audit_2026-01-03.md
```

### 路由断链审计

- exit code: 0

```
node scripts/route-audit.js
```

#### stdout

```
[route-audit] app routes: 51
[route-audit] route refs: 168 (unique: 78)
[route-audit] OK: 未发现断链路由引用
```
