# Business Logic Completeness Audit (2026-01-02)

> 目的：以“功能真实闭环/前后端一致性/无占位”为标准，复跑关键门禁并汇总证据。
> 说明：本脚本负责“聚合复跑”。具体问题明细请打开各自产物。

## Summary
- steps: 6
- artifacts: 5

## Artifacts

- `docs/_artifacts/action_rate_limit_coverage_audit_2026-01-02.md`
- `docs/_artifacts/action_result_shape_audit_2026-01-02.md`
- `docs/_artifacts/actions_ui_invocation_audit_2026-01-02.md`
- `docs/_artifacts/lego_diy_coverage_audit_all_2026-01-02.md`
- `docs/_artifacts/ui_disabled_buttons_audit_2026-01-02.md`

## Run Log

### Actions↔UI 真实调用覆盖

- exit code: 0

```
node scripts/actions-ui-invocation-audit.js
```

#### stdout

```
[actions-ui-invoke] actions exports: 230
[actions-ui-invoke] scanned src files: 343
[actions-ui-invoke] UI-invoked: 230
[actions-ui-invoke] UI-referenced-only: 0
[actions-ui-invoke] no UI usage: 0
[actions-ui-invoke] wrote: docs\_artifacts\actions_ui_invocation_audit_2026-01-02.md
```

### UI 禁用/占位按钮审计

- exit code: 0

```
node scripts/ui-disabled-actions-audit.js
```

#### stdout

```
[ui-disabled-buttons] scanned tsx files: 166
[ui-disabled-buttons] candidates: 0
[ui-disabled-buttons] wrote: docs\_artifacts\ui_disabled_buttons_audit_2026-01-02.md
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
[action-rate-limit] wrote: docs\_artifacts\action_rate_limit_coverage_audit_2026-01-02.md
```

### Actions 返回形状一致性

- exit code: 0

```
node scripts/action-result-shape-audit.js
```

#### stdout

```
[action-result-shape] offenders: 0
[action-result-shape] wrote: docs\_artifacts\action_result_shape_audit_2026-01-02.md
```

### 全站乐高化 DIY 覆盖

- exit code: 0

```
node scripts/lego-diy-coverage-audit.js --all-app
```

#### stdout

```
[lego-diy] pages: 47
[lego-diy] direct: 12
[lego-diy] via-component: 28
[lego-diy] via-layout: 3
[lego-diy] redirect-only: 4
[lego-diy] unknown: 0
[lego-diy] wrote: docs\_artifacts\lego_diy_coverage_audit_all_2026-01-02.md
```

### 路由断链审计

- exit code: 0

```
node scripts/route-audit.js
```

#### stdout

```
[route-audit] app routes: 51
[route-audit] route refs: 160 (unique: 76)
[route-audit] OK: 未发现断链路由引用
```
