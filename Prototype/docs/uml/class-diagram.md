# 类图 (Class Diagram)

## 概述

本文档描述律时(LawClick)系统的类图设计，展示系统中主要的数据模型、业务实体和它们之间的关系。

---

## 1. 核心领域模型

### 1.1 系统类图总览

```mermaid
classDiagram
    %% 用户相关类
    class User {
        +UUID id
        +String email
        +String passwordHash
        +UserRole role
        +UserProfile profile
        +DateTime createdAt
        +DateTime updatedAt
        +login(email, password) Boolean
        +logout() void
        +updateProfile(profile) void
        +changePassword(oldPassword, newPassword) Boolean
    }
    
    class UserProfile {
        +String firstName
        +String lastName
        +String phone
        +String avatar
        +String timezone
        +String language
        +Address address
        +getFullName() String
        +getDisplayName() String
    }
    
    class Address {
        +String street
        +String city
        +String state
        +String zipCode
        +String country
        +getFormattedAddress() String
    }
    
    %% 案件相关类
    class Case {
        +UUID id
        +String title
        +String description
        +CaseStatus status
        +CasePriority priority
        +UUID clientId
        +UUID lawyerId
        +DateTime createdAt
        +DateTime updatedAt
        +List~CaseDocument~ documents
        +List~CalendarEvent~ events
        +List~TimeEntry~ timeEntries
        +addDocument(document) void
        +updateStatus(status) void
        +getTotalBillableHours() Number
        +getProgress() Number
    }
    
    class CaseDocument {
        +UUID id
        +String fileName
        +String filePath
        +String fileType
        +Number fileSize
        +UUID uploadedBy
        +DateTime uploadedAt
        +String description
        +DocumentType type
        +download() Blob
        +delete() Boolean
    }
    
    %% 日程相关类
    class CalendarEvent {
        +UUID id
        +String title
        +String description
        +DateTime startTime
        +DateTime endTime
        +EventType type
        +UUID caseId
        +UUID userId
        +String location
        +List~UUID~ attendees
        +Boolean billable
        +EventStatus status
        +ReminderSettings reminder
        +isConflictWith(otherEvent) Boolean
        +getDuration() Number
        +reschedule(newStartTime, newEndTime) void
    }
    
    class ReminderSettings {
        +Boolean enabled
        +Number minutesBefore
        +ReminderType type
        +String message
        +trigger() void
    }
    
    %% 工时相关类
    class TimeEntry {
        +UUID id
        +UUID userId
        +UUID caseId
        +String description
        +DateTime startTime
        +DateTime endTime
        +Number duration
        +Boolean billable
        +Number hourlyRate
        +TimeEntryStatus status
        +UUID approvedBy
        +DateTime approvedAt
        +String notes
        +calculateAmount() Number
        +approve(approverId) void
        +reject(reason) void
    }
    
    class TimeReport {
        +UUID id
        +UUID userId
        +DateTime startDate
        +DateTime endDate
        +List~TimeEntry~ entries
        +Number totalHours
        +Number billableHours
        +Number totalAmount
        +ReportStatus status
        +generate() void
        +export(format) Blob
    }
    
    %% 沟通相关类
    class Communication {
        +UUID id
        +CommunicationType type
        +UUID fromUserId
        +UUID toUserId
        +UUID caseId
        +String subject
        +String content
        +DateTime sentAt
        +Boolean read
        +List~Attachment~ attachments
        +markAsRead() void
        +reply(content) Communication
    }
    
    class Attachment {
        +UUID id
        +String fileName
        +String filePath
        +String mimeType
        +Number fileSize
        +download() Blob
    }
    
    %% 枚举类型
    class UserRole {
        <<enumeration>>
        LAWYER
        LEGAL_ASSISTANT
        ADMINISTRATOR
        CLIENT
    }
    
    class CaseStatus {
        <<enumeration>>
        ACTIVE
        PENDING
        CLOSED
        ARCHIVED
    }
    
    class CasePriority {
        <<enumeration>>
        LOW
        MEDIUM
        HIGH
        URGENT
    }
    
    class EventType {
        <<enumeration>>
        MEETING
        COURT
        DEADLINE
        REMINDER
    }
    
    class EventStatus {
        <<enumeration>>
        SCHEDULED
        IN_PROGRESS
        COMPLETED
        CANCELLED
    }
    
    class DocumentType {
        <<enumeration>>
        CONTRACT
        EVIDENCE
        CORRESPONDENCE
        LEGAL_BRIEF
        OTHER
    }
    
    class CommunicationType {
        <<enumeration>>
        EMAIL
        PHONE_CALL
        MEETING
        MESSAGE
    }
    
    class TimeEntryStatus {
        <<enumeration>>
        DRAFT
        SUBMITTED
        APPROVED
        REJECTED
    }
    
    class ReminderType {
        <<enumeration>>
        NOTIFICATION
        EMAIL
        SMS
    }
    
    class ReportStatus {
        <<enumeration>>
        GENERATING
        COMPLETED
        FAILED
    }
    
    %% 关系定义
    User ||--|| UserProfile : has
    UserProfile ||--o| Address : contains
    User ||--o{ Case : manages
    User ||--o{ CalendarEvent : creates
    User ||--o{ TimeEntry : logs
    User ||--o{ Communication : sends
    
    Case ||--o{ CaseDocument : contains
    Case ||--o{ CalendarEvent : related_to
    Case ||--o{ TimeEntry : tracks
    Case ||--o{ Communication : involves
    
    CalendarEvent ||--|| ReminderSettings : has
    CalendarEvent }o--|| Case : belongs_to
    CalendarEvent }o--|| User : owned_by
    
    TimeEntry }o--|| User : logged_by
    TimeEntry }o--|| Case : for
    TimeReport ||--o{ TimeEntry : includes
    
    Communication }o--|| User : from
    Communication }o--|| User : to
    Communication }o--o| Case : about
    Communication ||--o{ Attachment : has
```

---

## 2. 详细类定义

### 2.1 用户管理类

#### User类
```typescript
interface User {
  id: UUID;
  email: string;
  passwordHash: string;
  role: UserRole;
  profile: UserProfile;
  createdAt: DateTime;
  updatedAt: DateTime;
  
  // 方法
  login(email: string, password: string): Promise<boolean>;
  logout(): void;
  updateProfile(profile: Partial<UserProfile>): Promise<void>;
  changePassword(oldPassword: string, newPassword: string): Promise<boolean>;
  hasPermission(permission: string): boolean;
  getCases(): Promise<Case[]>;
  getCalendarEvents(dateRange: DateRange): Promise<CalendarEvent[]>;
}

enum UserRole {
  LAWYER = 'lawyer',
  LEGAL_ASSISTANT = 'legal_assistant',
  ADMINISTRATOR = 'administrator',
  CLIENT = 'client'
}

interface UserProfile {
  firstName: string;
  lastName: string;
  phone?: string;
  avatar?: string;
  timezone: string;
  language: string;
  address?: Address;
  
  // 计算属性
  getFullName(): string;
  getDisplayName(): string;
}
```

### 2.2 案件管理类

#### Case类
```typescript
interface Case {
  id: UUID;
  title: string;
  description?: string;
  status: CaseStatus;
  priority: CasePriority;
  clientId: UUID;
  lawyerId: UUID;
  createdAt: DateTime;
  updatedAt: DateTime;
  
  // 关联数据
  documents: CaseDocument[];
  events: CalendarEvent[];
  timeEntries: TimeEntry[];
  communications: Communication[];
  
  // 方法
  addDocument(document: CaseDocument): Promise<void>;
  updateStatus(status: CaseStatus): Promise<void>;
  getTotalBillableHours(): number;
  getProgress(): number;
  getClient(): Promise<User>;
  getLawyer(): Promise<User>;
  calculateTotalCost(): number;
}

enum CaseStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  CLOSED = 'closed',
  ARCHIVED = 'archived'
}

enum CasePriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

interface CaseDocument {
  id: UUID;
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number;
  uploadedBy: UUID;
  uploadedAt: DateTime;
  description?: string;
  type: DocumentType;
  
  // 方法
  download(): Promise<Blob>;
  delete(): Promise<boolean>;
  getUploader(): Promise<User>;
}
```

### 2.3 日程管理类

#### CalendarEvent类
```typescript
interface CalendarEvent {
  id: UUID;
  title: string;
  description?: string;
  startTime: DateTime;
  endTime: DateTime;
  type: EventType;
  caseId?: UUID;
  userId: UUID;
  location?: string;
  attendees: UUID[];
  billable: boolean;
  status: EventStatus;
  reminder?: ReminderSettings;
  
  // 方法
  isConflictWith(otherEvent: CalendarEvent): boolean;
  getDuration(): number; // 返回分钟数
  reschedule(newStartTime: DateTime, newEndTime: DateTime): Promise<void>;
  addAttendee(userId: UUID): Promise<void>;
  removeAttendee(userId: UUID): Promise<void>;
  getCase(): Promise<Case | null>;
  getOwner(): Promise<User>;
}

enum EventType {
  MEETING = 'meeting',
  COURT = 'court',
  DEADLINE = 'deadline',
  REMINDER = 'reminder'
}

interface ReminderSettings {
  enabled: boolean;
  minutesBefore: number;
  type: ReminderType;
  message?: string;
  
  // 方法
  trigger(): Promise<void>;
  schedule(): Promise<void>;
  cancel(): Promise<void>;
}
```

### 2.4 工时管理类

#### TimeEntry类
```typescript
interface TimeEntry {
  id: UUID;
  userId: UUID;
  caseId?: UUID;
  description: string;
  startTime: DateTime;
  endTime: DateTime;
  duration: number; // 分钟数
  billable: boolean;
  hourlyRate?: number;
  status: TimeEntryStatus;
  approvedBy?: UUID;
  approvedAt?: DateTime;
  notes?: string;
  
  // 方法
  calculateAmount(): number;
  approve(approverId: UUID): Promise<void>;
  reject(reason: string): Promise<void>;
  edit(updates: Partial<TimeEntry>): Promise<void>;
  getUser(): Promise<User>;
  getCase(): Promise<Case | null>;
}

interface TimeReport {
  id: UUID;
  userId: UUID;
  startDate: DateTime;
  endDate: DateTime;
  entries: TimeEntry[];
  totalHours: number;
  billableHours: number;
  totalAmount: number;
  status: ReportStatus;
  generatedAt?: DateTime;
  
  // 方法
  generate(): Promise<void>;
  export(format: 'pdf' | 'excel' | 'csv'): Promise<Blob>;
  getUser(): Promise<User>;
}
```

---

## 3. 设计模式应用

### 3.1 工厂模式 (Factory Pattern)

```typescript
// 事件工厂
class CalendarEventFactory {
  static createMeeting(data: MeetingData): CalendarEvent {
    return {
      ...data,
      type: EventType.MEETING,
      billable: true,
      status: EventStatus.SCHEDULED,
    };
  }
  
  static createCourtHearing(data: CourtData): CalendarEvent {
    return {
      ...data,
      type: EventType.COURT,
      billable: true,
      status: EventStatus.SCHEDULED,
      reminder: {
        enabled: true,
        minutesBefore: 60,
        type: ReminderType.NOTIFICATION,
      },
    };
  }
  
  static createDeadline(data: DeadlineData): CalendarEvent {
    return {
      ...data,
      type: EventType.DEADLINE,
      billable: false,
      status: EventStatus.SCHEDULED,
      reminder: {
        enabled: true,
        minutesBefore: 1440, // 24小时前
        type: ReminderType.EMAIL,
      },
    };
  }
}
```

### 3.2 观察者模式 (Observer Pattern)

```typescript
// 事件通知系统
interface EventObserver {
  update(event: CalendarEvent, action: string): void;
}

class CalendarEventSubject {
  private observers: EventObserver[] = [];
  
  addObserver(observer: EventObserver): void {
    this.observers.push(observer);
  }
  
  removeObserver(observer: EventObserver): void {
    const index = this.observers.indexOf(observer);
    if (index > -1) {
      this.observers.splice(index, 1);
    }
  }
  
  notifyObservers(event: CalendarEvent, action: string): void {
    this.observers.forEach(observer => observer.update(event, action));
  }
}

// 具体观察者
class ReminderObserver implements EventObserver {
  update(event: CalendarEvent, action: string): void {
    if (action === 'created' && event.reminder?.enabled) {
      this.scheduleReminder(event);
    }
  }
  
  private scheduleReminder(event: CalendarEvent): void {
    // 安排提醒逻辑
  }
}

class NotificationObserver implements EventObserver {
  update(event: CalendarEvent, action: string): void {
    if (action === 'updated') {
      this.sendUpdateNotification(event);
    }
  }
  
  private sendUpdateNotification(event: CalendarEvent): void {
    // 发送更新通知逻辑
  }
}
```

### 3.3 策略模式 (Strategy Pattern)

```typescript
// 工时计算策略
interface BillingStrategy {
  calculateAmount(timeEntry: TimeEntry): number;
}

class HourlyBillingStrategy implements BillingStrategy {
  calculateAmount(timeEntry: TimeEntry): number {
    const hours = timeEntry.duration / 60;
    return hours * (timeEntry.hourlyRate || 0);
  }
}

class FixedRateBillingStrategy implements BillingStrategy {
  private fixedRate: number;
  
  constructor(fixedRate: number) {
    this.fixedRate = fixedRate;
  }
  
  calculateAmount(timeEntry: TimeEntry): number {
    return this.fixedRate;
  }
}

class BillingContext {
  private strategy: BillingStrategy;
  
  constructor(strategy: BillingStrategy) {
    this.strategy = strategy;
  }
  
  setStrategy(strategy: BillingStrategy): void {
    this.strategy = strategy;
  }
  
  calculateBill(timeEntry: TimeEntry): number {
    return this.strategy.calculateAmount(timeEntry);
  }
}
```

---

## 4. 数据访问层

### 4.1 仓储模式 (Repository Pattern)

```typescript
// 基础仓储接口
interface Repository<T> {
  findById(id: UUID): Promise<T | null>;
  findAll(): Promise<T[]>;
  create(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  update(id: UUID, updates: Partial<T>): Promise<T>;
  delete(id: UUID): Promise<boolean>;
}

// 案件仓储
interface CaseRepository extends Repository<Case> {
  findByLawyer(lawyerId: UUID): Promise<Case[]>;
  findByClient(clientId: UUID): Promise<Case[]>;
  findByStatus(status: CaseStatus): Promise<Case[]>;
  search(query: string): Promise<Case[]>;
}

// 日程仓储
interface CalendarEventRepository extends Repository<CalendarEvent> {
  findByDateRange(startDate: DateTime, endDate: DateTime): Promise<CalendarEvent[]>;
  findByUser(userId: UUID): Promise<CalendarEvent[]>;
  findByCase(caseId: UUID): Promise<CalendarEvent[]>;
  findConflicts(event: CalendarEvent): Promise<CalendarEvent[]>;
}

// 工时仓储
interface TimeEntryRepository extends Repository<TimeEntry> {
  findByUser(userId: UUID): Promise<TimeEntry[]>;
  findByCase(caseId: UUID): Promise<TimeEntry[]>;
  findByDateRange(startDate: DateTime, endDate: DateTime): Promise<TimeEntry[]>;
  findPendingApproval(): Promise<TimeEntry[]>;
}
```

### 4.2 工作单元模式 (Unit of Work Pattern)

```typescript
interface UnitOfWork {
  caseRepository: CaseRepository;
  calendarEventRepository: CalendarEventRepository;
  timeEntryRepository: TimeEntryRepository;
  userRepository: Repository<User>;
  
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

class DatabaseUnitOfWork implements UnitOfWork {
  private transaction: any;
  
  caseRepository: CaseRepository;
  calendarEventRepository: CalendarEventRepository;
  timeEntryRepository: TimeEntryRepository;
  userRepository: Repository<User>;
  
  constructor() {
    // 初始化仓储实例
  }
  
  async begin(): Promise<void> {
    this.transaction = await database.beginTransaction();
  }
  
  async commit(): Promise<void> {
    await this.transaction.commit();
  }
  
  async rollback(): Promise<void> {
    await this.transaction.rollback();
  }
}
```

---

## 5. 领域服务

### 5.1 案件管理服务

```typescript
class CaseService {
  constructor(
    private caseRepository: CaseRepository,
    private eventRepository: CalendarEventRepository,
    private timeRepository: TimeEntryRepository
  ) {}
  
  async createCase(data: CreateCaseData): Promise<Case> {
    const case_ = await this.caseRepository.create(data);
    
    // 创建初始事件
    if (data.initialMeeting) {
      await this.eventRepository.create({
        title: `Initial meeting for ${case_.title}`,
        ...data.initialMeeting,
        caseId: case_.id,
        type: EventType.MEETING,
      });
    }
    
    return case_;
  }
  
  async getCaseStatistics(caseId: UUID): Promise<CaseStatistics> {
    const case_ = await this.caseRepository.findById(caseId);
    const events = await this.eventRepository.findByCase(caseId);
    const timeEntries = await this.timeRepository.findByCase(caseId);
    
    return {
      totalEvents: events.length,
      totalHours: timeEntries.reduce((sum, entry) => sum + entry.duration, 0) / 60,
      billableHours: timeEntries
        .filter(entry => entry.billable)
        .reduce((sum, entry) => sum + entry.duration, 0) / 60,
      totalCost: timeEntries
        .filter(entry => entry.billable)
        .reduce((sum, entry) => sum + entry.calculateAmount(), 0),
    };
  }
}
```

### 5.2 日程管理服务

```typescript
class CalendarService {
  constructor(
    private eventRepository: CalendarEventRepository,
    private userRepository: Repository<User>
  ) {}
  
  async createEvent(data: CreateEventData): Promise<CalendarEvent> {
    // 检查冲突
    const conflicts = await this.eventRepository.findConflicts(data as CalendarEvent);
    if (conflicts.length > 0) {
      throw new ConflictError('Event conflicts with existing events');
    }
    
    const event = await this.eventRepository.create(data);
    
    // 安排提醒
    if (event.reminder?.enabled) {
      await this.scheduleReminder(event);
    }
    
    return event;
  }
  
  async getAvailableSlots(
    userId: UUID,
    date: DateTime,
    duration: number
  ): Promise<TimeSlot[]> {
    const events = await this.eventRepository.findByDateRange(
      startOfDay(date),
      endOfDay(date)
    );
    
    const userEvents = events.filter(event => 
      event.userId === userId || event.attendees.includes(userId)
    );
    
    return this.calculateAvailableSlots(userEvents, duration);
  }
  
  private async scheduleReminder(event: CalendarEvent): Promise<void> {
    // 实现提醒调度逻辑
  }
  
  private calculateAvailableSlots(events: CalendarEvent[], duration: number): TimeSlot[] {
    // 实现可用时间段计算逻辑
    return [];
  }
}
```

---

**文档版本**: v1.0  
**最后更新**: 2025年7月  
**维护人员**: 赵启睿  
**审核人员**: 赵启睿
