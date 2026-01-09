# TG5 文档中心（Document Center）验收记录

> 主工程：`lawclick-next/`  
> 约束：遵循 `prompt/1211架构设计.md`、`.agent/rules/lawclick.md`（无 mock/空壳、前后端真实闭环、权限落后端）  
> 日期：2025-12-13

## 1. 交付物清单
- 子计划：`docs/TG5_文档中心_子计划.md`
- 数据迁移：新增 `DocumentVersion`（Prisma migration：`20251212182533_add_document_versions`）
- 新增受控文件路由：`lawclick-next/src/app/api/documents/[id]/file/route.ts`
- 文档详情页：`/documents/[id]`

## 2. 构建与基本验证
- 构建命令：`pnpm -C lawclick-next build`
- 结果：构建通过

## 3. 验收点（可执行清单）
1) 真实上传闭环（MinIO + DB）
- `/documents` 上传文件后：
  - DB：`Document.fileUrl` 不为空（存储 MinIO object key）
  - DB：新增 `DocumentVersion` 版本记录（v1 起）
  - MinIO：bucket 内存在对应对象（路径按 `cases/<caseId>/documents/<docId>/v<version>/...`）

2) 受控预览/下载（禁止绕过权限）
- 通过 `/api/documents/[id]/file` 访问文件：
  - 必须登录 + 通过 `requireCaseAccess`
  - 支持 `?download=1` 触发附件下载

3) 版本链（最小可用）
- 对已有文档“上传新版本”：
  - `Document.version` 递增
  - `DocumentVersion` 新增记录
  - 可在 `/documents/[id]` 查看版本历史并下载/预览指定版本

4) 案件联动（阶段文书清单可上传补齐）
- 案件详情 → 文档 Tab：
  - 支持上传案件文档（caseId 固定）
  - 对“待上传”的阶段文书占位记录，可直接上传补齐（写入 MinIO + 版本记录）

## 4. 手工验收步骤（建议你本机浏览器执行）
1. 确认 Docker 已启动：Postgres + MinIO
2. `pnpm -C lawclick-next dev` 启动后登录
3. 进入 `/documents`：
   - 上传文件 → 成功后尝试“预览/下载”
   - 点击任一文档进入 `/documents/[id]` → 上传新版本 → 版本历史中预览/下载旧版本
4. 进入任一案件详情 → 文档 Tab：
   - 上传案件文档并下载
   - 若已初始化阶段模板：在“阶段文书清单”对待上传项执行上传补齐

