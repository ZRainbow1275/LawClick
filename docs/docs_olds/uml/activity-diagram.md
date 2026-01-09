# 活动图 (Activity Diagram)

## 概述

本文档描述律时(LawClick)系统关键业务流程的活动图，展示业务流程的执行步骤、决策点和并行活动。

---

## 1. 用户认证流程

### 1.1 用户登录活动图

```mermaid
flowchart TD
    Start([开始]) --> Input[用户输入邮箱和密码]
    Input --> Validate{验证输入格式}
    
    Validate -->|格式错误| ShowError[显示格式错误提示]
    ShowError --> Input
    
    Validate -->|格式正确| CheckUser{检查用户是否存在}
    CheckUser -->|用户不存在| UserNotFound[显示用户不存在错误]
    UserNotFound --> Input
    
    CheckUser -->|用户存在| VerifyPassword{验证密码}
    VerifyPassword -->|密码错误| PasswordError[显示密码错误]
    PasswordError --> CheckAttempts{检查登录尝试次数}
    CheckAttempts -->|次数未超限| Input
    CheckAttempts -->|次数超限| LockAccount[锁定账户]
    LockAccount --> End([结束])
    
    VerifyPassword -->|密码正确| GenerateToken[生成访问令牌]
    GenerateToken --> StoreSession[存储会话信息]
    StoreSession --> UpdateLastLogin[更新最后登录时间]
    UpdateLastLogin --> RedirectDashboard[跳转到仪表盘]
    RedirectDashboard --> End
```

### 1.2 密码重置活动图

```mermaid
flowchart TD
    Start([开始]) --> InputEmail[输入邮箱地址]
    InputEmail --> ValidateEmail{验证邮箱格式}
    
    ValidateEmail -->|格式错误| EmailFormatError[显示邮箱格式错误]
    EmailFormatError --> InputEmail
    
    ValidateEmail -->|格式正确| CheckEmailExists{检查邮箱是否存在}
    CheckEmailExists -->|邮箱不存在| EmailNotFound[显示邮箱不存在提示]
    EmailNotFound --> InputEmail
    
    CheckEmailExists -->|邮箱存在| GenerateResetToken[生成重置令牌]
    GenerateResetToken --> StoreToken[存储令牌到数据库]
    StoreToken --> SendResetEmail[发送重置邮件]
    SendResetEmail --> ShowSuccess[显示邮件发送成功提示]
    ShowSuccess --> WaitForClick[等待用户点击邮件链接]
    
    WaitForClick --> ClickLink[用户点击重置链接]
    ClickLink --> ValidateToken{验证重置令牌}
    
    ValidateToken -->|令牌无效或过期| TokenError[显示令牌错误]
    TokenError --> End([结束])
    
    ValidateToken -->|令牌有效| ShowResetForm[显示密码重置表单]
    ShowResetForm --> InputNewPassword[输入新密码]
    InputNewPassword --> ValidatePassword{验证密码强度}
    
    ValidatePassword -->|密码不符合要求| PasswordWeakError[显示密码强度错误]
    PasswordWeakError --> InputNewPassword
    
    ValidatePassword -->|密码符合要求| UpdatePassword[更新用户密码]
    UpdatePassword --> InvalidateToken[使重置令牌失效]
    InvalidateToken --> SendConfirmEmail[发送密码更改确认邮件]
    SendConfirmEmail --> ShowResetSuccess[显示重置成功提示]
    ShowResetSuccess --> End
```

---

## 2. 日程管理流程

### 2.1 创建日程事件活动图

```mermaid
flowchart TD
    Start([开始]) --> ClickNew[点击新建日程按钮]
    ClickNew --> ShowForm[显示日程创建表单]
    ShowForm --> FillForm[填写事件信息]
    
    FillForm --> ValidateForm{验证表单数据}
    ValidateForm -->|验证失败| ShowValidationError[显示验证错误]
    ShowValidationError --> FillForm
    
    ValidateForm -->|验证通过| CheckConflict{检查时间冲突}
    CheckConflict -->|无冲突| SaveEvent[保存事件到数据库]
    
    CheckConflict -->|有冲突| ShowConflictDialog[显示冲突对话框]
    ShowConflictDialog --> UserChoice{用户选择}
    UserChoice -->|强制创建| SaveEvent
    UserChoice -->|修改时间| FillForm
    UserChoice -->|取消| End([结束])
    
    SaveEvent --> LinkCase{是否关联案件?}
    LinkCase -->|是| CreateCaseLink[创建案件关联]
    LinkCase -->|否| SetReminder{是否设置提醒?}
    CreateCaseLink --> SetReminder
    
    SetReminder -->|是| ScheduleReminder[安排提醒任务]
    SetReminder -->|否| NotifyAttendees{是否有参与者?}
    ScheduleReminder --> NotifyAttendees
    
    NotifyAttendees -->|是| SendInvitations[发送邀请通知]
    NotifyAttendees -->|否| UpdateCalendar[更新日历显示]
    SendInvitations --> UpdateCalendar
    
    UpdateCalendar --> ShowSuccess[显示创建成功提示]
    ShowSuccess --> End
```

### 2.2 日程冲突处理活动图

```mermaid
flowchart TD
    Start([检测到时间冲突]) --> AnalyzeConflict[分析冲突详情]
    AnalyzeConflict --> GetConflictEvents[获取冲突事件列表]
    GetConflictEvents --> ShowConflictInfo[显示冲突信息]
    
    ShowConflictInfo --> UserDecision{用户决策}
    
    UserDecision -->|强制创建| ConfirmForce{确认强制创建?}
    ConfirmForce -->|确认| CreateWithConflict[创建事件并标记冲突]
    ConfirmForce -->|取消| ShowConflictInfo
    CreateWithConflict --> NotifyConflict[通知相关人员冲突]
    NotifyConflict --> End([结束])
    
    UserDecision -->|修改时间| SuggestAlternatives[建议替代时间]
    SuggestAlternatives --> ShowSuggestions[显示建议时间段]
    ShowSuggestions --> SelectTime{选择时间}
    SelectTime -->|选择建议时间| UpdateEventTime[更新事件时间]
    SelectTime -->|手动输入时间| ManualInput[手动输入新时间]
    ManualInput --> ValidateNewTime{验证新时间}
    ValidateNewTime -->|仍有冲突| ShowConflictInfo
    ValidateNewTime -->|无冲突| UpdateEventTime
    UpdateEventTime --> End
    
    UserDecision -->|取消创建| CancelCreation[取消事件创建]
    CancelCreation --> End
    
    UserDecision -->|重新安排冲突事件| SelectConflictEvent[选择要重新安排的事件]
    SelectConflictEvent --> RescheduleEvent[重新安排选定事件]
    RescheduleEvent --> CheckNewConflict{检查新的冲突}
    CheckNewConflict -->|无新冲突| CreateOriginalEvent[创建原始事件]
    CheckNewConflict -->|有新冲突| ShowConflictInfo
    CreateOriginalEvent --> End
```

---

## 3. 案件管理流程

### 3.1 案件创建和管理活动图

```mermaid
flowchart TD
    Start([开始]) --> ClickNewCase[点击新建案件]
    ClickNewCase --> ShowCaseForm[显示案件创建表单]
    ShowCaseForm --> FillBasicInfo[填写基本信息]
    
    FillBasicInfo --> ValidateBasicInfo{验证基本信息}
    ValidateBasicInfo -->|验证失败| ShowBasicInfoError[显示验证错误]
    ShowBasicInfoError --> FillBasicInfo
    
    ValidateBasicInfo -->|验证通过| AddClientInfo[添加客户信息]
    AddClientInfo --> CheckClientExists{客户是否已存在?}
    
    CheckClientExists -->|不存在| CreateNewClient[创建新客户]
    CheckClientExists -->|存在| LinkExistingClient[关联现有客户]
    CreateNewClient --> SetCasePriority[设置案件优先级]
    LinkExistingClient --> SetCasePriority
    
    SetCasePriority --> UploadDocuments{是否上传文档?}
    UploadDocuments -->|是| ProcessDocuments[处理文档上传]
    UploadDocuments -->|否| SaveCase[保存案件信息]
    
    ProcessDocuments --> ValidateDocuments{验证文档}
    ValidateDocuments -->|验证失败| ShowDocumentError[显示文档错误]
    ShowDocumentError --> ProcessDocuments
    ValidateDocuments -->|验证通过| SaveDocuments[保存文档]
    SaveDocuments --> SaveCase
    
    SaveCase --> GenerateCaseNumber[生成案件编号]
    GenerateCaseNumber --> CreateCaseFolder[创建案件文件夹]
    CreateCaseFolder --> SetInitialStatus[设置初始状态]
    SetInitialStatus --> ScheduleInitialMeeting{是否安排初次会议?}
    
    ScheduleInitialMeeting -->|是| CreateMeetingEvent[创建会议事件]
    ScheduleInitialMeeting -->|否| NotifyTeam[通知团队成员]
    CreateMeetingEvent --> NotifyTeam
    
    NotifyTeam --> SendClientNotification[发送客户通知]
    SendClientNotification --> UpdateDashboard[更新仪表盘]
    UpdateDashboard --> ShowSuccess[显示创建成功]
    ShowSuccess --> End([结束])
```

### 3.2 案件状态更新活动图

```mermaid
flowchart TD
    Start([开始]) --> SelectCase[选择案件]
    SelectCase --> ViewCaseDetails[查看案件详情]
    ViewCaseDetails --> ClickUpdateStatus[点击更新状态]
    ClickUpdateStatus --> ShowStatusOptions[显示状态选项]
    
    ShowStatusOptions --> SelectNewStatus[选择新状态]
    SelectNewStatus --> ValidateTransition{验证状态转换}
    
    ValidateTransition -->|转换无效| ShowTransitionError[显示转换错误]
    ShowTransitionError --> ShowStatusOptions
    
    ValidateTransition -->|转换有效| RequireApproval{是否需要审批?}
    
    RequireApproval -->|需要审批| SubmitForApproval[提交审批申请]
    SubmitForApproval --> NotifyApprover[通知审批人]
    NotifyApprover --> WaitForApproval[等待审批]
    WaitForApproval --> ApprovalDecision{审批决定}
    
    ApprovalDecision -->|批准| UpdateStatus[更新案件状态]
    ApprovalDecision -->|拒绝| NotifyRejection[通知拒绝原因]
    NotifyRejection --> End([结束])
    
    RequireApproval -->|不需要审批| AddStatusNote[添加状态备注]
    AddStatusNote --> UpdateStatus
    
    UpdateStatus --> RecordStatusHistory[记录状态变更历史]
    RecordStatusHistory --> TriggerWorkflow{触发工作流?}
    
    TriggerWorkflow -->|是| ExecuteWorkflow[执行工作流]
    TriggerWorkflow -->|否| NotifyStakeholders[通知相关人员]
    ExecuteWorkflow --> NotifyStakeholders
    
    NotifyStakeholders --> UpdateReports[更新报告数据]
    UpdateReports --> CheckMilestones{检查里程碑}
    
    CheckMilestones -->|达到里程碑| CelebrateMilestone[庆祝里程碑]
    CheckMilestones -->|未达到| LogActivity[记录活动日志]
    CelebrateMilestone --> LogActivity
    
    LogActivity --> End
```

---

## 4. 工时记录流程

### 4.1 工时追踪活动图

```mermaid
flowchart TD
    Start([开始]) --> ClickStartWork[点击开始工作]
    ClickStartWork --> SelectCase{选择关联案件?}
    
    SelectCase -->|是| ChooseCase[选择案件]
    SelectCase -->|否| StartTimer[启动计时器]
    ChooseCase --> StartTimer
    
    StartTimer --> RecordStartTime[记录开始时间]
    RecordStartTime --> ShowTimerUI[显示计时器界面]
    ShowTimerUI --> WorkingState[工作状态]
    
    WorkingState --> UserAction{用户操作}
    
    UserAction -->|暂停| PauseTimer[暂停计时器]
    PauseTimer --> RecordPauseTime[记录暂停时间]
    RecordPauseTime --> ShowPausedUI[显示暂停界面]
    ShowPausedUI --> PausedState[暂停状态]
    
    PausedState --> ResumeAction{用户操作}
    ResumeAction -->|继续| ResumeTimer[恢复计时器]
    ResumeAction -->|结束| StopTimer[停止计时器]
    ResumeTimer --> RecordResumeTime[记录恢复时间]
    RecordResumeTime --> WorkingState
    
    UserAction -->|结束| StopTimer
    StopTimer --> RecordEndTime[记录结束时间]
    RecordEndTime --> CalculateDuration[计算总时长]
    CalculateDuration --> ShowSummaryForm[显示工时总结表单]
    
    ShowSummaryForm --> FillDescription[填写工作描述]
    FillDescription --> SetBillableStatus[设置计费状态]
    SetBillableStatus --> ValidateEntry{验证工时记录}
    
    ValidateEntry -->|验证失败| ShowValidationError[显示验证错误]
    ShowValidationError --> FillDescription
    
    ValidateEntry -->|验证通过| SaveTimeEntry[保存工时记录]
    SaveTimeEntry --> CalculateCost{计算费用}
    
    CalculateCost -->|计费时间| ApplyHourlyRate[应用小时费率]
    CalculateCost -->|非计费时间| SkipCostCalculation[跳过费用计算]
    ApplyHourlyRate --> UpdateCaseTotal[更新案件总计]
    SkipCostCalculation --> UpdateCaseTotal
    
    UpdateCaseTotal --> NotifyIfRequired{是否需要通知?}
    NotifyIfRequired -->|是| SendNotification[发送通知]
    NotifyIfRequired -->|否| ShowSuccess[显示保存成功]
    SendNotification --> ShowSuccess
    ShowSuccess --> End([结束])
```

### 4.2 工时审批流程活动图

```mermaid
flowchart TD
    Start([开始]) --> SubmitTimeEntries[提交工时记录]
    SubmitTimeEntries --> ValidateSubmission{验证提交}
    
    ValidateSubmission -->|验证失败| ShowSubmissionError[显示提交错误]
    ShowSubmissionError --> SubmitTimeEntries
    
    ValidateSubmission -->|验证通过| ChangeStatusToPending[更改状态为待审批]
    ChangeStatusToPending --> NotifyApprover[通知审批人]
    NotifyApprover --> WaitingForReview[等待审批]
    
    WaitingForReview --> ApproverAction[审批人查看]
    ApproverAction --> ReviewTimeEntries[审查工时记录]
    ReviewTimeEntries --> CheckDetails[检查详细信息]
    
    CheckDetails --> ApprovalDecision{审批决定}
    
    ApprovalDecision -->|批准| ApproveEntries[批准工时记录]
    ApproveEntries --> UpdateStatusToApproved[更新状态为已批准]
    UpdateStatusToApproved --> CalculateFinalCost[计算最终费用]
    CalculateFinalCost --> UpdateBillingRecords[更新计费记录]
    UpdateBillingRecords --> NotifySubmitterApproval[通知提交人批准]
    NotifySubmitterApproval --> GenerateInvoice{生成发票?}
    
    GenerateInvoice -->|是| CreateInvoice[创建发票]
    GenerateInvoice -->|否| End([结束])
    CreateInvoice --> End
    
    ApprovalDecision -->|拒绝| RejectEntries[拒绝工时记录]
    RejectEntries --> AddRejectionReason[添加拒绝原因]
    AddRejectionReason --> UpdateStatusToRejected[更新状态为已拒绝]
    UpdateStatusToRejected --> NotifySubmitterRejection[通知提交人拒绝]
    NotifySubmitterRejection --> AllowResubmission{允许重新提交?}
    
    AllowResubmission -->|是| ResetToEditable[重置为可编辑]
    AllowResubmission -->|否| ArchiveRejected[归档拒绝记录]
    ResetToEditable --> End
    ArchiveRejected --> End
    
    ApprovalDecision -->|需要修改| RequestModification[请求修改]
    RequestModification --> AddModificationNotes[添加修改说明]
    AddModificationNotes --> NotifyForModification[通知需要修改]
    NotifyForModification --> WaitForModification[等待修改]
    WaitForModification --> ModificationSubmitted[提交修改]
    ModificationSubmitted --> ReviewTimeEntries
```

---

## 5. 通知和提醒流程

### 5.1 事件提醒活动图

```mermaid
flowchart TD
    Start([定时任务触发]) --> CheckPendingReminders[检查待发送提醒]
    CheckPendingReminders --> HasReminders{有待发送提醒?}
    
    HasReminders -->|否| End([结束])
    HasReminders -->|是| GetNextReminder[获取下一个提醒]
    
    GetNextReminder --> CheckReminderTime{检查提醒时间}
    CheckReminderTime -->|时间未到| ScheduleNext[安排下次检查]
    ScheduleNext --> End
    
    CheckReminderTime -->|时间已到| GetEventDetails[获取事件详情]
    GetEventDetails --> CheckEventStatus{检查事件状态}
    
    CheckEventStatus -->|事件已取消| MarkReminderCancelled[标记提醒已取消]
    MarkReminderCancelled --> GetNextReminder
    
    CheckEventStatus -->|事件有效| GetUserPreferences[获取用户偏好]
    GetUserPreferences --> DetermineReminderType[确定提醒类型]
    
    DetermineReminderType --> ReminderType{提醒类型}
    
    ReminderType -->|应用内通知| SendInAppNotification[发送应用内通知]
    ReminderType -->|邮件| SendEmailReminder[发送邮件提醒]
    ReminderType -->|短信| SendSMSReminder[发送短信提醒]
    ReminderType -->|推送通知| SendPushNotification[发送推送通知]
    
    SendInAppNotification --> MarkReminderSent[标记提醒已发送]
    SendEmailReminder --> MarkReminderSent
    SendSMSReminder --> MarkReminderSent
    SendPushNotification --> MarkReminderSent
    
    MarkReminderSent --> LogReminderActivity[记录提醒活动]
    LogReminderActivity --> CheckMoreReminders{还有更多提醒?}
    
    CheckMoreReminders -->|是| GetNextReminder
    CheckMoreReminders -->|否| End
```

---

## 6. 错误处理和恢复流程

### 6.1 系统错误处理活动图

```mermaid
flowchart TD
    Start([检测到错误]) --> CaptureError[捕获错误信息]
    CaptureError --> ClassifyError{错误分类}
    
    ClassifyError -->|用户错误| HandleUserError[处理用户错误]
    ClassifyError -->|系统错误| HandleSystemError[处理系统错误]
    ClassifyError -->|网络错误| HandleNetworkError[处理网络错误]
    
    HandleUserError --> ShowUserFriendlyMessage[显示用户友好消息]
    ShowUserFriendlyMessage --> LogUserError[记录用户错误]
    LogUserError --> End([结束])
    
    HandleSystemError --> CheckSeverity{检查严重程度}
    CheckSeverity -->|严重| TriggerAlert[触发告警]
    CheckSeverity -->|一般| LogSystemError[记录系统错误]
    
    TriggerAlert --> NotifyAdministrators[通知管理员]
    NotifyAdministrators --> AttemptRecovery[尝试自动恢复]
    AttemptRecovery --> RecoverySuccess{恢复成功?}
    
    RecoverySuccess -->|成功| LogRecovery[记录恢复信息]
    RecoverySuccess -->|失败| EscalateIssue[升级问题]
    LogRecovery --> End
    EscalateIssue --> End
    
    LogSystemError --> End
    
    HandleNetworkError --> CheckConnectivity[检查网络连接]
    CheckConnectivity --> RetryRequest{重试请求}
    
    RetryRequest -->|重试成功| LogNetworkRecovery[记录网络恢复]
    RetryRequest -->|重试失败| ShowOfflineMode[显示离线模式]
    LogNetworkRecovery --> End
    ShowOfflineMode --> CacheRequest[缓存请求]
    CacheRequest --> End
```

---

**文档版本**: v1.0  
**最后更新**: 2025年7月  
**维护人员**: 赵启睿  
**审核人员**: 赵启睿
