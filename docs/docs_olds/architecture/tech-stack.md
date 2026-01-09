# 技术栈详细说明 (Technology Stack)

## 概述

本文档详细说明律时(LawClick)项目的技术选型理由、架构决策和实施细节。项目采用跨平台架构，包含Web端管理平台和React Native移动应用，为开发团队提供技术指导。

---

## 1. 平台架构概览

### 1.1 技术栈分层
```
┌─────────────────────────────────────────────────────────┐
│                    用户界面层                              │
├─────────────────────┬───────────────────────────────────┤
│     Web端 (Next.js)  │    移动端 (React Native + Expo)    │
├─────────────────────┴───────────────────────────────────┤
│                    API网关层                              │
├─────────────────────────────────────────────────────────┤
│                   业务服务层                              │
├─────────────────────────────────────────────────────────┤
│                   数据存储层                              │
└─────────────────────────────────────────────────────────┘
```

### 1.2 平台职责分工
- **Web端**: 复杂数据管理、报告生成、系统配置
- **移动端**: 日常办公、实时通信、移动场景操作
- **后端**: 统一API服务、数据处理、业务逻辑

---

## 2. Web端技术栈 (Next.js)

### 2.1 核心框架

#### Next.js 15.3.4
**选择理由**:
- **全栈能力**: 支持前后端一体化开发
- **性能优化**: 内置SSR/SSG、代码分割、图片优化
- **开发体验**: 热重载、TypeScript支持、零配置
- **生态系统**: 丰富的插件和社区支持

**关键特性**:
- App Router: 新一代路由系统
- Turbopack: 极速构建工具
- Server Components: 服务端组件
- Image Optimization: 自动图片优化

**配置示例**:
```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbo: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
  },
  images: {
    domains: ['example.com'],
    formats: ['image/webp', 'image/avif'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
```

#### React 19.0.0
**选择理由**:
- **组件化**: 可复用的UI组件架构
- **生态成熟**: 丰富的第三方库支持
- **性能优秀**: 虚拟DOM和Fiber架构
- **开发工具**: 强大的开发者工具

**新特性应用**:
- Concurrent Features: 并发渲染
- Automatic Batching: 自动批处理
- Suspense: 数据获取优化
- Server Components: 服务端组件

#### TypeScript
**选择理由**:
- **类型安全**: 编译时错误检查
- **代码提示**: 更好的IDE支持
- **重构安全**: 大型项目维护
- **团队协作**: 接口约定明确

**配置示例**:
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES6"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### 1.2 样式和UI

#### Tailwind CSS 4.0
**选择理由**:
- **原子化**: 细粒度的样式控制
- **响应式**: 移动端优先设计
- **性能优秀**: JIT编译，按需生成
- **一致性**: 设计系统约束

**配置示例**:
```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          900: '#1e3a8a',
        },
        secondary: {
          50: '#f8fafc',
          500: '#64748b',
          900: '#0f172a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
};
```

#### Framework7风格设计
**选择理由**:
- **移动优先**: 专为移动端设计
- **原生感觉**: 类似原生应用体验
- **组件丰富**: 完整的UI组件库
- **触摸友好**: 优秀的触摸交互

**实现方式**:
```typescript
// 自定义Framework7风格组件
const SegmentedControl = ({ options, value, onChange }) => (
  <div className="flex bg-gray-100 rounded-lg p-1">
    {options.map(option => (
      <button
        key={option.value}
        onClick={() => onChange(option.value)}
        className={`flex-1 py-2 px-4 rounded-md transition-all ${
          value === option.value 
            ? 'bg-white text-blue-600 shadow-sm' 
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        {option.label}
      </button>
    ))}
  </div>
);
```

### 1.3 状态管理

#### React Context + Hooks
**选择理由**:
- **原生支持**: React内置状态管理
- **简单直接**: 学习成本低
- **类型安全**: TypeScript完美支持
- **性能可控**: 精确控制重渲染

**实现示例**:
```typescript
// AppContext.tsx
interface AppState {
  user: User | null;
  isAuthenticated: boolean;
  theme: 'light' | 'dark';
}

interface AppContextType {
  state: AppState;
  login: (user: User) => void;
  logout: () => void;
  toggleTheme: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>({
    user: null,
    isAuthenticated: false,
    theme: 'light',
  });

  const login = useCallback((user: User) => {
    setState(prev => ({
      ...prev,
      user,
      isAuthenticated: true,
    }));
  }, []);

  const logout = useCallback(() => {
    setState(prev => ({
      ...prev,
      user: null,
      isAuthenticated: false,
    }));
  }, []);

  const value = useMemo(() => ({
    state,
    login,
    logout,
    toggleTheme: () => setState(prev => ({
      ...prev,
      theme: prev.theme === 'light' ? 'dark' : 'light'
    }))
  }), [state, login, logout]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};
```

### 1.4 开发工具

#### ESLint + Prettier
**配置示例**:
```json
// .eslintrc.json
{
  "extends": [
    "next/core-web-vitals",
    "@typescript-eslint/recommended",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn",
    "prefer-const": "error",
    "no-console": "warn"
  }
}
```

```json
// .prettierrc
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false
}
```

---

## 3. 移动端技术栈 (React Native + Expo)

### 3.1 核心框架

#### React Native
**选择理由**:
- **跨平台**: 一套代码同时支持iOS和Android
- **原生性能**: 接近原生应用的性能表现
- **开发效率**: 复用Web端的React开发经验
- **生态丰富**: 庞大的第三方库生态系统

**关键特性**:
- Native Modules: 原生模块集成
- Hot Reloading: 热重载开发体验
- Platform-specific Code: 平台特定代码支持
- Native Navigation: 原生导航体验

#### Expo
**选择理由**:
- **开发便捷**: 无需配置原生开发环境
- **快速迭代**: Over-the-Air更新支持
- **丰富API**: 内置常用原生功能API
- **云构建**: 云端构建和发布服务

**配置示例**:
```json
// app.json
{
  "expo": {
    "name": "律时 LawClick",
    "slug": "lawclick",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.lawclick.app"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#FFFFFF"
      },
      "package": "com.lawclick.app"
    },
    "web": {
      "favicon": "./assets/favicon.png"
    }
  }
}
```

### 3.2 UI组件库

#### React Native Elements
**选择理由**:
- **跨平台一致性**: 统一的UI组件体验
- **高度可定制**: 灵活的主题和样式系统
- **社区活跃**: 持续维护和更新
- **文档完善**: 详细的使用文档

**实现示例**:
```typescript
// components/ui/Button.tsx
import React from 'react';
import { Button as RNEButton } from 'react-native-elements';
import { ViewStyle, TextStyle } from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'solid' | 'outline' | 'clear';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  disabled?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'solid',
  size = 'medium',
  loading = false,
  disabled = false,
}) => {
  const buttonStyle: ViewStyle = {
    borderRadius: 8,
    marginVertical: 4,
  };

  const titleStyle: TextStyle = {
    fontWeight: '600',
  };

  return (
    <RNEButton
      title={title}
      onPress={onPress}
      type={variant}
      size={size}
      loading={loading}
      disabled={disabled}
      buttonStyle={buttonStyle}
      titleStyle={titleStyle}
    />
  );
};

export default Button;
```

### 3.3 导航系统

#### React Navigation 6
**选择理由**:
- **原生体验**: 真正的原生导航性能
- **灵活配置**: 支持多种导航模式
- **TypeScript支持**: 完整的类型安全
- **深度链接**: 支持深度链接和URL路由

**导航结构**:
```typescript
// navigation/AppNavigator.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator } from '@react-navigation/drawer';

// 页面组件
import DashboardScreen from '../screens/DashboardScreen';
import CalendarScreen from '../screens/CalendarScreen';
import CasesScreen from '../screens/CasesScreen';
import TimeLogScreen from '../screens/TimeLogScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();
const Drawer = createDrawerNavigator();

// 底部标签导航
const TabNavigator = () => (
  <Tab.Navigator
    screenOptions={{
      tabBarActiveTintColor: '#3b82f6',
      tabBarInactiveTintColor: '#6b7280',
      headerShown: false,
    }}
  >
    <Tab.Screen
      name="Dashboard"
      component={DashboardScreen}
      options={{
        tabBarLabel: '仪表盘',
        tabBarIcon: ({ color, size }) => (
          <Icon name="dashboard" color={color} size={size} />
        ),
      }}
    />
    <Tab.Screen
      name="Calendar"
      component={CalendarScreen}
      options={{
        tabBarLabel: '日程',
        tabBarIcon: ({ color, size }) => (
          <Icon name="calendar" color={color} size={size} />
        ),
      }}
    />
    {/* 其他标签页... */}
  </Tab.Navigator>
);

// 主导航器
const AppNavigator = () => (
  <NavigationContainer>
    <Stack.Navigator>
      <Stack.Screen
        name="Main"
        component={TabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreateEvent"
        component={CreateEventScreen}
        options={{ title: '新建日程' }}
      />
      {/* 其他页面... */}
    </Stack.Navigator>
  </NavigationContainer>
);

export default AppNavigator;
```

### 3.4 状态管理

#### Redux Toolkit
**选择理由**:
- **现代Redux**: 简化的Redux使用方式
- **内置最佳实践**: 集成了常用中间件
- **TypeScript友好**: 优秀的类型推断
- **开发工具**: 强大的调试工具支持

**状态管理示例**:
```typescript
// store/slices/calendarSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { CalendarEvent } from '../../types';
import { calendarAPI } from '../../services/api';

interface CalendarState {
  events: CalendarEvent[];
  selectedDate: string;
  loading: boolean;
  error: string | null;
}

const initialState: CalendarState = {
  events: [],
  selectedDate: new Date().toISOString().split('T')[0],
  loading: false,
  error: null,
};

// 异步操作
export const fetchEvents = createAsyncThunk(
  'calendar/fetchEvents',
  async (dateRange: { start: string; end: string }) => {
    const response = await calendarAPI.getEvents(dateRange);
    return response.data;
  }
);

export const createEvent = createAsyncThunk(
  'calendar/createEvent',
  async (eventData: Omit<CalendarEvent, 'id'>) => {
    const response = await calendarAPI.createEvent(eventData);
    return response.data;
  }
);

const calendarSlice = createSlice({
  name: 'calendar',
  initialState,
  reducers: {
    setSelectedDate: (state, action: PayloadAction<string>) => {
      state.selectedDate = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEvents.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchEvents.fulfilled, (state, action) => {
        state.loading = false;
        state.events = action.payload;
      })
      .addCase(fetchEvents.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch events';
      });
  },
});

export const { setSelectedDate, clearError } = calendarSlice.actions;
export default calendarSlice.reducer;
```

#### React Query
**选择理由**:
- **服务端状态**: 专门处理服务端数据
- **缓存管理**: 智能的缓存和同步策略
- **离线支持**: 优秀的离线体验
- **乐观更新**: 支持乐观更新模式

### 3.5 本地存储

#### AsyncStorage
**选择理由**:
- **异步操作**: 不阻塞主线程
- **跨平台**: iOS和Android统一API
- **简单易用**: 类似localStorage的API
- **持久化**: 应用重启后数据保持

**使用示例**:
```typescript
// utils/storage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

class StorageManager {
  // 存储数据
  static async setItem(key: string, value: any): Promise<void> {
    try {
      const jsonValue = JSON.stringify(value);
      await AsyncStorage.setItem(key, jsonValue);
    } catch (error) {
      console.error('Error storing data:', error);
    }
  }

  // 获取数据
  static async getItem<T>(key: string): Promise<T | null> {
    try {
      const jsonValue = await AsyncStorage.getItem(key);
      return jsonValue != null ? JSON.parse(jsonValue) : null;
    } catch (error) {
      console.error('Error retrieving data:', error);
      return null;
    }
  }

  // 删除数据
  static async removeItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('Error removing data:', error);
    }
  }

  // 清空所有数据
  static async clear(): Promise<void> {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      console.error('Error clearing storage:', error);
    }
  }
}

export default StorageManager;
```

---

## 4. 后端技术栈 (Backend Stack)

### 2.1 服务端框架选择

#### 方案A: Node.js + Express
**优势**:
- JavaScript全栈统一
- 丰富的npm生态
- 快速开发原型
- 团队技能匹配

**适用场景**:
- 快速MVP开发
- 前端团队主导
- 实时功能需求

#### 方案B: Python + FastAPI
**优势**:
- 高性能异步框架
- 自动API文档生成
- 强大的数据处理能力
- AI集成友好

**适用场景**:
- 高性能要求
- 复杂业务逻辑
- AI功能集成

### 2.2 数据库设计

#### PostgreSQL (主数据库)
**选择理由**:
- **ACID特性**: 数据一致性保障
- **JSON支持**: 灵活的数据结构
- **扩展性**: 丰富的扩展插件
- **性能优秀**: 复杂查询优化

**数据模型示例**:
```sql
-- 用户表
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'lawyer',
  profile JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 案件表
CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'active',
  client_id UUID REFERENCES users(id),
  lawyer_id UUID REFERENCES users(id),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 日程表
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  case_id UUID REFERENCES cases(id),
  user_id UUID REFERENCES users(id),
  attendees JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Redis (缓存和会话)
**用途**:
- 会话存储
- 缓存热点数据
- 实时通知队列
- 限流控制

---

## 3. 移动端优化策略

### 3.1 性能优化

#### 代码分割
```typescript
// 路由级别懒加载
const CalendarPage = lazy(() => import('@/app/calendar/page'));
const CasesPage = lazy(() => import('@/app/cases/page'));

// 组件级别懒加载
const HeavyComponent = lazy(() => import('@/components/HeavyComponent'));
```

#### 图片优化
```typescript
// Next.js Image组件
import Image from 'next/image';

const OptimizedImage = () => (
  <Image
    src="/hero-image.jpg"
    alt="Hero"
    width={800}
    height={600}
    priority
    placeholder="blur"
    blurDataURL="data:image/jpeg;base64,..."
  />
);
```

### 3.2 PWA支持

#### Service Worker
```javascript
// public/sw.js
const CACHE_NAME = 'lawclick-v1';
const urlsToCache = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});
```

#### Manifest配置
```json
// public/manifest.json
{
  "name": "律时 - 法律事务管理",
  "short_name": "律时",
  "description": "专业的法律事务管理应用",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#3b82f6",
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

---

## 4. 安全技术实现

### 4.1 认证和授权

#### JWT实现
```typescript
// lib/auth.ts
import jwt from 'jsonwebtoken';

export const generateToken = (payload: any) => {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: '7d',
  });
};

export const verifyToken = (token: string) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!);
  } catch (error) {
    throw new Error('Invalid token');
  }
};
```

#### 权限控制
```typescript
// middleware/auth.ts
export const requireAuth = (handler: NextApiHandler) => {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const decoded = verifyToken(token);
      req.user = decoded;
      return handler(req, res);
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
};
```

### 4.2 数据安全

#### 输入验证
```typescript
// lib/validation.ts
import { z } from 'zod';

export const createCaseSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  clientId: z.string().uuid(),
  status: z.enum(['active', 'closed', 'pending']),
});

export const validateCreateCase = (data: unknown) => {
  return createCaseSchema.parse(data);
};
```

#### 数据加密
```typescript
// lib/encryption.ts
import crypto from 'crypto';

const algorithm = 'aes-256-gcm';
const secretKey = process.env.ENCRYPTION_KEY!;

export const encrypt = (text: string) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher(algorithm, secretKey);
  cipher.setAAD(Buffer.from('lawclick', 'utf8'));
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
};
```

---

## 5. 监控和日志

### 5.1 错误监控
```typescript
// lib/monitoring.ts
export const logError = (error: Error, context?: any) => {
  console.error('Application Error:', {
    message: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString(),
  });
  
  // 发送到监控服务
  if (process.env.NODE_ENV === 'production') {
    // Sentry.captureException(error);
  }
};
```

### 5.2 性能监控
```typescript
// lib/performance.ts
export const measurePerformance = (name: string, fn: () => Promise<any>) => {
  return async (...args: any[]) => {
    const start = performance.now();
    try {
      const result = await fn.apply(this, args);
      const duration = performance.now() - start;
      
      console.log(`Performance: ${name} took ${duration.toFixed(2)}ms`);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      console.error(`Performance: ${name} failed after ${duration.toFixed(2)}ms`);
      throw error;
    }
  };
};
```

---

**文档版本**: v1.0  
**最后更新**: 2025年7月  
**维护人员**: 赵启睿 
**审核人员**: 赵启睿
