# 律时 (LawClick) 项目架构文档

## 项目概述

**项目名称**: 律时 (LawClick)
**项目类型**: 跨平台法律事务管理应用生态系统
**技术架构**: 前后端分离 + Web端 + 原生移动端
**开发模式**: 敏捷开发 + 持续集成

---

## 1. 项目简介和目标

### 1.1 项目简介
律时(LawClick)是一个专为法律行业设计的跨平台事务管理应用生态系统，包含Web端管理平台和原生移动应用，旨在帮助律师、法律助理和律所管理人员提高工作效率，优化业务流程，提升客户服务质量。

### 1.2 平台架构
- **Web端**: 基于Next.js的管理平台，用于复杂数据管理和报告生成
- **移动端**: 基于React Native + Expo的原生应用，专注移动办公场景
- **后端**: 统一的API服务，支持多平台数据同步

### 1.3 核心目标
- **效率提升**: 通过数字化工具提高法律工作效率20%以上
- **流程优化**: 标准化律所业务流程，减少人为错误
- **客户服务**: 提升客户沟通体验和服务透明度
- **数据驱动**: 基于数据分析优化业务决策

### 1.4 技术目标
- **跨平台**: Web端和移动端无缝协作
- **原生体验**: 移动端提供原生应用级别的用户体验
- **高性能**: 页面加载时间 < 3秒，API响应 < 500ms
- **高可用**: 系统可用性 ≥ 99.5%
- **安全性**: 符合法律行业数据安全标准

---

## 2. 完整文件目录结构

```
lawclick-nextjs/
├── README.md                          # 项目说明文档
├── package.json                       # 项目依赖配置
├── next.config.js                     # Next.js配置文件
├── tailwind.config.js                 # Tailwind CSS配置
├── tsconfig.json                      # TypeScript配置
├── .env.local                         # 环境变量配置
├── .gitignore                         # Git忽略文件
├── 
├── public/                            # 静态资源目录
│   ├── icons/                         # 应用图标
│   ├── images/                        # 图片资源
│   └── manifest.json                  # PWA配置文件
│
├── src/                               # 源代码目录
│   ├── app/                           # Next.js App Router
│   │   ├── layout.tsx                 # 根布局组件
│   │   ├── page.tsx                   # 首页
│   │   ├── globals.css                # 全局样式
│   │   ├── 
│   │   ├── (auth)/                    # 认证相关页面
│   │   │   ├── login/page.tsx         # 登录页面
│   │   │   ├── register/page.tsx      # 注册页面
│   │   │   └── forgot-password/page.tsx # 忘记密码
│   │   │
│   │   ├── dashboard/                 # 仪表盘
│   │   │   ├── page.tsx               # 仪表盘主页
│   │   │   └── components/            # 仪表盘组件
│   │   │
│   │   ├── calendar/                  # 日程管理
│   │   │   ├── page.tsx               # 日程主页
│   │   │   ├── new/page.tsx           # 新建日程
│   │   │   ├── enhanced/page.tsx      # 增强版日程
│   │   │   └── event/[id]/page.tsx    # 事件详情
│   │   │
│   │   ├── cases/                     # 案件管理
│   │   │   ├── page.tsx               # 案件列表
│   │   │   ├── new/page.tsx           # 新建案件
│   │   │   ├── [id]/page.tsx          # 案件详情
│   │   │   └── [id]/edit/page.tsx     # 编辑案件
│   │   │
│   │   ├── time-log/                  # 工时记录
│   │   │   ├── page.tsx               # 工时主页
│   │   │   ├── new/page.tsx           # 新建工时
│   │   │   └── reports/page.tsx       # 工时报告
│   │   │
│   │   ├── communication/             # 沟通管理
│   │   │   ├── page.tsx               # 沟通主页
│   │   │   ├── clients/page.tsx       # 客户沟通
│   │   │   └── internal/page.tsx      # 内部沟通
│   │   │
│   │   ├── contracts/                 # 合同管理
│   │   │   ├── page.tsx               # 合同列表
│   │   │   ├── ai-review/page.tsx     # AI合同审查
│   │   │   └── templates/page.tsx     # 合同模板
│   │   │
│   │   ├── profile/                   # 个人资料
│   │   │   ├── page.tsx               # 个人信息
│   │   │   ├── settings/page.tsx      # 设置页面
│   │   │   └── security/page.tsx      # 安全设置
│   │   │
│   │   ├── ai-chat/                   # AI助手
│   │   │   └── page.tsx               # AI聊天界面
│   │   │
│   │   ├── demo/                      # 功能演示
│   │   │   └── page.tsx               # 演示页面
│   │   │
│   │   └── api/                       # API路由
│   │       ├── auth/                  # 认证API
│   │       ├── calendar/              # 日程API
│   │       ├── cases/                 # 案件API
│   │       ├── time-log/              # 工时API
│   │       └── users/                 # 用户API
│   │
│   ├── components/                    # 可复用组件
│   │   ├── ui/                        # 基础UI组件
│   │   │   ├── Button.tsx             # 按钮组件
│   │   │   ├── Card.tsx               # 卡片组件
│   │   │   ├── Input.tsx              # 输入框组件
│   │   │   ├── Modal.tsx              # 模态框组件
│   │   │   └── Badge.tsx              # 徽章组件
│   │   │
│   │   ├── layout/                    # 布局组件
│   │   │   ├── MobileLayout.tsx       # 移动端布局
│   │   │   ├── Sidebar.tsx            # 侧边栏
│   │   │   ├── Header.tsx             # 头部组件
│   │   │   └── BottomNav.tsx          # 底部导航
│   │   │
│   │   ├── calendar/                  # 日程组件
│   │   │   ├── CalendarView.tsx       # 日历视图
│   │   │   ├── EventCard.tsx          # 事件卡片
│   │   │   └── EnhancedCalendarView.tsx # 增强日历
│   │   │
│   │   ├── cases/                     # 案件组件
│   │   │   ├── CaseCard.tsx           # 案件卡片
│   │   │   ├── CaseForm.tsx           # 案件表单
│   │   │   └── CaseTimeline.tsx       # 案件时间线
│   │   │
│   │   ├── time-log/                  # 工时组件
│   │   │   ├── TimeTracker.tsx        # 时间追踪器
│   │   │   ├── TimeEntry.tsx          # 工时条目
│   │   │   └── TimeReport.tsx         # 工时报告
│   │   │
│   │   ├── framework7/                # Framework7风格组件
│   │   │   └── F7App.tsx              # F7应用包装器
│   │   │
│   │   └── navigation/                # 导航组件
│   │       └── NavigationHelper.tsx   # 导航助手
│   │
│   ├── contexts/                      # React Context
│   │   ├── AppContext.tsx             # 应用全局状态
│   │   ├── AuthContext.tsx            # 认证状态
│   │   └── ThemeContext.tsx           # 主题状态
│   │
│   ├── hooks/                         # 自定义Hooks
│   │   ├── useAuth.ts                 # 认证Hook
│   │   ├── useLocalStorage.ts         # 本地存储Hook
│   │   └── useApi.ts                  # API调用Hook
│   │
│   ├── lib/                           # 工具库
│   │   ├── utils.ts                   # 通用工具函数
│   │   ├── api.ts                     # API客户端
│   │   ├── auth.ts                    # 认证工具
│   │   ├── constants.ts               # 常量定义
│   │   └── framework7.ts              # Framework7配置
│   │
│   ├── types/                         # TypeScript类型定义
│   │   ├── index.ts                   # 主要类型导出
│   │   ├── auth.ts                    # 认证相关类型
│   │   ├── calendar.ts                # 日程相关类型
│   │   ├── cases.ts                   # 案件相关类型
│   │   └── api.ts                     # API相关类型
│   │
│   └── styles/                        # 样式文件
│       ├── globals.css                # 全局样式
│       └── framework7-custom.css      # Framework7自定义样式
│
├── docs/                              # 项目文档
│   ├── requirements/                  # 需求文档
│   │   ├── requirements.md            # 功能需求
│   │   ├── user-personas.md           # 用户画像
│   │   └── feature-matrix.md          # 功能矩阵
│   │
│   ├── architecture/                  # 架构文档
│   │   ├── README.md                  # 架构总览
│   │   ├── tech-stack.md              # 技术栈说明
│   │   ├── component-architecture.md  # 组件架构
│   │   └── data-flow.md               # 数据流设计
│   │
│   └── uml/                           # UML图表
│       ├── use-case-diagram.md        # 用例图
│       ├── class-diagram.md           # 类图
│       ├── sequence-diagram.md        # 时序图
│       ├── component-diagram.md       # 组件图
│       └── activity-diagram.md        # 活动图
│
├── tests/                             # 测试文件
│   ├── __mocks__/                     # Mock文件
│   ├── components/                    # 组件测试
│   ├── pages/                         # 页面测试
│   ├── utils/                         # 工具函数测试
│   └── setup.ts                       # 测试配置
│
└── deployment/                        # 部署配置
    ├── docker/                        # Docker配置
    ├── nginx/                         # Nginx配置
    └── scripts/                       # 部署脚本
```

---

## 3. 技术栈详细说明

### 3.1 Web端技术栈 (Next.js)

#### 核心框架
- **Next.js 15.3.4**: React全栈框架，支持SSR/SSG
- **React 19.0.0**: 用户界面库
- **TypeScript**: 类型安全的JavaScript超集

#### 样式和UI
- **Tailwind CSS 4.0**: 原子化CSS框架
- **Framework7风格**: 移动端原生感觉的UI设计
- **CSS Modules**: 组件级样式隔离

#### 状态管理
- **React Context**: 全局状态管理
- **React Hooks**: 组件状态和副作用管理
- **Local Storage**: 本地数据持久化

### 3.2 移动端技术栈 (React Native)

#### 核心框架
- **React Native**: 跨平台移动应用开发框架
- **Expo**: React Native开发平台和工具链
- **TypeScript**: 类型安全的JavaScript超集

#### UI组件库
- **React Native Elements**: 跨平台UI组件库
- **React Native Paper**: Material Design组件库
- **React Native Vector Icons**: 图标库

#### 导航和路由
- **React Navigation 6**: 移动端导航解决方案
- **Stack Navigator**: 页面栈导航
- **Tab Navigator**: 底部标签导航
- **Drawer Navigator**: 侧边栏导航

#### 状态管理
- **Redux Toolkit**: 现代Redux状态管理
- **React Query**: 服务端状态管理
- **AsyncStorage**: 本地数据持久化

#### 开发工具
- **Expo CLI**: 开发和构建工具
- **Flipper**: 移动端调试工具
- **ESLint**: 代码质量检查
- **Prettier**: 代码格式化

### 3.3 后端技术栈 (规划)

#### 服务端框架
- **Node.js + Express**: 轻量级Web服务器 (推荐)
- **或 Python + FastAPI**: 高性能API框架

#### 数据库

- **MySQL**: 主数据库
- **Redis**: 缓存和会话存储

#### 认证和安全
- **JWT**: 无状态认证
- **bcrypt**: 密码加密
- **HTTPS**: 数据传输加密

#### API设计
- **RESTful API**: 标准REST接口
- **GraphQL**: 灵活的数据查询 (可选)
- **WebSocket**: 实时通信
- Alpha：业务读取，数据库请求
- *（？）讯飞：语音识别*
- 
- **API版本控制**: 支持多版本API

---

## 4. 开发环境配置

### 4.1 环境要求
- **Node.js**: ≥ 18.0.0
- **npm**: ≥ 9.0.0
- **Git**: ≥ 2.30.0

### 4.2 安装步骤
```bash
# 1. 克隆项目
git clone <repository-url>
cd lawclick-nextjs

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 文件

# 4. 启动开发服务器
npm run dev

# 5. 访问应用
# http://localhost:3000
```

### 4.3 开发脚本
```bash
npm run dev          # 启动开发服务器
npm run build        # 构建生产版本
npm run start        # 启动生产服务器
npm run lint         # 代码检查
npm run test         # 运行测试
npm run type-check   # TypeScript类型检查
```

---

## 5. 部署指南

### 5.1 生产环境部署

#### Vercel部署 (推荐)
```bash
# 1. 安装Vercel CLI
npm i -g vercel

# 2. 登录Vercel
vercel login

# 3. 部署项目
vercel --prod
```

#### Docker部署
```bash
# 1. 构建Docker镜像
docker build -t lawclick-app .

# 2. 运行容器
docker run -p 3000:3000 lawclick-app
```

### 5.2 环境变量配置
```bash
# 应用配置
NEXT_PUBLIC_APP_NAME=律时
NEXT_PUBLIC_APP_VERSION=1.0.0

# API配置
NEXT_PUBLIC_API_URL=https://api.lawclick.com
API_SECRET_KEY=your-secret-key

# 数据库配置
DATABASE_URL=postgresql://user:pass@host:port/db
REDIS_URL=redis://host:port

# 认证配置
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=7d

# 第三方服务
OPENAI_API_KEY=your-openai-key
```

---

## 6. 性能优化策略

### 6.1 前端优化
- **代码分割**: 路由级别的懒加载
- **图片优化**: Next.js Image组件
- **缓存策略**: 静态资源缓存
- **Bundle分析**: 定期分析包大小

### 6.2 运行时优化

- **React优化**: useMemo, useCallback
- **虚拟滚动**: 长列表性能优化
- **防抖节流**: 用户输入优化
- **预加载**: 关键资源预加载

### 6.3 后端优化

- 

---

## 7. 安全考虑

### 7.1 数据安全
- **HTTPS**: 强制使用HTTPS
- **CSP**: 内容安全策略
- **XSS防护**: 输入验证和输出编码
- **CSRF防护**: CSRF令牌验证

### 7.2 认证安全
- **JWT**: 安全的令牌机制
- **密码策略**: 强密码要求
- **会话管理**: 安全的会话处理
- **权限控制**: 基于角色的访问控制

---

**文档版本**: v1.0  
**最后更新**: 2025年7月  
**维护人员**: 赵启睿  
**审核人员**: 赵启睿
