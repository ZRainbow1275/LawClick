# Floating Lego Block Audit (2026-01-04)

> 目的：用“可证据复跑”的方式证明：任意 SectionWorkspace/LegoDeck 区块都可一键“弹出为浮窗”，并复用既有磁吸/分屏（dock-snap）能力；避免只停留在“可拖拽布局”层面的伪乐高化。
> 说明：该审计为静态审计（不启动 Web/DB），主要验证关键拼图是否齐备、入口是否覆盖。

## Summary
- checks: 13
- failures: 0

## Checks

- ✅ file:FloatingLegoBlock.tsx — 浮窗渲染组件存在
- ✅ file:lego-block-registry-store.ts — 运行期 registry（非持久化）存在
- ✅ file:floating-windows.ts — 浮窗数据 schema（Zod）存在
- ✅ float-store:WindowType includes LEGO_BLOCK — float store 支持 LEGO_BLOCK window type
- ✅ float-store:default size — LEGO_BLOCK 默认尺寸已定义
- ✅ float-store:default position — LEGO_BLOCK 默认位置已定义
- ✅ FloatingLayer:switch case LEGO_BLOCK — 浮窗层能渲染 LEGO_BLOCK 内容
- ✅ SectionWorkspace:open button coverage — SectionWorkspace 内至少两处“在浮窗打开”入口（cover card/none 两种 chrome） (count=2)
- ✅ SectionWorkspace:openWindow type — SectionWorkspace 打开浮窗时使用 LEGO_BLOCK 类型
- ✅ PageWorkspace:open button coverage — PageWorkspace 内至少两处“在浮窗打开”入口（cover card/none 两种 chrome） (count=2)
- ✅ PageWorkspace:openWindow type — PageWorkspace 打开浮窗时使用 LEGO_BLOCK 类型
- ✅ floating-windows:SECTION_BLOCK schema — 浮窗 data schema 使用判别字段 kind=SECTION_BLOCK
- ✅ floating-windows:PAGE_WIDGET schema — 浮窗 data schema 支持 kind=PAGE_WIDGET（页面级 widget）
