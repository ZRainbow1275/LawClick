# 组件图 (Component Diagram)

## 概述

本文档描述律时(LawClick)跨平台系统的组件架构图，展示Web端(Next.js)和移动端(React Native + Expo)的模块划分、组件间的依赖关系和接口定义。

---

## 1. 系统整体组件架构

### 1.1 高层组件视图

```mermaid
graph TB
    subgraph "客户端层 Client Layer"
        WebApp[Web应用<br/>Next.js App]
        MobileApp[移动应用<br/>React Native + Expo]
    end
    
    subgraph "API网关层 API Gateway Layer"
        Gateway[API网关<br/>Next.js API Routes]
        Auth[认证中间件<br/>JWT Middleware]
        RateLimit[限流中间件<br/>Rate Limiter]
    end
    
    subgraph "业务服务层 Business Service Layer"
        CalendarService[日程服务<br/>Calendar Service]
        CaseService[案件服务<br/>Case Service]
        TimeService[工时服务<br/>Time Service]
        UserService[用户服务<br/>User Service]
        NotificationService[通知服务<br/>Notification Service]
        FileService[文件服务<br/>File Service]
    end
    
    subgraph "数据访问层 Data Access Layer"
        CalendarRepo[日程仓储<br/>Calendar Repository]
        CaseRepo[案件仓储<br/>Case Repository]
        TimeRepo[工时仓储<br/>Time Repository]
        UserRepo[用户仓储<br/>User Repository]
    end
    
    subgraph "基础设施层 Infrastructure Layer"
        Database[(PostgreSQL<br/>数据库)]
        Cache[(Redis<br/>缓存)]
        FileStorage[(文件存储<br/>File Storage)]
        MessageQueue[消息队列<br/>Message Queue]
        WebSocket[WebSocket<br/>实时通信]
    end
    
    subgraph "外部服务 External Services"
        EmailService[邮件服务<br/>Email Service]
        SMSService[短信服务<br/>SMS Service]
        AIService[AI服务<br/>OpenAI API]
        CloudStorage[云存储<br/>Cloud Storage]
    end
    
    %% 连接关系
    WebApp --> Gateway
    MobileApp --> Gateway
    
    Gateway --> Auth
    Gateway --> RateLimit
    Gateway --> CalendarService
    Gateway --> CaseService
    Gateway --> TimeService
    Gateway --> UserService
    
    CalendarService --> CalendarRepo
    CaseService --> CaseRepo
    TimeService --> TimeRepo
    UserService --> UserRepo
    
    CalendarService --> NotificationService
    CaseService --> FileService
    TimeService --> NotificationService
    
    CalendarRepo --> Database
    CaseRepo --> Database
    TimeRepo --> Database
    UserRepo --> Database
    
    NotificationService --> Cache
    NotificationService --> MessageQueue
    NotificationService --> WebSocket
    
    FileService --> FileStorage
    FileService --> CloudStorage
    
    NotificationService --> EmailService
    NotificationService --> SMSService
    
    CaseService --> AIService
```

---

## 2. 跨平台架构对比

### 2.1 平台架构差异

```mermaid
graph TB
    subgraph "Web端架构 (Next.js)"
        WebApp[Next.js App]
        WebPages[Page Components]
        WebComponents[React Components]
        WebUI[HTML/CSS UI]
        WebBrowser[浏览器环境]
    end

    subgraph "移动端架构 (React Native)"
        MobileApp[React Native App]
        MobileScreens[Screen Components]
        MobileComponents[React Native Components]
        MobileUI[Native UI Components]
        MobileOS[iOS/Android OS]
    end

    subgraph "共享层 (Shared Layer)"
        SharedAPI[API Client]
        SharedTypes[TypeScript Types]
        SharedUtils[Utility Functions]
        SharedHooks[Custom Hooks]
    end

    WebApp --> WebPages
    WebPages --> WebComponents
    WebComponents --> WebUI
    WebUI --> WebBrowser

    MobileApp --> MobileScreens
    MobileScreens --> MobileComponents
    MobileComponents --> MobileUI
    MobileUI --> MobileOS

    WebComponents --> SharedAPI
    MobileComponents --> SharedAPI
    WebComponents --> SharedTypes
    MobileComponents --> SharedTypes
    WebComponents --> SharedUtils
    MobileComponents --> SharedUtils
    WebComponents --> SharedHooks
    MobileComponents --> SharedHooks
```

---

## 3. Web端组件架构 (Next.js)

### 3.1 React组件层次结构

```mermaid
graph TB
    subgraph "应用层 Application Layer"
        App[App<br/>应用根组件]
        Router[Router<br/>路由管理]
        Providers[Providers<br/>上下文提供者]
    end
    
    subgraph "页面层 Page Layer"
        Dashboard[Dashboard<br/>仪表盘页面]
        Calendar[Calendar<br/>日程页面]
        Cases[Cases<br/>案件页面]
        TimeLog[TimeLog<br/>工时页面]
        Profile[Profile<br/>个人资料页面]
    end
    
    subgraph "功能组件层 Feature Component Layer"
        CalendarView[CalendarView<br/>日历视图]
        EventForm[EventForm<br/>事件表单]
        CaseList[CaseList<br/>案件列表]
        CaseForm[CaseForm<br/>案件表单]
        TimeTracker[TimeTracker<br/>时间追踪器]
        TimeReport[TimeReport<br/>工时报告]
    end
    
    subgraph "业务组件层 Business Component Layer"
        EventCard[EventCard<br/>事件卡片]
        CaseCard[CaseCard<br/>案件卡片]
        TimeEntry[TimeEntry<br/>工时条目]
        UserCard[UserCard<br/>用户卡片]
        DocumentList[DocumentList<br/>文档列表]
    end
    
    subgraph "UI组件层 UI Component Layer"
        Button[Button<br/>按钮]
        Input[Input<br/>输入框]
        Modal[Modal<br/>模态框]
        Card[Card<br/>卡片]
        Table[Table<br/>表格]
        Form[Form<br/>表单]
    end
    
    subgraph "布局组件层 Layout Component Layer"
        MobileLayout[MobileLayout<br/>移动端布局]
        Header[Header<br/>头部]
        Sidebar[Sidebar<br/>侧边栏]
        BottomNav[BottomNav<br/>底部导航]
    end
    
    subgraph "工具层 Utility Layer"
        Hooks[Custom Hooks<br/>自定义钩子]
        Utils[Utils<br/>工具函数]
        Constants[Constants<br/>常量]
        Types[Types<br/>类型定义]
    end
    
    %% 依赖关系
    App --> Router
    App --> Providers
    Router --> Dashboard
    Router --> Calendar
    Router --> Cases
    Router --> TimeLog
    Router --> Profile
    
    Calendar --> CalendarView
    Calendar --> EventForm
    Cases --> CaseList
    Cases --> CaseForm
    TimeLog --> TimeTracker
    TimeLog --> TimeReport
    
    CalendarView --> EventCard
    CaseList --> CaseCard
    TimeTracker --> TimeEntry
    EventForm --> Form
    CaseForm --> Form
    
    EventCard --> Card
    CaseCard --> Card
    TimeEntry --> Card
    Form --> Input
    Form --> Button
    
    Dashboard --> MobileLayout
    Calendar --> MobileLayout
    MobileLayout --> Header
    MobileLayout --> BottomNav
    
    CalendarView --> Hooks
    CaseList --> Hooks
    TimeTracker --> Hooks
    EventCard --> Utils
    CaseCard --> Utils
```

---

## 4. 移动端组件架构 (React Native + Expo)

### 4.1 React Native组件层次结构

```mermaid
graph TB
    subgraph "应用层 Application Layer"
        AppNavigator[AppNavigator<br/>应用导航器]
        ExpoApp[Expo App<br/>Expo应用包装器]
        Providers[Providers<br/>状态提供者]
    end

    subgraph "屏幕层 Screen Layer"
        DashboardScreen[DashboardScreen<br/>仪表盘屏幕]
        CalendarScreen[CalendarScreen<br/>日程屏幕]
        CasesScreen[CasesScreen<br/>案件屏幕]
        TimeLogScreen[TimeLogScreen<br/>工时屏幕]
        ProfileScreen[ProfileScreen<br/>个人资料屏幕]
    end

    subgraph "功能组件层 Feature Component Layer"
        CalendarView[CalendarView<br/>日历视图]
        EventForm[EventForm<br/>事件表单]
        CaseList[CaseList<br/>案件列表]
        CaseForm[CaseForm<br/>案件表单]
        TimeTracker[TimeTracker<br/>时间追踪器]
        TimeReport[TimeReport<br/>工时报告]
    end

    subgraph "业务组件层 Business Component Layer"
        EventCard[EventCard<br/>事件卡片]
        CaseCard[CaseCard<br/>案件卡片]
        TimeEntry[TimeEntry<br/>工时条目]
        UserCard[UserCard<br/>用户卡片]
        DocumentList[DocumentList<br/>文档列表]
    end

    subgraph "原生UI组件层 Native UI Component Layer"
        Button[Button<br/>按钮]
        Input[Input<br/>输入框]
        Modal[Modal<br/>模态框]
        Card[Card<br/>卡片]
        FlatList[FlatList<br/>列表]
        TouchableOpacity[TouchableOpacity<br/>触摸组件]
    end

    subgraph "布局组件层 Layout Component Layer"
        ScreenLayout[ScreenLayout<br/>屏幕布局]
        SafeAreaView[SafeAreaView<br/>安全区域]
        KeyboardAvoidingView[KeyboardAvoidingView<br/>键盘避让]
        ScrollView[ScrollView<br/>滚动视图]
        StatusBar[StatusBar<br/>状态栏]
    end

    subgraph "导航组件层 Navigation Component Layer"
        StackNavigator[StackNavigator<br/>堆栈导航]
        TabNavigator[TabNavigator<br/>标签导航]
        DrawerNavigator[DrawerNavigator<br/>抽屉导航]
        NavigationHeader[NavigationHeader<br/>导航头部]
    end

    subgraph "工具层 Utility Layer"
        NativeHooks[Native Hooks<br/>原生钩子]
        PlatformUtils[Platform Utils<br/>平台工具]
        NativeConstants[Native Constants<br/>原生常量]
        NativeTypes[Native Types<br/>原生类型]
    end

    %% 依赖关系
    ExpoApp --> AppNavigator
    AppNavigator --> Providers
    AppNavigator --> StackNavigator
    StackNavigator --> TabNavigator
    TabNavigator --> DashboardScreen
    TabNavigator --> CalendarScreen
    TabNavigator --> CasesScreen
    TabNavigator --> TimeLogScreen
    TabNavigator --> ProfileScreen

    CalendarScreen --> CalendarView
    CalendarScreen --> EventForm
    CasesScreen --> CaseList
    CasesScreen --> CaseForm
    TimeLogScreen --> TimeTracker
    TimeLogScreen --> TimeReport

    CalendarView --> EventCard
    CaseList --> CaseCard
    TimeTracker --> TimeEntry
    EventForm --> Input
    EventForm --> Button

    EventCard --> Card
    CaseCard --> Card
    TimeEntry --> TouchableOpacity

    DashboardScreen --> ScreenLayout
    CalendarScreen --> ScreenLayout
    ScreenLayout --> SafeAreaView
    ScreenLayout --> StatusBar
    ScreenLayout --> ScrollView

    CalendarView --> NativeHooks
    CaseList --> NativeHooks
    TimeTracker --> NativeHooks
    EventCard --> PlatformUtils
    CaseCard --> PlatformUtils
```

### 4.2 Expo特定组件

```mermaid
graph TB
    subgraph "Expo SDK组件 Expo SDK Components"
        ExpoCamera[Expo Camera<br/>相机组件]
        ExpoLocation[Expo Location<br/>定位组件]
        ExpoNotifications[Expo Notifications<br/>通知组件]
        ExpoSecureStore[Expo SecureStore<br/>安全存储]
        ExpoFileSystem[Expo FileSystem<br/>文件系统]
        ExpoConstants[Expo Constants<br/>应用常量]
        ExpoUpdates[Expo Updates<br/>OTA更新]
    end

    subgraph "业务功能集成 Business Integration"
        DocumentScanner[DocumentScanner<br/>文档扫描]
        LocationTracker[LocationTracker<br/>位置追踪]
        PushNotificationManager[PushNotificationManager<br/>推送通知管理]
        SecureDataManager[SecureDataManager<br/>安全数据管理]
        FileUploader[FileUploader<br/>文件上传]
        AppUpdater[AppUpdater<br/>应用更新]
    end

    %% Expo SDK到业务功能的映射
    ExpoCamera --> DocumentScanner
    ExpoLocation --> LocationTracker
    ExpoNotifications --> PushNotificationManager
    ExpoSecureStore --> SecureDataManager
    ExpoFileSystem --> FileUploader
    ExpoUpdates --> AppUpdater
```

### 4.3 状态管理组件 (React Native)

```mermaid
graph TB
    subgraph "全局状态 Global State"
        AppContext[AppContext<br/>应用上下文]
        AuthContext[AuthContext<br/>认证上下文]
        ThemeContext[ThemeContext<br/>主题上下文]
    end
    
    subgraph "业务状态 Business State"
        CalendarContext[CalendarContext<br/>日程上下文]
        CaseContext[CaseContext<br/>案件上下文]
        TimeContext[TimeContext<br/>工时上下文]
    end
    
    subgraph "UI状态 UI State"
        ModalState[ModalState<br/>模态框状态]
        LoadingState[LoadingState<br/>加载状态]
        NotificationState[NotificationState<br/>通知状态]
    end
    
    subgraph "数据管理 Data Management"
        ApiClient[ApiClient<br/>API客户端]
        CacheManager[CacheManager<br/>缓存管理]
        OfflineManager[OfflineManager<br/>离线管理]
    end
    
    AppContext --> AuthContext
    AppContext --> ThemeContext
    CalendarContext --> ApiClient
    CaseContext --> ApiClient
    TimeContext --> ApiClient
    ApiClient --> CacheManager
    ApiClient --> OfflineManager
```

---

## 3. 后端服务组件架构

### 3.1 微服务组件视图

```mermaid
graph TB
    subgraph "API层 API Layer"
        AuthAPI[认证API<br/>Authentication API]
        CalendarAPI[日程API<br/>Calendar API]
        CaseAPI[案件API<br/>Case API]
        TimeAPI[工时API<br/>Time API]
        FileAPI[文件API<br/>File API]
        NotificationAPI[通知API<br/>Notification API]
    end
    
    subgraph "业务逻辑层 Business Logic Layer"
        AuthService[认证服务<br/>Auth Service]
        CalendarService[日程服务<br/>Calendar Service]
        CaseService[案件服务<br/>Case Service]
        TimeService[工时服务<br/>Time Service]
        FileService[文件服务<br/>File Service]
        NotificationService[通知服务<br/>Notification Service]
        WorkflowService[工作流服务<br/>Workflow Service]
    end
    
    subgraph "领域服务层 Domain Service Layer"
        UserDomain[用户领域<br/>User Domain]
        CalendarDomain[日程领域<br/>Calendar Domain]
        CaseDomain[案件领域<br/>Case Domain]
        TimeDomain[工时领域<br/>Time Domain]
        BillingDomain[计费领域<br/>Billing Domain]
    end
    
    subgraph "数据访问层 Data Access Layer"
        UserRepository[用户仓储<br/>User Repository]
        CalendarRepository[日程仓储<br/>Calendar Repository]
        CaseRepository[案件仓储<br/>Case Repository]
        TimeRepository[工时仓储<br/>Time Repository]
        FileRepository[文件仓储<br/>File Repository]
    end
    
    subgraph "基础设施层 Infrastructure Layer"
        DatabaseAdapter[数据库适配器<br/>Database Adapter]
        CacheAdapter[缓存适配器<br/>Cache Adapter]
        FileAdapter[文件适配器<br/>File Adapter]
        MessageAdapter[消息适配器<br/>Message Adapter]
        EmailAdapter[邮件适配器<br/>Email Adapter]
    end
    
    %% API到服务的连接
    AuthAPI --> AuthService
    CalendarAPI --> CalendarService
    CaseAPI --> CaseService
    TimeAPI --> TimeService
    FileAPI --> FileService
    NotificationAPI --> NotificationService
    
    %% 服务到领域的连接
    AuthService --> UserDomain
    CalendarService --> CalendarDomain
    CaseService --> CaseDomain
    TimeService --> TimeDomain
    TimeService --> BillingDomain
    
    %% 服务间依赖
    CalendarService --> NotificationService
    CaseService --> FileService
    TimeService --> NotificationService
    CaseService --> WorkflowService
    
    %% 领域到仓储的连接
    UserDomain --> UserRepository
    CalendarDomain --> CalendarRepository
    CaseDomain --> CaseRepository
    TimeDomain --> TimeRepository
    
    %% 仓储到基础设施的连接
    UserRepository --> DatabaseAdapter
    CalendarRepository --> DatabaseAdapter
    CaseRepository --> DatabaseAdapter
    TimeRepository --> DatabaseAdapter
    FileRepository --> FileAdapter
    
    %% 服务到基础设施的连接
    NotificationService --> MessageAdapter
    NotificationService --> EmailAdapter
    CalendarService --> CacheAdapter
    CaseService --> CacheAdapter
```

---

## 4. 接口定义

### 4.1 主要接口规范

#### ICalendarService接口
```typescript
interface ICalendarService {
  // 事件管理
  createEvent(eventData: CreateEventData): Promise<CalendarEvent>;
  updateEvent(eventId: string, updates: Partial<CalendarEvent>): Promise<CalendarEvent>;
  deleteEvent(eventId: string): Promise<boolean>;
  getEvent(eventId: string): Promise<CalendarEvent>;
  
  // 事件查询
  getEventsByDateRange(startDate: Date, endDate: Date): Promise<CalendarEvent[]>;
  getEventsByUser(userId: string): Promise<CalendarEvent[]>;
  getEventsByCase(caseId: string): Promise<CalendarEvent[]>;
  
  // 冲突检测
  checkConflicts(event: CalendarEvent): Promise<CalendarEvent[]>;
  getAvailableSlots(userId: string, date: Date, duration: number): Promise<TimeSlot[]>;
  
  // 提醒管理
  scheduleReminder(event: CalendarEvent): Promise<void>;
  cancelReminder(eventId: string): Promise<void>;
}
```

#### ICaseService接口
```typescript
interface ICaseService {
  // 案件管理
  createCase(caseData: CreateCaseData): Promise<Case>;
  updateCase(caseId: string, updates: Partial<Case>): Promise<Case>;
  deleteCase(caseId: string): Promise<boolean>;
  getCase(caseId: string): Promise<Case>;
  
  // 案件查询
  getCasesByLawyer(lawyerId: string): Promise<Case[]>;
  getCasesByClient(clientId: string): Promise<Case[]>;
  getCasesByStatus(status: CaseStatus): Promise<Case[]>;
  searchCases(query: string): Promise<Case[]>;
  
  // 案件统计
  getCaseStatistics(caseId: string): Promise<CaseStatistics>;
  getCaseProgress(caseId: string): Promise<CaseProgress>;
  
  // 文档管理
  addDocument(caseId: string, document: CaseDocument): Promise<CaseDocument>;
  removeDocument(caseId: string, documentId: string): Promise<boolean>;
  getDocuments(caseId: string): Promise<CaseDocument[]>;
}
```

#### ITimeService接口
```typescript
interface ITimeService {
  // 工时记录
  startTimeTracking(userId: string, caseId?: string): Promise<TimeSession>;
  pauseTimeTracking(sessionId: string): Promise<void>;
  resumeTimeTracking(sessionId: string): Promise<void>;
  stopTimeTracking(sessionId: string, description: string): Promise<TimeEntry>;
  
  // 工时管理
  createTimeEntry(entryData: CreateTimeEntryData): Promise<TimeEntry>;
  updateTimeEntry(entryId: string, updates: Partial<TimeEntry>): Promise<TimeEntry>;
  deleteTimeEntry(entryId: string): Promise<boolean>;
  getTimeEntry(entryId: string): Promise<TimeEntry>;
  
  // 工时查询
  getTimeEntriesByUser(userId: string, dateRange?: DateRange): Promise<TimeEntry[]>;
  getTimeEntriesByCase(caseId: string): Promise<TimeEntry[]>;
  
  // 工时报告
  generateTimeReport(userId: string, dateRange: DateRange): Promise<TimeReport>;
  exportTimeReport(reportId: string, format: 'pdf' | 'excel'): Promise<Blob>;
  
  // 工时审批
  submitForApproval(entryIds: string[]): Promise<void>;
  approveTimeEntries(entryIds: string[], approverId: string): Promise<void>;
  rejectTimeEntries(entryIds: string[], reason: string): Promise<void>;
}
```

---

## 5. 组件间通信

### 5.1 同步通信模式

```mermaid
graph LR
    subgraph "同步调用 Synchronous Calls"
        A[前端组件] -->|HTTP/HTTPS| B[API网关]
        B -->|函数调用| C[业务服务]
        C -->|SQL查询| D[数据库]
    end
    
    subgraph "接口契约 Interface Contracts"
        E[REST API] 
        F[GraphQL API]
        G[TypeScript接口]
    end
    
    A -.->|遵循| E
    A -.->|遵循| F
    C -.->|实现| G
```

### 5.2 异步通信模式

```mermaid
graph TB
    subgraph "异步通信 Asynchronous Communication"
        A[事件发布者] -->|发布事件| B[消息队列]
        B -->|订阅事件| C[事件处理器]
        
        D[WebSocket服务] -->|实时推送| E[前端客户端]
        
        F[定时任务] -->|触发| G[后台服务]
    end
    
    subgraph "事件类型 Event Types"
        H[用户事件]
        I[业务事件]
        J[系统事件]
    end
    
    A -.->|产生| H
    A -.->|产生| I
    A -.->|产生| J
```

---

## 7. 部署组件视图

### 7.1 跨平台部署架构

```mermaid
graph TB
    subgraph "Web端部署 Web Deployment"
        subgraph "CDN层 CDN Layer"
            CDN[内容分发网络<br/>CloudFlare CDN]
        end

        subgraph "负载均衡层 Load Balancer Layer"
            LB[负载均衡器<br/>Nginx Load Balancer]
        end

        subgraph "应用服务器层 Application Server Layer"
            App1[应用实例1<br/>Next.js App]
            App2[应用实例2<br/>Next.js App]
            App3[应用实例3<br/>Next.js App]
        end
    end

    subgraph "移动端部署 Mobile Deployment"
        subgraph "应用商店 App Stores"
            AppStore[Apple App Store<br/>iOS应用发布]
            PlayStore[Google Play Store<br/>Android应用发布]
        end

        subgraph "Expo服务 Expo Services"
            ExpoEAS[Expo EAS Build<br/>云端构建服务]
            ExpoOTA[Expo OTA Updates<br/>热更新服务]
            ExpoPush[Expo Push Notifications<br/>推送通知服务]
        end

        subgraph "移动端设备 Mobile Devices"
            iOSDevices[iOS设备<br/>iPhone/iPad]
            AndroidDevices[Android设备<br/>手机/平板]
        end
    end

    subgraph "共享基础设施 Shared Infrastructure"
        subgraph "数据库层 Database Layer"
            PrimaryDB[(主数据库<br/>PostgreSQL Primary)]
            ReplicaDB[(从数据库<br/>PostgreSQL Replica)]
            Cache[(缓存<br/>Redis Cluster)]
        end

        subgraph "文件存储层 File Storage Layer"
            FileStorage[(文件存储<br/>AWS S3)]
        end

        subgraph "API网关层 API Gateway Layer"
            APIGateway[API网关<br/>统一API服务]
        end

        subgraph "监控层 Monitoring Layer"
            Monitor[监控系统<br/>Prometheus + Grafana]
            Logs[日志系统<br/>ELK Stack]
            MobileAnalytics[移动端分析<br/>Firebase Analytics]
        end
    end

    %% Web端连接
    CDN --> LB
    LB --> App1
    LB --> App2
    LB --> App3

    %% 移动端连接
    ExpoEAS --> AppStore
    ExpoEAS --> PlayStore
    AppStore --> iOSDevices
    PlayStore --> AndroidDevices
    ExpoOTA --> iOSDevices
    ExpoOTA --> AndroidDevices
    ExpoPush --> iOSDevices
    ExpoPush --> AndroidDevices

    %% 共享基础设施连接
    App1 --> APIGateway
    App2 --> APIGateway
    App3 --> APIGateway
    iOSDevices --> APIGateway
    AndroidDevices --> APIGateway

    APIGateway --> PrimaryDB
    PrimaryDB --> ReplicaDB
    APIGateway --> Cache
    APIGateway --> FileStorage

    App1 --> Monitor
    App2 --> Monitor
    App3 --> Monitor
    APIGateway --> Monitor

    App1 --> Logs
    App2 --> Logs
    App3 --> Logs
    APIGateway --> Logs

    iOSDevices --> MobileAnalytics
    AndroidDevices --> MobileAnalytics
```

### 7.2 移动端发布流程

```mermaid
graph TB
    subgraph "开发阶段 Development Phase"
        DevCode[开发代码<br/>React Native + Expo]
        DevTest[本地测试<br/>Expo Go]
        DevBuild[开发构建<br/>Expo Dev Client]
    end

    subgraph "构建阶段 Build Phase"
        EASBuild[EAS Build<br/>云端构建]
        iOSBuild[iOS构建<br/>.ipa文件]
        AndroidBuild[Android构建<br/>.apk/.aab文件]
    end

    subgraph "测试阶段 Testing Phase"
        TestFlight[TestFlight<br/>iOS内测]
        InternalTesting[Internal Testing<br/>Android内测]
        UAT[用户验收测试<br/>UAT]
    end

    subgraph "发布阶段 Release Phase"
        AppStoreReview[App Store审核<br/>iOS审核流程]
        PlayStoreReview[Play Store审核<br/>Android审核流程]
        Production[生产发布<br/>正式上线]
    end

    subgraph "更新阶段 Update Phase"
        OTAUpdate[OTA更新<br/>热更新]
        StoreUpdate[商店更新<br/>版本更新]
    end

    %% 流程连接
    DevCode --> DevTest
    DevTest --> DevBuild
    DevBuild --> EASBuild

    EASBuild --> iOSBuild
    EASBuild --> AndroidBuild

    iOSBuild --> TestFlight
    AndroidBuild --> InternalTesting
    TestFlight --> UAT
    InternalTesting --> UAT

    UAT --> AppStoreReview
    UAT --> PlayStoreReview
    AppStoreReview --> Production
    PlayStoreReview --> Production

    Production --> OTAUpdate
    Production --> StoreUpdate
```

---

## 7. 安全组件

### 7.1 安全架构组件

```mermaid
graph TB
    subgraph "安全网关 Security Gateway"
        WAF[Web应用防火墙<br/>WAF]
        DDoS[DDoS防护<br/>DDoS Protection]
        SSL[SSL终端<br/>SSL Termination]
    end
    
    subgraph "认证授权 Authentication & Authorization"
        AuthService[认证服务<br/>Auth Service]
        JWTService[JWT服务<br/>JWT Service]
        RBACService[权限控制<br/>RBAC Service]
    end
    
    subgraph "数据安全 Data Security"
        Encryption[数据加密<br/>Data Encryption]
        Backup[数据备份<br/>Data Backup]
        Audit[审计日志<br/>Audit Logs]
    end
    
    subgraph "网络安全 Network Security"
        VPN[VPN网关<br/>VPN Gateway]
        Firewall[防火墙<br/>Firewall]
        IDS[入侵检测<br/>IDS/IPS]
    end
    
    WAF --> AuthService
    AuthService --> JWTService
    AuthService --> RBACService
    
    JWTService --> Encryption
    RBACService --> Audit
    
    VPN --> Firewall
    Firewall --> IDS
```

---

**文档版本**: v1.0  
**最后更新**: 2025年7月  
**维护人员**: 赵启睿  
**审核人员**: 赵启睿
