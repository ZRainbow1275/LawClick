# Dependency Health Audit (2026-01-03)

> 目的：依赖项健康度审计（漏洞/过期）。
> 说明：依赖审计结果与 registry/锁文件有关；本文件记录“当下”输出，供后续升级闭环。

## pnpm audit --json

- exit code: 0

```
pnpm audit --json
```

### stdout

```json
{
  "actions": [],
  "advisories": {},
  "muted": [],
  "metadata": {
    "vulnerabilities": {
      "info": 0,
      "low": 0,
      "moderate": 0,
      "high": 0,
      "critical": 0
    },
    "dependencies": 949,
    "devDependencies": 0,
    "optionalDependencies": 0,
    "totalDependencies": 949
  }
}
```

## pnpm outdated

- exit code: 1

```
pnpm outdated
```

### stdout

```
┌───────────────────┬──────────┬─────────┐
│ Package           │ Current  │ Latest  │
├───────────────────┼──────────┼─────────┤
│ @prisma/client    │ 5.22.0   │ 7.2.0   │
├───────────────────┼──────────┼─────────┤
│ @types/node (dev) │ 20.19.27 │ 25.0.3  │
├───────────────────┼──────────┼─────────┤
│ prisma            │ 5.22.0   │ 7.2.0   │
├───────────────────┼──────────┼─────────┤
│ lucide-react      │ 0.555.0  │ 0.562.0 │
└───────────────────┴──────────┴─────────┘
```

