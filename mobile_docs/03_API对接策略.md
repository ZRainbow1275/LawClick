# 律时移动端 - API 对接策略

> **版本**: 1.0  
> **创建日期**: 2026-01-01  
> **依据**: `docs/API接口文档.md` + Rust 后端架构

---

## 一、架构决策

### 1.1 背景分析

根据 `docs/API接口文档.md` 的核心约束：

> Web 主线不使用 `/api/v1/*` REST 体系；业务读写以 **Server Actions** 为真源。

这意味着 Web 端（Next.js）主要通过 Server Actions 与数据库交互，而非 REST API。但移动端无法直接调用 Next.js Server Actions，因此需要专门的 API 层。

### 1.2 决策方案

| 方案 | 描述 | 优缺点 | 选择 |
|------|------|--------|------|
| **A. Rust API 层** | 基于现有 Rust 后端扩展移动端 API | ✅ 高性能、类型安全<br>✅ 已有认证支持<br>✅ 架构一致性 | **✅ 已选** |
| B. Next.js API Routes | 在 Next.js 中补充 REST API | ✅ 快速启动<br>⚠️ 性能较低 | 备选方案 |

### 1.3 确定架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        移动端 (Flutter)                          │
│              ↓ REST API (JSON)  ↓ WebSocket                     │
├─────────────────────────────────────────────────────────────────┤
│                     Rust API 网关 (Axum 0.8)                      │
│  ┌───────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│  │   认证    │  │  案件API   │  │  任务API   │  │  实时通信  │  │
│  │  /auth/*  │  │  /cases/*  │  │  /tasks/*  │  │  /ws/chat  │  │
│  └───────────┘  └────────────┘  └────────────┘  └────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                      共享数据层                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              PostgreSQL (lawclick database)                 ││
│  │              MinIO (S3 文件存储)                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                              ↑                                   │
│              lawclick-next (Web端) 也连接同一数据库              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、认证方案

### 2.1 JWT 认证流程

移动端使用 **JWT Bearer Token** 认证，与 Web 端的 NextAuth Session 互补但独立。

```
┌─────────────────────────────────────────────────────────────────┐
│  登录流程                                                        │
│                                                                  │
│  1. 用户输入邮箱/密码                                            │
│  2. POST /auth/login → Rust API                                 │
│  3. Rust 验证密码（argon2）                                      │
│  4. 生成 JWT (accessToken + refreshToken)                       │
│  5. 返回 Token + 用户信息                                        │
│  6. Flutter 安全存储 Token (flutter_secure_storage)             │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  后续请求                                                        │
│                                                                  │
│  1. 每次请求携带 Authorization: Bearer {accessToken}            │
│  2. Rust 验证 Token 有效性                                       │
│  3. Token 过期 → 使用 refreshToken 刷新                         │
│  4. refreshToken 过期 → 重新登录                                │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Token 数据结构

```rust
// Rust 后端 JWT Payload
#[derive(Debug, Serialize, Deserialize)]
pub struct JwtClaims {
    pub sub: String,        // 用户 ID
    pub email: String,      // 邮箱
    pub role: String,       // 角色
    pub tenant_id: Option<String>,  // 租户 ID
    pub exp: usize,         // 过期时间
    pub iat: usize,         // 签发时间
}
```

```dart
// Flutter Token 模型
@freezed
class AuthTokens with _$AuthTokens {
  const factory AuthTokens({
    required String accessToken,
    required String refreshToken,
    required int expiresIn,  // 秒
  }) = _AuthTokens;
}
```

### 2.3 Token 刷新机制

```dart
// lib/core/network/auth_interceptor.dart
class AuthInterceptor extends Interceptor {
  final SecureStorageService _storage;
  final Dio _dio;
  
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await _storage.getAccessToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }
  
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401) {
      // 尝试刷新 Token
      final refreshed = await _refreshToken();
      if (refreshed) {
        // 重试原请求
        final response = await _dio.fetch(err.requestOptions);
        handler.resolve(response);
        return;
      }
      // 刷新失败，跳转登录
      // NavigationService.navigateToLogin();
    }
    handler.next(err);
  }
  
  Future<bool> _refreshToken() async {
    final refreshToken = await _storage.getRefreshToken();
    if (refreshToken == null) return false;
    
    try {
      final response = await _dio.post('/auth/refresh', data: {
        'refreshToken': refreshToken,
      });
      final tokens = AuthTokens.fromJson(response.data);
      await _storage.saveTokens(tokens);
      return true;
    } catch (e) {
      return false;
    }
  }
}
```

### 2.4 跨端登录（可选）

利用 Rust 后端已支持解密 NextAuth Session 的能力，可实现：

- **Web 扫码登录**：移动端扫码授权，Web 端获得会话
- **会话同步**：一端登录，多端同步状态

---

## 三、API 路由设计

### 3.1 路由命名规范

```
基础格式: /{version}/{resource}[/{id}[/{sub-resource}]]

示例:
- GET    /v1/cases                    # 获取案件列表
- POST   /v1/cases                    # 创建案件
- GET    /v1/cases/{id}               # 获取案件详情
- PUT    /v1/cases/{id}               # 更新案件
- DELETE /v1/cases/{id}               # 删除案件
- GET    /v1/cases/{id}/tasks         # 获取案件关联任务
- POST   /v1/cases/{id}/timelogs      # 为案件添加工时
```

### 3.2 完整路由清单

#### 认证模块

| 方法 | 路径 | 描述 | 请求体 | 响应 |
|------|------|------|--------|------|
| POST | `/v1/auth/login` | 登录 | `{email, password}` | `{accessToken, refreshToken, user}` |
| POST | `/v1/auth/refresh` | 刷新 Token | `{refreshToken}` | `{accessToken, refreshToken}` |
| POST | `/v1/auth/logout` | 登出 | - | - |
| POST | `/v1/auth/password/reset-request` | 请求重置密码 | `{email}` | - |
| POST | `/v1/auth/password/reset` | 重置密码 | `{token, newPassword}` | - |
| GET | `/v1/auth/me` | 获取当前用户 | - | `{user}` |

#### 案件模块

| 方法 | 路径 | 描述 | 参数/请求体 |
|------|------|------|------------|
| GET | `/v1/cases` | 案件列表 | `?page&limit&status&search` |
| POST | `/v1/cases` | 创建案件 | `{title, caseType, clientId, ...}` |
| GET | `/v1/cases/{id}` | 案件详情 | - |
| PUT | `/v1/cases/{id}` | 更新案件 | `{title, description, ...}` |
| PATCH | `/v1/cases/{id}/status` | 变更状态 | `{status}` |
| GET | `/v1/cases/{id}/timeline` | 案件时间线 | - |

#### 任务模块

| 方法 | 路径 | 描述 | 参数/请求体 |
|------|------|------|------------|
| GET | `/v1/tasks` | 任务列表 | `?caseId&status&assignee` |
| POST | `/v1/tasks` | 创建任务 | `{caseId, title, description, ...}` |
| GET | `/v1/tasks/{id}` | 任务详情 | - |
| PUT | `/v1/tasks/{id}` | 更新任务 | `{title, description, ...}` |
| PATCH | `/v1/tasks/{id}/status` | 变更状态 | `{status, columnId}` |
| PUT | `/v1/tasks/reorder` | 看板排序 | `{taskIds: [...]}` |

#### 工时模块

| 方法 | 路径 | 描述 | 参数/请求体 |
|------|------|------|------------|
| GET | `/v1/timelogs` | 工时列表 | `?caseId&startDate&endDate` |
| POST | `/v1/timelogs` | 创建工时 | `{caseId, description, duration, ...}` |
| GET | `/v1/timelogs/{id}` | 工时详情 | - |
| PUT | `/v1/timelogs/{id}` | 更新工时 | - |
| DELETE | `/v1/timelogs/{id}` | 删除工时 | - |
| POST | `/v1/timelogs/timer/start` | 开始计时 | `{caseId}` |
| POST | `/v1/timelogs/timer/pause` | 暂停计时 | - |
| POST | `/v1/timelogs/timer/resume` | 继续计时 | - |
| POST | `/v1/timelogs/timer/stop` | 停止计时 | `{description}` |
| GET | `/v1/timelogs/summary` | 工时汇总 | `?period=day|week|month` |

#### 日程模块

| 方法 | 路径 | 描述 | 参数/请求体 |
|------|------|------|------------|
| GET | `/v1/events` | 日程列表 | `?start&end&type` |
| POST | `/v1/events` | 创建日程 | `{title, startTime, endTime, ...}` |
| GET | `/v1/events/{id}` | 日程详情 | - |
| PUT | `/v1/events/{id}` | 更新日程 | - |
| DELETE | `/v1/events/{id}` | 删除日程 | - |

#### 文档模块

| 方法 | 路径 | 描述 | 参数/请求体 |
|------|------|------|------------|
| GET | `/v1/documents` | 文档列表 | `?caseId&tag` |
| POST | `/v1/documents` | 上传文档 | `multipart/form-data` |
| GET | `/v1/documents/{id}` | 文档详情 | - |
| GET | `/v1/documents/{id}/download` | 下载文档 | - |
| DELETE | `/v1/documents/{id}` | 删除文档 | - |

#### 通知模块

| 方法 | 路径 | 描述 | 参数/请求体 |
|------|------|------|------------|
| GET | `/v1/notifications` | 通知列表 | `?unreadOnly&type` |
| PATCH | `/v1/notifications/{id}/read` | 标记已读 | - |
| POST | `/v1/notifications/read-all` | 全部已读 | - |

---

## 四、响应格式规范

### 4.1 成功响应

```json
{
  "success": true,
  "data": {
    // 业务数据
  },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### 4.2 错误响应

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数校验失败",
    "details": [
      {"field": "email", "message": "邮箱格式不正确"}
    ]
  }
}
```

### 4.3 错误码定义

| 错误码 | HTTP 状态码 | 描述 |
|--------|-------------|------|
| `UNAUTHORIZED` | 401 | 未认证 |
| `FORBIDDEN` | 403 | 无权限 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `VALIDATION_ERROR` | 400 | 参数校验失败 |
| `CONFLICT` | 409 | 资源冲突 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

### 4.4 Flutter 统一处理

```dart
// lib/shared/models/api_response.dart
@freezed
class ApiResponse<T> with _$ApiResponse<T> {
  const factory ApiResponse.success({
    required T data,
    PaginationMeta? meta,
  }) = _Success<T>;
  
  const factory ApiResponse.error({
    required String code,
    required String message,
    List<FieldError>? details,
  }) = _Error<T>;
}

// lib/core/network/api_exception.dart
class ApiException implements Exception {
  final String code;
  final String message;
  final List<FieldError>? details;
  
  ApiException(this.code, this.message, [this.details]);
  
  factory ApiException.fromResponse(Response response) {
    final error = response.data['error'];
    return ApiException(
      error['code'] ?? 'UNKNOWN',
      error['message'] ?? '未知错误',
      (error['details'] as List?)?.map((e) => FieldError.fromJson(e)).toList(),
    );
  }
}
```

---

## 五、实时通信 (WebSocket)

### 5.1 连接流程

```dart
// lib/core/network/websocket_client.dart
class WebSocketClient {
  WebSocketChannel? _channel;
  final String baseUrl;
  final SecureStorageService _storage;
  
  Future<void> connect() async {
    final token = await _storage.getAccessToken();
    final uri = Uri.parse('$baseUrl/ws/chat?token=$token');
    _channel = WebSocketChannel.connect(uri);
    
    _channel!.stream.listen(
      _onMessage,
      onError: _onError,
      onDone: _onDisconnected,
    );
  }
  
  void send(Map<String, dynamic> message) {
    _channel?.sink.add(jsonEncode(message));
  }
  
  void _onMessage(dynamic data) {
    final message = ChatMessage.fromJson(jsonDecode(data));
    // 分发到对应 Provider
  }
}
```

### 5.2 消息协议

```json
// 发送消息
{
  "type": "message.send",
  "channelId": "case-123",
  "content": "你好",
  "attachments": []
}

// 接收消息
{
  "type": "message.new",
  "data": {
    "id": "msg-456",
    "channelId": "case-123",
    "senderId": "user-789",
    "content": "你好",
    "createdAt": "2026-01-01T10:00:00Z"
  }
}

// 输入状态
{
  "type": "typing.start",
  "channelId": "case-123"
}
```

---

## 六、离线支持与同步

### 6.1 离线队列

```dart
// lib/core/storage/offline_queue.dart
class OfflineQueue {
  final Box<Map> _box;
  
  Future<void> enqueue(OfflineAction action) async {
    await _box.add(action.toJson());
  }
  
  Future<void> processQueue() async {
    final actions = _box.values.toList();
    for (int i = 0; i < actions.length; i++) {
      try {
        await _executeAction(OfflineAction.fromJson(actions[i]));
        await _box.deleteAt(i);
      } catch (e) {
        // 失败保留，下次继续
      }
    }
  }
}

@freezed
class OfflineAction with _$OfflineAction {
  const factory OfflineAction({
    required String id,
    required String type,  // CREATE_TIMELOG, UPDATE_TASK, etc.
    required Map<String, dynamic> payload,
    required DateTime createdAt,
  }) = _OfflineAction;
}
```

### 6.2 数据同步策略

| 数据类型 | 缓存策略 | 冲突解决 |
|----------|----------|----------|
| 案件列表 | 按需缓存 + TTL 10分钟 | 服务器优先 |
| 工时记录 | 离线队列 + 乐观更新 | 合并策略 |
| 任务状态 | 实时同步 + 乐观更新 | 服务器优先 |
| 聊天消息 | 本地缓存 + 分页加载 | 时间戳排序 |

---

## 七、API 安全

### 7.1 请求签名（可选增强）

```dart
// 对敏感操作增加请求签名
String generateSignature(Map<String, dynamic> params, String secret) {
  final sortedParams = SplayTreeMap<String, dynamic>.from(params);
  final paramString = sortedParams.entries
      .map((e) => '${e.key}=${e.value}')
      .join('&');
  final hmac = Hmac(sha256, utf8.encode(secret));
  return hmac.convert(utf8.encode(paramString)).toString();
}
```

### 7.2 敏感数据处理

- Token 存储：`flutter_secure_storage`（Keychain/Keystore）
- 网络传输：仅 HTTPS
- 日志脱敏：敏感字段不打印

---

**下一步**: 查看 [04_UI设计适配规范.md](./04_UI设计适配规范.md) 了解移动端 UI 适配方案
