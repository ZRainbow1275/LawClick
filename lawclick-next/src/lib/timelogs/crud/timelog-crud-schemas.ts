import { TimeLogStatus } from "@prisma/client"
import { z } from "zod"

import { DateInputSchema, OptionalNonEmptyString, UuidSchema } from "@/lib/zod"

export const StartTimerInputSchema = z
    .object({
        caseId: UuidSchema.optional(),
        taskId: UuidSchema.optional(),
        description: z.string().trim().min(1, "工时描述不能为空").max(5000),
        isBillable: z.boolean().optional(),
    })
    .strict()
    .refine((v) => v.caseId || v.taskId, { message: "工时必须关联案件/任务" })

export const AddManualTimeLogInputSchema = z
    .object({
        caseId: UuidSchema.optional(),
        taskId: UuidSchema.optional(),
        description: z.string().trim().min(1, "工时描述不能为空").max(5000),
        startTime: DateInputSchema,
        endTime: DateInputSchema,
        isBillable: z.boolean().optional(),
    })
    .strict()
    .refine((v) => v.caseId || v.taskId, { message: "工时必须关联案件/任务" })
    .refine((v) => v.endTime.getTime() > v.startTime.getTime(), { message: "结束时间必须晚于开始时间" })

export const GetMyTimeLogsInputSchema = z
    .object({
        from: DateInputSchema,
        to: DateInputSchema,
        status: z.array(z.nativeEnum(TimeLogStatus)).min(1).optional(),
        caseId: UuidSchema.optional(),
        taskId: UuidSchema.optional(),
        take: z.number().int().min(1).max(500).optional(),
    })
    .strict()
    .refine((v) => v.to.getTime() > v.from.getTime(), { message: "无效的日期范围" })

export const GetMyTimeSummaryInputSchema = z
    .object({
        from: DateInputSchema,
        to: DateInputSchema,
    })
    .strict()
    .refine((v) => v.to.getTime() > v.from.getTime(), { message: "无效的日期范围" })

export const DateTimeStringSchema = z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(new Date(value).getTime()), { message: "无效日期" })

export const UpdateTimeLogInputSchema = z
    .object({
        id: UuidSchema,
        description: OptionalNonEmptyString(5000),
        isBillable: z.boolean().optional(),
        startTime: DateTimeStringSchema.optional(),
        endTime: DateTimeStringSchema.optional(),
        caseId: UuidSchema.nullable().optional(),
        taskId: UuidSchema.nullable().optional(),
    })
    .strict()

export const GetTimeLogsPendingApprovalInputSchema = z
    .object({
        from: DateInputSchema.optional(),
        to: DateInputSchema.optional(),
        take: z.number().int().min(1).max(200).optional(),
        status: z.array(z.nativeEnum(TimeLogStatus)).min(1).optional(),
    })
    .strict()
    .optional()

export const GetCaseTimeLogsInputSchema = z
    .object({
        caseId: UuidSchema,
        cursor: UuidSchema.optional(),
        take: z.number().int().min(1).max(200).optional(),
        from: DateInputSchema.optional(),
        to: DateInputSchema.optional(),
        status: z.array(z.nativeEnum(TimeLogStatus)).min(1).optional(),
    })
    .strict()
    .refine((v) => (v.from && v.to ? v.to.getTime() > v.from.getTime() : true), {
        message: "无效的日期范围",
    })

