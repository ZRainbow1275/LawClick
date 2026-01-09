# 时序图 (Sequence Diagram)

## 概述

本文档描述律时(LawClick)系统关键业务流程的时序图，展示各个组件之间的交互顺序和消息传递。

---

## 1. 用户认证流程

### 1.1 用户登录时序图

```mermaid
sequenceDiagram
    participant U as 用户
    participant UI as 登录界面
    participant AC as 认证控制器
    participant AS as 认证服务
    participant DB as 数据库
    participant TS as 令牌服务
    participant CS as 缓存服务
    
    U->>UI: 输入邮箱和密码
    UI->>AC: POST /api/auth/login
    AC->>AS: validateCredentials(email, password)
    AS->>DB: findUserByEmail(email)
    DB-->>AS: 返回用户信息
    AS->>AS: verifyPassword(password, hashedPassword)
    
    alt 密码验证成功
        AS->>TS: generateTokens(userId)
        TS-->>AS: 返回访问令牌和刷新令牌
        AS->>CS: storeRefreshToken(userId, refreshToken)
        AS-->>AC: 返回认证成功结果
        AC-->>UI: 返回用户信息和令牌
        UI->>UI: 存储令牌到本地存储
        UI-->>U: 跳转到仪表盘
    else 密码验证失败
        AS-->>AC: 返回认证失败错误
        AC-->>UI: 返回错误信息
        UI-->>U: 显示错误提示
    end
```

### 1.2 令牌刷新时序图

```mermaid
sequenceDiagram
    participant UI as 前端应用
    participant API as API网关
    participant AS as 认证服务
    participant CS as 缓存服务
    participant TS as 令牌服务
    
    UI->>API: 请求受保护资源 (携带过期令牌)
    API->>AS: 验证访问令牌
    AS-->>API: 令牌已过期 (401)
    API-->>UI: 返回401错误
    
    UI->>UI: 检测到401错误
    UI->>AS: POST /api/auth/refresh (携带刷新令牌)
    AS->>CS: 验证刷新令牌
    CS-->>AS: 令牌有效
    AS->>TS: generateAccessToken(userId)
    TS-->>AS: 返回新的访问令牌
    AS-->>UI: 返回新令牌
    
    UI->>UI: 更新本地存储的令牌
    UI->>API: 重新请求资源 (携带新令牌)
    API-->>UI: 返回请求的资源
```

---

## 2. 日程管理流程

### 2.1 创建日程事件时序图

```mermaid
sequenceDiagram
    participant U as 用户
    participant UI as 日程界面
    participant CC as 日程控制器
    participant CS as 日程服务
    participant VS as 验证服务
    participant NS as 通知服务
    participant DB as 数据库
    participant WS as WebSocket服务
    
    U->>UI: 点击"新建日程"
    UI->>UI: 显示创建表单
    U->>UI: 填写事件信息
    U->>UI: 点击"保存"
    
    UI->>CC: POST /api/calendar/events
    CC->>VS: 验证输入数据
    VS-->>CC: 验证通过
    
    CC->>CS: createEvent(eventData)
    CS->>CS: 检查时间冲突
    
    alt 无时间冲突
        CS->>DB: 保存事件到数据库
        DB-->>CS: 返回保存的事件
        
        CS->>NS: 安排提醒通知
        NS->>NS: 创建提醒任务
        
        CS-->>CC: 返回创建的事件
        CC-->>UI: 返回成功响应
        
        CC->>WS: 广播事件创建通知
        WS->>WS: 通知相关用户
        
        UI->>UI: 更新日历显示
        UI-->>U: 显示成功消息
        
    else 存在时间冲突
        CS-->>CC: 返回冲突错误
        CC-->>UI: 返回冲突信息
        UI-->>U: 显示冲突提示
        U->>UI: 选择解决方案
        
        alt 用户选择强制创建
            UI->>CC: POST /api/calendar/events?force=true
            Note over CC,DB: 重复上述创建流程
        else 用户选择修改时间
            UI->>UI: 重新显示编辑表单
        end
    end
```

### 2.2 查看日程时序图

```mermaid
sequenceDiagram
    participant U as 用户
    participant UI as 日程界面
    participant CC as 日程控制器
    participant CS as 日程服务
    participant Cache as 缓存服务
    participant DB as 数据库
    
    U->>UI: 访问日程页面
    UI->>CC: GET /api/calendar/events?start=2025-01-01&end=2025-01-31
    
    CC->>Cache: 检查缓存
    
    alt 缓存命中
        Cache-->>CC: 返回缓存的事件数据
        CC-->>UI: 返回事件列表
    else 缓存未命中
        CC->>CS: getEventsByDateRange(startDate, endDate)
        CS->>DB: 查询数据库
        DB-->>CS: 返回事件数据
        CS-->>CC: 返回处理后的事件
        CC->>Cache: 缓存事件数据
        CC-->>UI: 返回事件列表
    end
    
    UI->>UI: 渲染日历视图
    UI-->>U: 显示日程事件
    
    U->>UI: 切换视图模式 (日/周/月)
    UI->>UI: 重新组织和显示数据
    
    U->>UI: 点击特定事件
    UI->>CC: GET /api/calendar/events/{eventId}
    CC->>CS: getEventById(eventId)
    CS->>DB: 查询事件详情
    DB-->>CS: 返回详细信息
    CS-->>CC: 返回事件详情
    CC-->>UI: 返回事件详情
    UI-->>U: 显示事件详情弹窗
```

---

## 3. 案件管理流程

### 3.1 创建案件时序图

```mermaid
sequenceDiagram
    participant U as 律师
    participant UI as 案件界面
    participant CaseC as 案件控制器
    participant CaseS as 案件服务
    participant UserS as 用户服务
    participant FileS as 文件服务
    participant DB as 数据库
    participant NS as 通知服务
    
    U->>UI: 点击"新建案件"
    UI->>UI: 显示案件创建表单
    U->>UI: 填写案件信息
    U->>UI: 上传相关文档
    U->>UI: 提交表单
    
    UI->>CaseC: POST /api/cases
    CaseC->>CaseS: createCase(caseData)
    
    CaseS->>UserS: 验证客户信息
    UserS-->>CaseS: 客户信息有效
    
    CaseS->>DB: 开始数据库事务
    CaseS->>DB: 创建案件记录
    DB-->>CaseS: 返回案件ID
    
    loop 处理上传的文档
        CaseS->>FileS: uploadDocument(file, caseId)
        FileS->>FileS: 验证文件类型和大小
        FileS->>FileS: 保存文件到存储
        FileS->>DB: 保存文档记录
        FileS-->>CaseS: 返回文档信息
    end
    
    CaseS->>DB: 提交事务
    CaseS-->>CaseC: 返回创建的案件
    
    CaseC->>NS: 发送案件创建通知
    NS->>NS: 通知相关人员
    
    CaseC-->>UI: 返回成功响应
    UI-->>U: 显示成功消息并跳转到案件详情
```

### 3.2 案件状态更新时序图

```mermaid
sequenceDiagram
    participant U as 用户
    participant UI as 案件界面
    participant CaseC as 案件控制器
    participant CaseS as 案件服务
    participant WF as 工作流服务
    participant DB as 数据库
    participant NS as 通知服务
    participant AS as 审计服务
    
    U->>UI: 选择案件状态更新
    UI->>UI: 显示状态选择界面
    U->>UI: 选择新状态并添加备注
    U->>UI: 确认更新
    
    UI->>CaseC: PUT /api/cases/{caseId}/status
    CaseC->>CaseS: updateCaseStatus(caseId, newStatus, notes)
    
    CaseS->>WF: 验证状态转换是否合法
    WF-->>CaseS: 状态转换有效
    
    CaseS->>DB: 开始事务
    CaseS->>DB: 更新案件状态
    CaseS->>DB: 记录状态变更历史
    CaseS->>DB: 提交事务
    
    CaseS->>AS: 记录审计日志
    AS->>AS: 创建状态变更审计记录
    
    CaseS-->>CaseC: 返回更新结果
    
    CaseC->>NS: 发送状态更新通知
    NS->>NS: 通知客户和相关人员
    
    CaseC-->>UI: 返回成功响应
    UI->>UI: 更新界面显示
    UI-->>U: 显示更新成功消息
```

---

## 4. 工时记录流程

### 4.1 工时记录时序图

```mermaid
sequenceDiagram
    participant U as 用户
    participant UI as 工时界面
    participant TC as 工时控制器
    participant TS as 工时服务
    participant Timer as 计时器服务
    participant DB as 数据库
    participant BS as 计费服务
    
    U->>UI: 点击"开始工作"
    UI->>TC: POST /api/time/start
    TC->>TS: startTimeTracking(userId, caseId)
    TS->>Timer: 启动计时器
    Timer-->>TS: 返回计时器ID
    TS->>DB: 创建工时记录 (开始时间)
    TS-->>TC: 返回计时会话
    TC-->>UI: 返回计时状态
    UI-->>U: 显示计时器界面
    
    Note over U,UI: 用户工作期间...
    
    U->>UI: 点击"暂停"
    UI->>TC: POST /api/time/pause
    TC->>TS: pauseTimeTracking(sessionId)
    TS->>Timer: 暂停计时器
    TS->>DB: 记录暂停时间
    TS-->>TC: 返回暂停状态
    TC-->>UI: 返回暂停确认
    UI-->>U: 显示暂停状态
    
    U->>UI: 点击"继续"
    UI->>TC: POST /api/time/resume
    TC->>TS: resumeTimeTracking(sessionId)
    TS->>Timer: 恢复计时器
    TS->>DB: 记录恢复时间
    TS-->>TC: 返回恢复状态
    TC-->>UI: 返回恢复确认
    UI-->>U: 显示计时状态
    
    U->>UI: 点击"结束工作"
    UI->>UI: 显示工时确认表单
    U->>UI: 填写工作描述和确认信息
    U->>UI: 提交工时记录
    
    UI->>TC: POST /api/time/stop
    TC->>TS: stopTimeTracking(sessionId, description)
    TS->>Timer: 停止计时器
    Timer-->>TS: 返回总工作时长
    TS->>DB: 更新工时记录 (结束时间、总时长)
    
    TS->>BS: 计算计费金额
    BS->>BS: 根据费率计算金额
    BS-->>TS: 返回计费信息
    
    TS->>DB: 保存完整的工时记录
    TS-->>TC: 返回完成的工时记录
    TC-->>UI: 返回工时记录
    UI-->>U: 显示工时记录确认
```

### 4.2 工时审批时序图

```mermaid
sequenceDiagram
    participant L as 律师
    participant A as 管理员
    participant UI as 审批界面
    participant AC as 审批控制器
    participant AS as 审批服务
    participant NS as 通知服务
    participant DB as 数据库
    participant RS as 报告服务
    
    L->>UI: 提交工时记录审批
    UI->>AC: POST /api/time/submit-for-approval
    AC->>AS: submitForApproval(timeEntryIds)
    AS->>DB: 更新工时记录状态为"待审批"
    AS->>NS: 通知管理员有新的审批请求
    AS-->>AC: 返回提交结果
    AC-->>UI: 返回成功响应
    UI-->>L: 显示提交成功消息
    
    NS->>A: 发送审批通知
    A->>UI: 访问审批页面
    UI->>AC: GET /api/time/pending-approval
    AC->>AS: getPendingApprovals()
    AS->>DB: 查询待审批工时记录
    DB-->>AS: 返回待审批列表
    AS-->>AC: 返回审批列表
    AC-->>UI: 返回待审批数据
    UI-->>A: 显示待审批工时列表
    
    A->>UI: 查看工时记录详情
    A->>UI: 做出审批决定 (批准/拒绝)
    UI->>AC: POST /api/time/approve 或 POST /api/time/reject
    AC->>AS: approveTimeEntry(entryId) 或 rejectTimeEntry(entryId, reason)
    
    alt 审批通过
        AS->>DB: 更新状态为"已批准"
        AS->>RS: 更新计费报告
        AS->>NS: 通知律师审批通过
    else 审批拒绝
        AS->>DB: 更新状态为"已拒绝"
        AS->>NS: 通知律师审批拒绝及原因
    end
    
    AS-->>AC: 返回审批结果
    AC-->>UI: 返回操作结果
    UI-->>A: 显示操作成功消息
    
    NS->>L: 发送审批结果通知
```

---

## 5. 实时通信流程

### 5.1 WebSocket连接和消息推送时序图 ？？？——留言功能如何实现

```mermaid
sequenceDiagram
    participant C as 客户端
    participant WS as WebSocket服务
    participant AS as 认证服务
    participant MS as 消息服务
    participant DB as 数据库
    participant NS as 通知服务
    
    C->>WS: 建立WebSocket连接 (携带令牌)
    WS->>AS: 验证用户令牌
    AS-->>WS: 返回用户信息
    WS->>WS: 将用户添加到在线用户列表
    WS-->>C: 连接建立成功
    
    Note over C,WS: 连接保持活跃...
    
    participant U2 as 其他用户
    U2->>MS: 创建新的日程事件
    MS->>DB: 保存事件到数据库
    MS->>NS: 触发实时通知
    NS->>WS: 发送事件创建消息
    
    WS->>WS: 查找相关用户连接
    WS->>C: 推送事件创建通知
    C->>C: 处理实时消息
    C->>C: 更新本地状态
    C-->>C: 显示通知给用户
    
    Note over C,WS: 心跳保持连接...
    
    loop 每30秒
        C->>WS: 发送心跳包
        WS-->>C: 返回心跳响应
    end
    
    alt 连接断开
        C->>WS: 连接断开
        WS->>WS: 从在线用户列表移除用户
        WS->>WS: 清理用户相关资源
    end
```

---

## 6. 错误处理和重试机制

### 6.1 API请求错误处理时序图

```mermaid
sequenceDiagram
    participant UI as 前端界面
    participant API as API客户端
    participant Server as 服务器
    participant Cache as 缓存
    participant Retry as 重试机制
    
    UI->>API: 发起API请求
    API->>Server: HTTP请求
    
    alt 服务器正常响应
        Server-->>API: 返回成功响应
        API-->>UI: 返回数据
    else 网络错误 (5xx)
        Server-->>API: 返回服务器错误
        API->>Retry: 触发重试机制
        
        loop 最多重试3次
            Retry->>Server: 重新发送请求
            alt 重试成功
                Server-->>Retry: 返回成功响应
                Retry-->>API: 返回成功结果
                API-->>UI: 返回数据
            else 重试仍然失败
                Server-->>Retry: 返回错误
                Note over Retry: 等待指数退避时间
            end
        end
        
        alt 所有重试都失败
            Retry-->>API: 返回最终失败
            API->>Cache: 尝试从缓存获取数据
            alt 缓存命中
                Cache-->>API: 返回缓存数据
                API-->>UI: 返回缓存数据 (标记为离线)
            else 缓存未命中
                API-->>UI: 返回错误信息
                UI->>UI: 显示错误提示
            end
        end
        
    else 客户端错误 (4xx)
        Server-->>API: 返回客户端错误
        API-->>UI: 返回错误信息
        UI->>UI: 显示相应错误提示
        
        alt 401 未授权
            UI->>API: 尝试刷新令牌
            Note over UI,Server: 执行令牌刷新流程
        end
    end
```

---

**文档版本**: v1.0  
**最后更新**: 2025年7月  
**维护人员**: 赵启睿  
**审核人员**: 赵启睿
