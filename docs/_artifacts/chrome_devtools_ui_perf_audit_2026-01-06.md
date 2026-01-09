# Chrome DevTools UI/性能抽检（2026-01-06）

> 目标：按要求使用真实浏览器验证 UI/UX 与“全站可拖拽组件化（便当盒/磁吸/分栏）”关键交互的可达性，并对关键页做一次性能采样（非基准）。

## 环境

- App：`lawclick-next`（Next.js App Router）
- 启动方式：`pnpm dev`（脚本自动选端口，本次为 `http://localhost:3010`）
- 数据库：docker compose `lawclick-postgres`（5434），`prisma migrate deploy` 无待应用迁移

## UI/UX 抽检结果

### 1) 仪表盘 `/dashboard`

- 验证点：页面级 DIY/拖拽入口存在（“调整本页组件布局（跨设备记忆）”“编辑布局”）
- 结果：通过
- 截图：`docs/_artifacts/devtools_dashboard_2026-01-06.png`

### 2) 任务中心 `/tasks`

- 验证点：页面级 DIY/拖拽入口存在（“调整本页组件布局（跨设备记忆）”“编辑布局”）
- 结果：通过
- 截图：`docs/_artifacts/devtools_tasks_page_2026-01-06.png`

## 性能采样（非基准）

> 说明：本次采样在 **Dev Server** + 本机环境下进行，数据用于发现明显瓶颈线索，不作为生产性能承诺。

### `/dashboard`（一次 reload trace）

- LCP：2213ms
- CLS：0.00
- TTFB：1106ms
- Render delay：1107ms

**DocumentLatency Insight**
- 首请求无重定向：通过
- Server responded quickly（<=600ms）：未通过（TTFB 1106ms）
- Compression applied：未通过（dev 环境常见）

