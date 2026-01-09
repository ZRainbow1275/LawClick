# TG5 文档中心（Document Center）子计划（Phase1-4）

> 约束：遵循 `prompt/1211架构设计.md`、`.agent/rules/lawclick.md`（无 mock/空壳、前后端真实闭环、MDI/LEGO、权限必须落在后端）  
> 主开发目录：`lawclick-next/`  
> 原则：以主模块（案件/任务）为核心，文档围绕案件阶段与业务流组织

## 0. 背景与现状问题（历史问题，已在 TG5 验收中解决）
> 本子计划对应功能已于 2025-12-13 验收通过，详见：`docs/TG5_文档中心_验收记录.md`。  
> 以下为立项时识别的问题点，保留用于追溯，不应再作为“当前现状”理解。

1. **上传空壳**：已修复为真实上传闭环（MinIO 落对象 + DB 落 `fileUrl` + `DocumentVersion` 版本链）。
2. **双真源/口径分裂**：已收敛为单一真源 `lawclick-next/src/actions/documents.ts`（移除重复 action 文件）。
3. **详情页缺失**：已补齐 `/documents/[id]` 工作台入口与版本历史。
4. **案件阶段文书清单未闭环**：已实现占位文书上传补齐（避免空字符串哑值）。
5. **存储适配层未接入**：已接入 `lawclick-next/src/lib/s3.ts`（`StorageProvider`），并提供 `lawclick-next/scripts/init-s3.js`。

## 1. 目标与验收（可执行清单）
### 1.1 目标（最小可用但完整）
1. **真实上传闭环**：上传文件 → MinIO（bucket）落库 → DB 记录可查询 → 列表可见。
2. **受控下载/预览**：文件访问必须走后端鉴权（禁止静态直链绕过权限）。
3. **版本链最小实现**：支持“上传新版本”，可查看版本历史并下载指定版本。
4. **围绕案件/阶段组织**：文档必须关联 `caseId`；支持阶段文书占位记录上传补齐。
5. **MDI/LEGO 入口补齐**：至少提供 `/documents` 管理页 + `/documents/[id]` 详情工作台入口（后续增强为完整 MDI 工作台）。

### 1.2 验收
1. `/documents` 上传任意文件：
   - MinIO bucket 内可见对象；DB `Document` 记录的 `fileUrl` 非空（存储 key 或受控访问路径）。
2. `/documents` 列表：
   - 可搜索/筛选；收藏/标签/备注等操作均真实落库（刷新不丢）。
3. 受控预览/下载：
   - 访问 `/api/documents/[id]/file` 必须通过登录与 `case` 权限校验；无权限返回 403。
4. 版本链：
   - 上传新版本后：`Document.version` 递增；版本历史可见；可下载旧版本。
5. 案件详情 → 阶段文书清单：
   - 对“待上传”的占位文书执行上传，文件落 MinIO 且该文书记录被补齐（`fileUrl/fileType/fileSize` 更新）。
6. 工程质量：
   - `pnpm -C lawclick-next build` 通过。

## 2. 领域与数据设计（Design）
### 2.1 核心实体（现有）
- `Document`：案件文档元数据（title、category、tags、isConfidential、stage/documentType/isRequired/isCompleted、version、fileUrl/fileType/fileSize 等）。

### 2.2 新增：版本链（最小增量）
新增 `DocumentVersion`（建议）：
- `id`：uuid
- `documentId`：关联 `Document`
- `version`：版本号（从 1 开始，单调递增）
- `fileKey`：MinIO 对象 key（建议替代 url；避免权限绕过）
- `fileType`：content-type 或扩展
- `fileSize`：字节
- `uploaderId`：上传人（可选）
- `createdAt`

设计取舍：
- `Document` 继续保留“最新版本快照字段”（`fileUrl/fileType/fileSize/version`），便于列表查询与快速预览。
- `DocumentVersion` 作为历史追溯来源，支持回滚/下载指定版本（先实现下载，回滚作为后续增强）。

## 3. 接口设计（Design）
### 3.1 Server Actions（建议收敛为单一真源）
文档元数据：
- `getDocuments(options)`：支持 `caseId/category/query/onlyFavorites`
- `getDocumentById(id)`：含 case/uploader/versions/tasks 等最小信息
- `updateDocument(id, data)`：title/category/notes/tags/isConfidential
- `toggleDocumentFavorite(id)`
- `addDocumentTag(id, tag)` / `removeDocumentTag(id, tag)`
- `deleteDocument(id)`：删除 DB 记录；（可选）删除 MinIO 中“最新版本”对象；保留历史对象策略需明确

文件与版本：
- `uploadDocument(formData)`：
  - 新建文档：`caseId + file + title/category` → PutObject → create Document + create DocumentVersion(v1)
  - 上传到占位/已有文档：`documentId + file` → PutObject → create DocumentVersion(vN) + update Document 最新快照

### 3.2 API Routes（受控下载/预览）
建议新增：
- `GET /api/documents/[id]/file?versionId=&download=1`
  - 校验 session + `requireCaseAccess`
  - 从 MinIO `GetObject` 流式返回
  - `download=1` 时设置 `Content-Disposition: attachment`

## 4. 实现步骤（Implement）
### 4.1 后端（先行）
1. Prisma：新增 `DocumentVersion` 模型并迁移
2. 存储：复用 `src/lib/s3.ts`，补齐 `ensureBucket` 与 key 命名策略
3. Actions：收敛 documents actions 单一真源；上传动作真实 PutObject；删除补齐存储清理策略
4. API：实现受控文件读取路由（latest/version）

### 4.2 前端（后行）
1. `/documents`：
   - 上传对话框真实上传（显示进度/状态最小提示）
   - 收藏/标签/备注/保密等全部改为调用 actions
   - 下载/预览使用受控 API 路由
2. `/documents/[id]`：
   - 新增详情页（元数据 + 版本历史 + 预览/下载 + 上传新版本）
3. 案件阶段文书清单：
   - `StageDocumentChecklist` 的“上传”按钮接入同一上传对话框（带 `documentId`）

## 5. 交付与验证（Deliver）
1. `pnpm -C lawclick-next build`
2. 浏览器验收（你本机执行）：
   - 上传文件 → 列表可见 → 预览/下载 → 上传新版本 → 版本历史可见
   - 案件阶段文书占位上传补齐
3. 输出验收记录：`docs/TG5_文档中心_验收记录.md`
4. 更新总计划与 `2_active_task.md`

## 6. 风险与回滚
- 大文件：Server Action 读取到内存可能占用较高；后续可升级为 presign 直传 + 回调落库（但必须保持权限与审计）。
- 版本对象清理：删除策略需明确（默认保留历史版本对象，避免误删导致审计断链）。
- 双真源收敛：必须在同一处统一权限与 revalidate 口径，避免“列表刷新不一致”。

## 7. 关联文件（预期改动范围）
- Schema：`lawclick-next/prisma/schema.prisma`
- Actions：`lawclick-next/src/actions/documents.ts`、（可能移除/合并）`lawclick-next/src/actions/document-actions.ts`
- 存储：`lawclick-next/src/lib/s3.ts`、`lawclick-next/scripts/init-s3.js`
- 路由：`lawclick-next/src/app/(dashboard)/documents/page.tsx`、`lawclick-next/src/app/(dashboard)/documents/[id]/page.tsx`、`lawclick-next/src/app/api/documents/[id]/file/route.ts`
- 组件：`lawclick-next/src/components/documents/DocumentListClient.tsx`、`lawclick-next/src/components/cases/StageDocumentChecklist.tsx`

> 注：`scripts/init-s3.ts` 已升级为 `scripts/init-s3.js`（避免 Node TS experimental 警告与 module type 噪音）。
