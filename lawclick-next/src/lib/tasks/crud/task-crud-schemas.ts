import { z } from "zod"
import { TaskPriority, TaskStatus } from "@prisma/client"

import { TASK_TYPE_VALUES } from "@/lib/task-types"
import { KANBAN_COLUMN_TAKE_MAX, TASKS_TAKE_MAX } from "@/lib/query-limits"
import { DateInputSchema, NonNegativeNumber, NullableNonEmptyString, OptionalNonEmptyString, PositiveInt, UuidSchema } from "@/lib/zod"

const TaskTypeSchema = z.enum(TASK_TYPE_VALUES)

const CreateTaskBaseSchema = z
    .object({
        title: z.string().trim().min(1, "任务标题不能为空").max(200),
        description: OptionalNonEmptyString(5000),
        priority: z.nativeEnum(TaskPriority).optional(),
        dueDate: DateInputSchema.optional(),
        assigneeId: UuidSchema.optional(),
        stage: OptionalNonEmptyString(64),
        swimlane: NullableNonEmptyString(64),
        status: z.nativeEnum(TaskStatus).optional(),
        taskType: TaskTypeSchema.optional(),
        documentId: UuidSchema.optional(),
        estimatedHours: NonNegativeNumber().optional(),
    })
    .strict()

export const CreateCaseTaskInputSchema = CreateTaskBaseSchema.extend({ caseId: UuidSchema }).strict()

export const CreateProjectTaskInputSchema = CreateTaskBaseSchema.extend({ projectId: UuidSchema }).strict()

export const UpdateTaskInputSchema = z
    .object({
        title: OptionalNonEmptyString(200),
        description: NullableNonEmptyString(5000),
        status: z.nativeEnum(TaskStatus).optional(),
        priority: z.nativeEnum(TaskPriority).optional(),
        dueDate: DateInputSchema.nullable().optional(),
        assigneeId: UuidSchema.nullable().optional(),
        stage: NullableNonEmptyString(64),
        swimlane: NullableNonEmptyString(64),
        taskType: z.enum(TASK_TYPE_VALUES).nullable().optional(),
        documentId: UuidSchema.nullable().optional(),
        estimatedHours: NonNegativeNumber().nullable().optional(),
        order: z.number().finite().optional(),
    })
    .strict()

export const MoveTaskOnKanbanInputSchema = z
    .object({
        taskId: UuidSchema,
        toStatus: z.nativeEnum(TaskStatus),
        toSwimlane: NullableNonEmptyString(64),
        beforeTaskId: UuidSchema.nullable().optional(),
        afterTaskId: UuidSchema.nullable().optional(),
    })
    .strict()

export const ReorderTasksInputSchema = z
    .array(
        z
            .object({
                taskId: UuidSchema,
                order: z.number().finite(),
                status: z.nativeEnum(TaskStatus).optional(),
                swimlane: NullableNonEmptyString(64),
                stage: NullableNonEmptyString(64),
            })
            .strict()
    )
    .min(1, "更新列表不能为空")

export const GetAccessibleTasksOptionsSchema = z
    .object({
        caseId: UuidSchema.optional(),
        projectId: UuidSchema.optional(),
        assigneeId: UuidSchema.optional(),
        status: z.array(z.nativeEnum(TaskStatus)).min(1).optional(),
        search: OptionalNonEmptyString(200),
        take: z.number().int().min(1).max(TASKS_TAKE_MAX).optional(),
    })
    .strict()
    .refine((v) => !(v.caseId && v.projectId), { message: "caseId 与 projectId 不可同时指定" })
    .optional()

export const GetAccessibleTaskListPageInputSchema = z
    .object({
        caseId: UuidSchema.optional(),
        projectId: UuidSchema.optional(),
        status: z.array(z.nativeEnum(TaskStatus)).min(1).optional(),
        search: OptionalNonEmptyString(200),
        page: z.number().int().min(0).optional(),
        take: PositiveInt().max(200).optional(),
    })
    .strict()
    .refine((v) => !(v.caseId && v.projectId), { message: "caseId 与 projectId 不可同时指定" })
    .optional()

export const GetKanbanStatusCountsOptionsSchema = z
    .object({
        caseId: UuidSchema.optional(),
        projectId: UuidSchema.optional(),
        assigneeId: UuidSchema.optional(),
        status: z.array(z.nativeEnum(TaskStatus)).min(1).optional(),
        search: OptionalNonEmptyString(200),
    })
    .strict()
    .refine((v) => !(v.caseId && v.projectId), { message: "caseId 与 projectId 不可同时指定" })
    .optional()

export const KanbanStatusPageCursorSchema = z
    .object({
        order: z.number().int(),
        id: UuidSchema,
    })
    .strict()

export const GetKanbanStatusPageInputSchema = z
    .object({
        status: z.nativeEnum(TaskStatus),
        caseId: UuidSchema.optional(),
        projectId: UuidSchema.optional(),
        assigneeId: UuidSchema.optional(),
        search: OptionalNonEmptyString(200),
        cursor: KanbanStatusPageCursorSchema.optional(),
        page: z.number().int().min(0).optional(),
        take: z.number().int().min(1).max(KANBAN_COLUMN_TAKE_MAX).optional(),
    })
    .strict()
    .refine((v) => !(v.caseId && v.projectId), { message: "caseId 与 projectId 不可同时指定" })

export const GetKanbanTaskByIdInputSchema = z
    .object({
        taskId: UuidSchema,
        caseId: UuidSchema.optional(),
        projectId: UuidSchema.optional(),
        assigneeId: UuidSchema.optional(),
        status: z.array(z.nativeEnum(TaskStatus)).max(4).optional(),
        search: OptionalNonEmptyString(200),
    })
    .strict()

