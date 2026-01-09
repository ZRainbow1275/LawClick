# LawClick_NEW（主线：lawclick-next/）A3 红队审计报告（D1）

  范围：仅审计 lawclick-next/（Next.js App Router + Prisma）。src/ Rust prototype、apps/mobile/ 仅记录维护风险不深挖。
  约束：本次已在本地启动依赖并复跑门禁（pnpm/docker/prisma/playwright）；关键命令输出与证据已落盘，见文末“修复闭环（2026-01-07）”。

  ———

  ## P0/P1 Top 10（先刺痛）

  1. LC-AUDIT-001（P0｜权限与安全）“停用成员”在登录自愈里被强行改回 ACTIVE：等于没有离职/禁用

  - 证据：lawclick-next/src/lib/server-auth.ts:331、lawclick-next/src/lib/server-auth.ts:370、lawclick-next/src/lib/
    server-auth.ts:399、lawclick-next/src/lib/server-auth.ts:414
  - 刺点：你以为有 TenantMembershipStatus.DISABLED，但登录路径会把它写回 ACTIVE，任何“停用”都不可信。

  2. LC-AUDIT-002（P0｜权限与安全/数据隔离）开放注册直落库进 default-tenant：公网=自助入侵/混租

  - 证据：lawclick-next/src/app/(auth)/auth/register/page.tsx:7、lawclick-next/src/actions/auth.ts:94、lawclick-next/
    src/actions/auth.ts:118、lawclick-next/src/lib/server-auth.ts:10、lawclick-next/src/lib/server-auth.ts:328、
    lawclick-next/prisma/schema.prisma:541、lawclick-next/prisma/schema.prisma:543
  - 刺点：你在做“真多租户”，但默认行为把所有新用户塞进同一租户（除非你靠环境变量/手动流程兜底）。

  3. LC-AUDIT-003（P0｜权限与安全）Credentials 登录在 NODE_ENV=development 时可给 password=null 账号写入任意密码

  - 证据：lawclick-next/src/auth.ts:54、lawclick-next/src/auth.ts:60
  - 刺点：只要环境误配或出现 password 为空的存量账号，就变成“用任意密码接管账号”的后门。

  4. LC-AUDIT-004（P0｜权限与安全）Webhook SSRF 防护可被 30x 重定向绕过（默认 follow redirect）

  - 证据：lawclick-next/src/lib/webhook-safety.ts:85、lawclick-next/src/lib/job-handlers.ts:194
  - 刺点：你只校验了“初始 URL”，但 fetch 默认会跟随跳转；allowlist 主机完全可能 302 到内网/metadata。

  5. LC-AUDIT-005（P0｜权限与安全/治理）多租户强门禁可被 LAWCLICK_ALLOW_UNSCOPED_TENANT_QUERIES=1 一键关掉

  - 证据：lawclick-next/src/lib/prisma.ts:19、lawclick-next/src/lib/prisma.ts:213
  - 刺点：这是“灾难开关”。一旦生产误配=跨租户读写不再被拦，且很难靠测试发现。

  6. LC-AUDIT-006（P1｜功能闭环/权限）路由访问控制“双源漂移”：middleware 用 canAccessPage，页面又用
     requireTenantPermission

  - 证据：lawclick-next/src/proxy.ts:38、lawclick-next/src/lib/permissions.ts:260、lawclick-next/src/app/(dashboard)/
    dispatch/page.tsx:21、lawclick-next/src/components/layout/AppSidebar.tsx:84
  - 刺点：会出现“有权限但进不去（例如 /dispatch）”或“看得到入口但点进去无权限”的长期烂体验，并埋下未来漏检页面的安全雷。
  7. LC-AUDIT-007（P1｜权限与安全）User.isActive 字段存在但未在登录/会话层强制

  - 证据：lawclick-next/prisma/schema.prisma:559、lawclick-next/src/auth.ts:46、lawclick-next/src/lib/server-auth.ts:28
  - 刺点：禁用账号很可能仍能登录/拿到会话（更糟：配合 LC-AUDIT-001，成员状态也会被自愈）。

  8. LC-AUDIT-008（P1｜功能闭环/数据一致性）注册把 email 归一化为小写，登录却用原始 email 查库

  - 证据：lawclick-next/src/actions/auth.ts:29、lawclick-next/src/actions/auth.ts:90、lawclick-next/src/auth.ts:29、
    lawclick-next/src/auth.ts:46
  - 刺点：用户用不同大小写输入会“登录失败”；更坏的情况是 Postgres 默认大小写敏感唯一约束会导致重复账号风险。

  9. LC-AUDIT-009（P1｜UI主题一致性）主色 token 默认值与手册冲突：你把 primary-800 当 primary.DEFAULT

  - 证据：docs/DESIGN_HANDBOOK.md:58、docs/DESIGN_HANDBOOK.md:61、lawclick-next/src/app/globals.css:13、lawclick-next/
    tailwind.config.ts:14、lawclick-next/src/components/ui/Button.tsx:12
  - 刺点：全站品牌色基调直接跑偏（按钮/链接/强调色都会偏暗），设计手册形同虚设。

  10. LC-AUDIT-010（P1｜UI主题一致性/组件库）Button/Card 圆角与卡片规范漂移 + 样式实现“双轨”

  - 证据：docs/DESIGN_HANDBOOK.md:220、docs/DESIGN_HANDBOOK.md:433、lawclick-next/src/components/ui/Button.tsx:8、
    lawclick-next/src/components/ui/Card.tsx:10、lawclick-next/src/styles/components.css:5、lawclick-next/src/styles/
    components.css:23
  - 刺点：同一“卡片/按钮”在不同页面看起来不是同一套系统；而且 src/styles/components.css 里定义的 .btn-primary/.card 基本    不被用到（债务堆积）。

  ———

  ## 功能地图（事实基线，带证据）

  - 路由总览（Next build 输出）：docs/_artifacts/critical_review_2025-12-28_v1/pnpm_build.txt:25
  - 主要模块（从路由/导航/DB 实体交叉）：
      - 认证：/auth/login、/auth/register、/auth/reset-password（docs/_artifacts/critical_review_2025-12-28_v1/
        pnpm_build.txt:40）
      - 工作台/看板：/dashboard、/time、/timelog（同上 :54、:69、:70）
      - 案件：/cases、/cases/[id]、/cases/intake、/cases/archived（同上 :44、:45、:49、:48）
      - 项目/任务：/projects、/projects/[id]、/tasks、/tasks/[id]（同上 :61、:62、:65、:66）
      - 文档：/documents、/documents/[id]、/api/documents/[id]/file（同上 :56、:57、:37；API 访问控制见 lawclick-next/
        src/app/api/documents/[id]/file/route.ts:61）
      - 日程/调度：/calendar、/dispatch（同上 :43、:55）
      - 多租户/邀请：/tenants、/tenants/accept（同上 :67、:68）
      - 工具箱/外部 Webhook：/tools + 队列触发（lawclick-next/src/actions/tool-actions.ts:234、lawclick-next/src/lib/
        job-handlers.ts:140）
      - 后台：/admin/*（同上 :27 起）

  ———

  ## 质量闸门（仅能引用既有证据；当前版本待确认）

  - 过去一次全通过证据（2025-12-28）：
      - lint：docs/_artifacts/critical_review_2025-12-28_v1/pnpm_lint.txt:11
      - type-check：docs/_artifacts/critical_review_2025-12-28_v1/pnpm_typecheck.txt:11
      - build：docs/_artifacts/critical_review_2025-12-28_v1/pnpm_build.txt:79
      - prisma validate：docs/_artifacts/critical_review_2025-12-28_v1/pnpm_prisma_validate.txt:13
      - playwright test：docs/_artifacts/critical_review_2025-12-28_v1/pnpm_test.txt:23（含多租户隔离用例：lawclick-
        next/tests/e2e/multi-tenant-isolation.spec.ts:26）
  - A11y（仅 critical/serious）过去证据：docs/_artifacts/a11y_audit_2026-01-02.md:1
  - 待确认：上述为历史输出，不代表你当前工作区 HEAD 仍通过。

  ———

  ## 问题表（字段完整）

  ### LC-AUDIT-001

  - severity：P0
  - category：权限与安全
  - scope：lawclick-next/src/lib/server-auth.ts#ensureActiveTenantMembership
  - evidence：lawclick-next/src/lib/server-auth.ts:331、lawclick-next/src/lib/server-auth.ts:399、lawclick-next/src/lib/    server-auth.ts:414
  - repro_steps：用 setTenantMemberStatusImpl 把某成员置为 DISABLED（lawclick-next/src/lib/tenant/tenant-membership-
    domain.ts:422）→ 该成员重新登录 → 观察其 TenantMembershipStatus/FirmMembershipStatus
  - expected_vs_actual：期望停用后无法恢复；实际登录路径会 upsert 并把 status 写回 ACTIVE
  - root_cause_hypothesis：把“旧单租户数据自愈”放在每次登录必经路径（server-auth.ts:370），且 upsert update 分支无条件写    ACTIVE
  - fix_recommendation：最小修复：移除/禁用登录时自愈写库（至少在生产环境硬禁用）；结构性改进：把“数据迁移自愈”改成一次
    性迁移脚本/后台运维任务，并且尊重 DISABLED
  - risk_if_ignored：离职/封禁形同虚设；账号被盗/内部滥用时无法止血；审计与合规不可用
  - effort：M（需要梳理历史数据迁移与登录链路）

  ### LC-AUDIT-002

  - severity：P0
  - category：权限与安全
  - scope：/auth/register + registerUser
  - evidence：lawclick-next/src/actions/auth.ts:94、lawclick-next/src/actions/auth.ts:118、lawclick-next/src/actions/
    auth.ts:130、lawclick-next/src/lib/server-auth.ts:328、lawclick-next/prisma/schema.prisma:541
  - repro_steps：在未配置租户环境变量的情况下打开 /auth/register 注册 → 观察新用户的 tenantId/activeTenantId 与
    TenantMembership
  - expected_vs_actual：期望“注册=受控引导/邀请制/创建独立租户”；实际“注册=直接进入 default-tenant 并成为 ACTIVE 成员”
  - root_cause_hypothesis：getTenantId()无参数默认回落 default-tenant（server-auth.ts:328），注册 action 直接用该
    tenantId 写入并创建 membership
  - fix_recommendation：最小修复：生产环境禁用开放注册（改邀请制/白名单/邮件域名限制，建议用 NextAuth callbacks.signIn
    做入口控制，Context7 示例见 /nextauthjs/next-auth）；结构性改进：注册流程强制“创建租户/加入租户”分岔并落库审计
  - risk_if_ignored：公网部署即被批量注册占用资源/污染数据；多租户形同单租户混池
  - effort：M（涉及产品策略与入口改造）

  ### LC-AUDIT-003

  - severity：P0
  - category：权限与安全
  - scope：Credentials authorize
  - evidence：lawclick-next/src/auth.ts:54、lawclick-next/src/auth.ts:60
  - repro_steps：制造一个 password=null 的用户（例如 OAuth/迁移数据）→ 在 NODE_ENV=development 下用任意密码登录该邮箱
  - expected_vs_actual：期望拒绝或走重置密码；实际直接写入新 hash 并返回 user
  - root_cause_hypothesis：用开发便捷逻辑“补齐密码”替代了身份验证/重置流程
  - fix_recommendation：最小修复：删掉/强硬禁用该分支；改为强制走 requestPasswordReset（lawclick-next/src/actions/
    auth.ts:158）；结构性改进：对账号生命周期（OAuth/密码/禁用）统一策略
  - risk_if_ignored：环境误配=直接账号接管；审计难发现
  - effort：S

  ### LC-AUDIT-004

  - severity：P0
  - category：权限与安全
  - scope：工具 Webhook 执行链（队列任务）
  - evidence：lawclick-next/src/lib/webhook-safety.ts:85、lawclick-next/src/lib/job-handlers.ts:194
  - repro_steps：配置 allowlist 主机 A（受控或第三方）→ A 返回 302 Location 指向内网/元数据地址 → 触发工具
    Webhook（lawclick-next/src/actions/tool-actions.ts:234）
  - expected_vs_actual：期望任何跳转也被重新校验/禁止；实际 fetch 默认 follow redirect，校验仅覆盖初始 URL
  - root_cause_hypothesis：SSRF 防护只做了静态 URL 校验，未覆盖 HTTP redirect 链
  - fix_recommendation：最小修复：fetch(..., { redirect: \"manual\" }) 并拒绝 3xx；或跟随跳转时对 Location 逐跳
    ensureWebhookUrlSafe；结构性改进：加入签名/HMAC、最小化 payload（避免 userEmail 等 PII 默认外发）
  - risk_if_ignored：可被用作 SSRF 探测/内网访问；外部系统可被滥用为数据外发通道
  - effort：M

  ### LC-AUDIT-005

  - severity：P0
  - category：权限与安全
  - scope：Prisma tenant-scope-guard
  - evidence：lawclick-next/src/lib/prisma.ts:19、lawclick-next/src/lib/prisma.ts:213
  - repro_steps：在生产环境误设 LAWCLICK_ALLOW_UNSCOPED_TENANT_QUERIES=1 → 观察 tenant-scoped 模型是否仍强制 where/data
    tenantId
  - expected_vs_actual：期望强门禁不可关闭或只能在本地；实际一个 env 即可绕过
  - root_cause_hypothesis：把“调试逃生门”做成了运行时开关
  - fix_recommendation：最小修复：仅允许在 NODE_ENV!=="production" 生效；结构性改进：把“逃生门”改成编译期/启动期硬失败或    仅限单元测试进程
  - risk_if_ignored：一次误配=跨租户读写风险
  - effort：S

  ### LC-AUDIT-006

  - severity：P1
  - category：功能闭环
  - scope：middleware 路由门禁 vs 服务端权限门禁
  - evidence：lawclick-next/src/proxy.ts:38、lawclick-next/src/lib/permissions.ts:260、lawclick-next/src/app/
    (dashboard)/dispatch/page.tsx:21
  - repro_steps：给 LAWYER 赋予 task:edit/team:view/case:view（lawclick-next/src/lib/permissions.ts:168 附近）→ 访问 /
    dispatch
  - expected_vs_actual：期望按 permission 放行；实际被 canAccessPage 的 allowedRoles 拦住（/dispatch 未包含 LAWYER）
  - root_cause_hypothesis：把“角色白名单 PAGE_ACCESS_CONFIG”当成主门禁，同时页面又按 permission 校验，双源不可避免漂移
  - fix_recommendation：最小修复：统一“门禁来源”——要么 middleware 只做登录态与租户态，细粒度权限交给服务端；要么把
    canAccessPage 改为基于 PermissionMap 推导；并在 sidebar 只保留一个过滤体系
  - risk_if_ignored：功能不可达/越权风险会随机出现，测试难覆盖
  - effort：M

  ### LC-AUDIT-007

  - severity：P1
  - category：权限与安全
  - scope：账号禁用链路（User.isActive）
  - evidence：lawclick-next/prisma/schema.prisma:559、lawclick-next/src/auth.ts:46、lawclick-next/src/lib/server-
    auth.ts:28
  - repro_steps：把某用户 isActive=false → 尝试登录并访问任意需要会话的页面/API
  - expected_vs_actual：期望禁止登录/强制登出；实际未见 authorize/session 获取用户时校验 isActive
  - root_cause_hypothesis：禁用字段停留在“数据层”，未进入认证/会话边界
  - fix_recommendation：最小修复：authorize 与 getSessionUser 统一校验 isActive；结构性改进：NextAuth callbacks.signIn/
    events 写审计日志，禁用时立即失效 token
  - risk_if_ignored：账号禁用不可用；合规风险
  - effort：S

  ### LC-AUDIT-008

  - severity：P1
  - category：功能闭环
  - scope：注册/登录 email 一致性
  - evidence：lawclick-next/src/actions/auth.ts:29、lawclick-next/src/actions/auth.ts:123、lawclick-next/src/auth.ts:46
  - repro_steps：用 Test@Example.com 注册 → 用 test@example.com 或相反大小写登录
  - expected_vs_actual：期望大小写不影响登录；实际登录查库用原始 email
  - root_cause_hypothesis：注册做了 normalize，但登录没对齐；DB unique 默认大小写敏感
  - fix_recommendation：最小修复：登录也 normalize 并用 normalized email 查询；结构性改进：DB 用 citext/函数索引实现大小    写不敏感唯一性
  - risk_if_ignored：用户“记错大小写=登录失败”；甚至重复账号与权限混乱
  - effort：S/M（取决于是否改 DB）

  ### LC-AUDIT-009

  - severity：P1
  - category：UI主题一致性
  - scope：Primary 色板默认映射
  - evidence：docs/DESIGN_HANDBOOK.md:58、lawclick-next/src/app/globals.css:13、lawclick-next/tailwind.config.ts:14
  - repro_steps：检查全站 bg-primary/text-primary 的实际色值（不跑服务时只能静态推断：DEFAULT=--color-primary）
  - expected_vs_actual：期望 primary.DEFAULT= primary-500/#FF6B35；实际 --color-primary= #B23A13（更接近 primary-800）
  - root_cause_hypothesis：tokens 定义与手册“主要颜色”语义对不上
  - fix_recommendation：最小修复：对齐 --color-primary 与手册主色；结构性改进：明确 token 语义（DEFAULT=500）并加静态校
    验脚本
  - risk_if_ignored：品牌色全站漂移；设计一致性审计无法闭环
  - effort：S

  ### LC-AUDIT-010

  - severity：P1
  - category：组件化与卡片化
  - scope：Button/Card 基础组件与手册规范
  - evidence：docs/DESIGN_HANDBOOK.md:371、docs/DESIGN_HANDBOOK.md:389、lawclick-next/src/components/ui/Button.tsx:8、      lawclick-next/src/components/ui/Card.tsx:10、lawclick-next/src/styles/components.css:5
  - repro_steps：对照 Button/Card 组件类名与手册要求（渐变/圆角/hover/active）
  - expected_vs_actual：期望 default 按钮渐变+scale，卡片 rounded-lg + hover translateY(-4px)；实际按钮扁平、rounded-
    md，卡片 rounded-xl 且无 translateY
  - root_cause_hypothesis：手册、CSS（styles/components.css）与 React 组件三套实现并行
  - fix_recommendation：最小修复：选定“唯一真源”（建议以 src/components/ui/* 为准）并删除/迁移无引用 CSS；结构性改进：把    DESIGN_HANDBOOK 的关键断言做成自动化一致性检查
  - risk_if_ignored：设计债滚雪球；卡片化/组件库难以规模化维护
  - effort：M

  ### LC-AUDIT-011

  - severity：P1
  - category：UI主题一致性
  - scope：页面背景/卡片背景（Neutral）
  - evidence：docs/DESIGN_HANDBOOK.md:77、docs/DESIGN_HANDBOOK.md:78、lawclick-next/src/app/globals.css:27、lawclick-
    next/src/app/layout.tsx:26
  - repro_steps：对照 Neutral-50/100 的用途与 tokens
  - expected_vs_actual：期望页面背景偏 neutral-50，卡片背景 neutral-100；实际 background=白，card=白（多处用 bg-card/70
    但底色仍白）
  - root_cause_hypothesis：tokens 语义与手册用途不一致，导致层级/通透感难复现
  - fix_recommendation：最小修复：按手册重设 background/card；结构性改进：把“页面底色/卡片底色/侧边栏底色”作为三层语义
    token 固化
  - risk_if_ignored：全站层级感混乱；卡片化边界变弱
  - effort：S

  ### LC-AUDIT-012

  - severity：P1
  - category：UI主题一致性
  - scope：功能色（Success/Warning/Info）
  - evidence：docs/DESIGN_HANDBOOK.md:94、lawclick-next/src/app/globals.css:48
  - repro_steps：对照手册功能色 HEX 与 tokens
  - expected_vs_actual：期望 Success=#28A745、Warning=#FFC107、Info=#17A2B8；实际分别为更深的 #1C7430/#B45309/#0F6E7A
  - root_cause_hypothesis：为对比度做了“暗化”，但未同步手册与用法说明
  - fix_recommendation：最小修复：手册与 tokens 二选一统一；结构性改进：补一套“AA/AAA 对比度说明与例外规则”
  - risk_if_ignored：设计规范不可用；跨页面状态色不一致
  - effort：S

  ### LC-AUDIT-013

  - severity：P2
  - category：UI主题一致性
  - scope：布局尺寸（Sidebar/Toolbar）
  - evidence：docs/DESIGN_HANDBOOK.md:238、docs/DESIGN_HANDBOOK.md:241、lawclick-next/src/components/ui/Sidebar.tsx:30、    lawclick-next/src/components/layout/AppHeader.tsx:206
  - repro_steps：对照手册 Sidebar=280px、Toolbar=60px 与实现
  - expected_vs_actual：期望 280/60；实际 Sidebar=16rem(256px)，Header=h-16(64px)
  - root_cause_hypothesis：实现沿用组件库默认值，未做手册对齐
  - fix_recommendation：最小修复：用 token/常量对齐；结构性改进：把这些尺寸抽到 Design Token 并统一使用
  - risk_if_ignored：跨端布局比例不稳定；设计稿难对齐
  - effort：S

  ### LC-AUDIT-014

  - severity：P2
  - category：组件化与卡片化
  - scope：重复 UI 外壳（headerPanel/section wrapper）
  - evidence：lawclick-next/src/app/(dashboard)/admin/page.tsx:151、lawclick-next/src/app/(dashboard)/admin/ops/
    page.tsx:53、lawclick-next/src/app/(dashboard)/tenants/page.tsx:44
  - repro_steps：对比多个页面相同的 rounded-xl border bg-card/70 shadow-sm p-4 外壳块
  - expected_vs_actual：期望抽成可复用组件（并统一圆角/背景语义）；实际多处复制
  - root_cause_hypothesis：缺少“页面级 HeaderPanel”组件，导致复制传播（并固化了 rounded-xl 的漂移）
  - fix_recommendation：最小修复：抽 WorkspaceHeaderPanel/SectionHeader；结构性改进：与 DESIGN_HANDBOOK 的卡片/面板语义
    绑定（rounded-lg vs xl）
  - risk_if_ignored：未来每改一次样式要改 N 处；漂移加速
  - effort：M

  ### LC-AUDIT-015

  - severity：P2
  - category：文档与可运维
  - scope：设计手册引用的代码资产缺失
  - evidence：docs/DESIGN_HANDBOOK.md:169、lawclick-next/src/styles/theme.css:1（实际为 css tokens；未见 styles/
    typography.ts）
  - repro_steps：已修复：手册不再引用 @/styles/typography（示例改为 `lawclick-next/src/app/globals.css` 与 `lawclick-next/src/styles/theme.css`）
  - expected_vs_actual：期望存在 typography 模块；实际 src/styles/ 只有 css（theme.css/components.css/animations.css/
    utilities.css）
  - root_cause_hypothesis：手册模板未与仓库实现同步
  - fix_recommendation：最小修复：更新手册为真实实现路径；结构性改进：把手册示例与仓库做 CI 校验（import 可解析）
  - risk_if_ignored：新成员照手册写代码必踩坑；规范失信
  - effort：S

  ### LC-AUDIT-016

  - severity：P2
  - category：测试与质量闸门
  - scope：当前 HEAD 是否仍通过门禁（待确认）
  - evidence：历史全通过：docs/_artifacts/critical_review_2025-12-28_v1/pnpm_lint.txt:11、docs/_artifacts/
    critical_review_2025-12-28_v1/pnpm_test.txt:23
  - repro_steps：运行“待确认/阻塞”中的命令清单
  - expected_vs_actual：期望当前版本也全绿；实际我无法在 B2 模式下验证
  - root_cause_hypothesis：代码与审计输出存在时间差
  - fix_recommendation：最小修复：你跑命令贴输出；结构性改进：把 docs/_artifacts 与 Git SHA 绑定
  - risk_if_ignored：审计结论无法落地到“可复现证据”
  - effort：S（你执行）

  ### LC-AUDIT-017

  - severity：P1
  - category：权限与安全
  - scope：/api/queue/process secret 模式
  - evidence：lawclick-next/src/app/api/queue/process/route.ts:17、lawclick-next/src/app/api/queue/process/route.ts:97、    lawclick-next/src/app/api/queue/process/route.ts:137
  - repro_steps：带 x-lawclick-queue-secret 调用 → 传 tenantId/不传 tenantId 触发全租户 health check
  - expected_vs_actual：期望 secret 泄露后仍有第二道防线；实际 secret=全局钥匙，可跨租户触发处理/健康检查入队
  - root_cause_hypothesis：把 cron/运维入口做成“单共享 secret”
  - fix_recommendation：最小修复：增加 IP allowlist / mTLS / 单租户 token；结构性改进：拆分“只处理本租户”的 admin 模式
    与“全局 cron”模式，并最小权限化
  - risk_if_ignored：secret 一旦泄露=全租户队列被操控/DoS/外发
  - effort：M

  ### LC-AUDIT-018

  - severity：P2
  - category：文档与可运维
  - scope：工具 Webhook 配置的失败前置校验不足（运维体验）
  - evidence：创建时仅校验 https：lawclick-next/src/actions/tool-actions.ts:31、存库不做 allowlist 校验：lawclick-next/
    src/actions/tool-actions.ts:128；触发时才 ensureWebhookUrlSafe：lawclick-next/src/actions/tool-actions.ts:277
  - repro_steps：管理员创建 webhookUrl 不在 allowlist → 普通用户触发 → 产生 ERROR invocation
  - expected_vs_actual：期望创建/更新时就明确报错；实际到运行期才失败（并写入调用记录）
  - root_cause_hypothesis：把安全校验延后到执行阶段
  - fix_recommendation：最小修复：创建/更新时也跑 ensureWebhookUrlSafe；结构性改进：UI 提示 allowlist 规则与可用域名
  - risk_if_ignored：误配置会变成队列噪音与运维负担
  - effort：S

  ———

  ## 路线图（只列要点）

  ### 1 周（先止血，P0 全清）

  - 砍掉/隔离 ensureActiveTenantMembership 的“写库自愈”，保证 DISABLED 不会被登录恢复（lawclick-next/src/lib/server-
    auth.ts:331）。
  - 关闭生产开放注册：改邀请制/白名单/域名限制（可用 NextAuth callbacks.signIn 做入口控制，Context7 /nextauthjs/next-
    auth 示例含 signIn gate）。
  - 删除 Credentials 的“development 写密码”分支（lawclick-next/src/auth.ts:54）。
  - Webhook：禁用 redirect follow 或逐跳重校验（lawclick-next/src/lib/job-handlers.ts:194）。
  - Prisma：限制 LAWCLICK_ALLOW_UNSCOPED_TENANT_QUERIES 仅非生产可用（lawclick-next/src/lib/prisma.ts:19）。
  - 统一路由门禁来源（middleware vs server 权限），修复 /dispatch 等错挡（lawclick-next/src/proxy.ts:38）。

  ### 2 周（把“规范”变成真）

  - 设计系统对齐：--color-primary、功能色、background/card 语义、圆角（docs/DESIGN_HANDBOOK.md:45 起 vs lawclick-next/
    src/app/globals.css:11 起）。
  - Button/Card 收敛成单一实现源；清理/迁移无引用 CSS（lawclick-next/src/styles/components.css:5）。
  - 抽公共 HeaderPanel/无权限页壳，减少复制粘贴（示例重复见 lawclick-next/src/app/(dashboard)/admin/page.tsx:151）。

  ### 1 月（防复发）

  - 新增 E2E：覆盖“停用成员/禁用账号/tenant 切换安全”回归（补齐 LC-AUDIT-001/007）。
  - Webhook 增加签名/HMAC、payload 最小化、响应体大小/字段白名单落库。
  - 把 docs/_artifacts 与提交版本绑定（SHA + 时间 + 环境），形成可追溯审计链。

  ———

  ## 修复闭环（2026-01-07）

  ### 最小信息结论（硬要求）

  1. 生产环境默认关闭开放注册：`registerUser` 在 `NODE_ENV=production` 直接拒绝；生产加入租户必须走邀请/后台创建等受控入口；禁止任何新用户“直落库进 default-tenant”。
  2. “停用 vs 离职”分流 + 一次性自愈迁移（允许一次且幂等）：
     - 停用（DISABLED / 冷冻）：登录/会话层强制拒绝，且不会被任何自愈逻辑写回 `ACTIVE`。
     - 离职（OFFBOARDED / 交接）：先转移资源归属（projects/tasks/cases 等），再冻结账号并停用其同 firm 的成员关系，避免孤儿数据与权限残留。
     - 一次性自愈迁移：仅当用户完全缺失 `TenantMembership` 时触发；并发下用唯一约束实现幂等；禁止迁移/落库到 `default-tenant`。
  3. 执行命令/设置 env 属于修复的一部分：docker/Postgres/MinIO/Prisma/Playwright/门禁脚本均已在本机跑通，摘要如下（不泄露 secrets 值）。

  ### 门禁复验摘要（可复验命令 + 结果）

  - docker：`docker compose -f lawclick-next/docker-compose.yml ps` → `lawclick-postgres`/`lawclick-minio` Up
  - prisma：`pnpm -C lawclick-next exec prisma migrate deploy` → No pending migrations
  - lint：`pnpm -C lawclick-next lint` → ✅
  - type-check：`pnpm -C lawclick-next type-check` → ✅
  - build：`pnpm -C lawclick-next build` → ✅（Next.js 16.1.1）
- test：`pnpm -C lawclick-next test` → `24 passed (14.4m)`
  - audit:routes：`pnpm -C lawclick-next audit:routes` → app routes: 56；OK
  - audit:tenant-scope：`pnpm -C lawclick-next audit:tenant-scope` → prisma models: 54；OK
  - audit:permissions-sync：`pnpm -C lawclick-next audit:permissions-sync` → ts: 36 / rust: 36 / diff: 0
  - audit:a11y：`pnpm -C lawclick-next audit:a11y` → 1 passed；证据 `docs/_artifacts/a11y_audit_2026-01-07.md`（pages: 10，violations: 0）
  - audit:security：`pnpm -C lawclick-next audit:security` → scanned files: 421；findings: 0；blocking: 0（包含：Webhook redirect=manual 断言 + 灾难开关生产禁用断言）

  ### 修复完成矩阵（LC-AUDIT-001 ~ LC-AUDIT-018）

  | ID | 状态 | 关键改动（核心文件） | 主要验证 |
  |---|---|---|---|
  | LC-AUDIT-001 | fixed | `lawclick-next/src/lib/server-auth.ts`、`lawclick-next/src/lib/tenant/tenant-membership-domain.ts`、`lawclick-next/src/actions/tenant-actions.ts` | `pnpm -C lawclick-next test`（含“离职交接/停用成员”用例） |
  | LC-AUDIT-002 | fixed | `lawclick-next/src/actions/auth.ts`、`lawclick-next/src/lib/server-auth.ts`、`lawclick-next/tests/e2e/auth.spec.ts` | `pnpm -C lawclick-next test`（注册生产阻断） |
  | LC-AUDIT-003 | fixed | `lawclick-next/src/auth.ts`、`lawclick-next/tests/e2e/auth.spec.ts` | `pnpm -C lawclick-next test`（password=null 不可登录且不写回） |
  | LC-AUDIT-004 | fixed | `lawclick-next/src/lib/webhook-safety.ts`、`lawclick-next/src/lib/job-handlers.ts`、`lawclick-next/scripts/security-audit.js` | `pnpm -C lawclick-next audit:security`（blocking=0，禁止 30x follow） |
  | LC-AUDIT-005 | fixed | `lawclick-next/src/lib/prisma.ts`、`lawclick-next/scripts/security-audit.js` | `pnpm -C lawclick-next audit:security`（blocking=0，断言生产禁用） |
  | LC-AUDIT-006 | fixed | `lawclick-next/src/proxy.ts`、`lawclick-next/middleware.ts` | `pnpm -C lawclick-next test`（主线/多租户回归） |
  | LC-AUDIT-007 | fixed | `lawclick-next/src/auth.ts`、`lawclick-next/src/lib/server-auth.ts` | `pnpm -C lawclick-next test`（停用/会话回查覆盖） |
  | LC-AUDIT-008 | fixed | `lawclick-next/src/actions/auth.ts`、`lawclick-next/src/auth.ts`、`lawclick-next/tests/e2e/auth.spec.ts` | `pnpm -C lawclick-next test`（email 归一化一致） |
  | LC-AUDIT-009 | fixed | `lawclick-next/src/app/globals.css`、`lawclick-next/tailwind.config.ts`、`docs/DESIGN_HANDBOOK.md` | `pnpm -C lawclick-next build` + `pnpm -C lawclick-next audit:a11y` |
  | LC-AUDIT-010 | fixed | `lawclick-next/src/components/ui/Button.tsx`、`lawclick-next/src/components/ui/Card.tsx`、`lawclick-next/src/styles/components.css` | `pnpm -C lawclick-next build` + `pnpm -C lawclick-next test` |
  | LC-AUDIT-011 | fixed | `lawclick-next/src/app/globals.css`、`docs/DESIGN_HANDBOOK.md` | `pnpm -C lawclick-next audit:a11y` |
  | LC-AUDIT-012 | fixed | `lawclick-next/src/app/globals.css`、`lawclick-next/src/components/cases/CaseListClient.tsx`、`lawclick-next/src/components/calendar/CanvasCalendar.tsx` | `pnpm -C lawclick-next audit:a11y`（0 violations） |
  | LC-AUDIT-013 | fixed | `lawclick-next/src/app/globals.css`、`lawclick-next/src/components/ui/Sidebar.tsx`、`lawclick-next/src/components/layout/AppHeader.tsx` | `pnpm -C lawclick-next build` |
  | LC-AUDIT-014 | fixed | `lawclick-next/src/components/layout/SectionWorkspace.tsx`、`lawclick-next/src/components/layout/LegoDeck.tsx` | `pnpm -C lawclick-next test` |
  | LC-AUDIT-015 | fixed | `docs/DESIGN_HANDBOOK.md` | 文档已对齐真实实现路径（无需运行态门禁） |
  | LC-AUDIT-016 | fixed |（门禁复跑闭环） | `pnpm -C lawclick-next lint/type-check/build/test` 全绿（见上） |
  | LC-AUDIT-017 | fixed | `lawclick-next/src/app/api/queue/process/route.ts` | `pnpm -C lawclick-next test`（secret+IP allowlist） |
  | LC-AUDIT-018 | fixed | `lawclick-next/src/actions/tool-actions.ts`、`lawclick-next/src/lib/webhook-safety.ts` | `pnpm -C lawclick-next test`（Webhook 创建阶段校验） |

  ### 修复影响分析（Fix Impact Analysis，/check-fix --deep --data 口径）

  #### 变更识别（本轮增量）

  - `lawclick-next/src/lib/tenant/tenant-domain.ts:9`：`TenantIdSchema` 兼容 legacy `t:<32hex>`（修复存量数据不兼容导致的租户切换/邀请入口输入校验失败）。
  - `lawclick-next/tests/e2e/deletion-flows.spec.ts:52`：删除链路 E2E 选择器与等待策略收敛（避免“删除”子串碰撞 + hydration 时序抖动），不影响产线逻辑。
  - `docs/LawClick_NEW（主线：lawclick-next）A3 红队审计报告（D1）.md:414`：门禁证据更新为本轮真实复跑结果。

  #### 直接影响（调用方/契约）

  - `TenantIdSchema`（共享输入校验）调用方包含：
    - `lawclick-next/src/actions/tenant-actions.ts:106`（`switchMyActiveTenant`）
    - `lawclick-next/src/actions/tenant-actions.ts:147`（创建租户相关输入）
    - `lawclick-next/src/lib/tenant/tenant-membership-domain.ts:27`（成员管理：`AddTenantMemberByEmailInputSchema`）
    - `lawclick-next/src/lib/tenant/tenant-invites-domain.ts:33`（邀请：`CreateTenantInviteInputSchema`）
  - 参数签名/返回值结构：未变化（仍为 `{ success: boolean, ... }` 语义）；变化点仅为“允许的 tenantId 格式集合扩展”，属于兼容性增强。

  #### 数据结构兼容性（生产/存量）

  - 发现：本机 DB 存量 `Tenant.id` 形如 `t:<32hex>`，旧 `TenantIdSchema` 仅允许 slug（字母/数字/连字符）会导致这些租户在“切换/邀请/成员管理”等入口被输入校验拒绝。
  - 证据（已执行）：`"select count(*) from \`\"Tenant\`\" where id like 't:%';" | docker exec -i lawclick-postgres psql -U postgres -d lawclick -At` → `171`
  - 修复：`lawclick-next/src/lib/tenant/tenant-domain.ts:14` 放宽为 `slug` 或 `t:<32位hex>`（并保持长度限制与精确 hex 约束，避免过度放宽）。
  - 决策：不拆分“新建 tenantId vs 引用 tenantId”的 schema（用户选择：`n`）；保持当前兼容策略。

  #### 风险评估（仅事实）

  - 风险：由于 `TenantIdSchema` 被复用，“创建租户”入口也可能接受 `t:<32hex>`（如果 UI 允许用户输入该格式）。当前不视为阻塞；若未来要强制新建为 slug，可新增 `TenantIdCreateSchema`（仅 slug）并在创建入口替换。
  - 安全门禁不变：`LAWCLICK_ALLOW_UNSCOPED_TENANT_QUERIES=1` 在生产直接拒绝启动（`lawclick-next/src/lib/prisma.ts:20`），并由 `pnpm -C lawclick-next audit:security` 静态断言防回归（`lawclick-next/scripts/security-audit.js:163`）。

  #### 复验（已执行）

  - `pnpm -C lawclick-next lint` → ✅
  - `pnpm -C lawclick-next type-check` → ✅
  - `pnpm -C lawclick-next build` → ✅
  - `pnpm -C lawclick-next test` → `24 passed (14.4m)`
  - `pnpm -C lawclick-next audit:tenant-scope` → OK
  - `pnpm -C lawclick-next audit:security` → blocking: 0
