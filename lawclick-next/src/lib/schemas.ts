import { z } from "zod"

export const LoginSchema = z.object({
    email: z.string().email({ message: "请输入有效的邮箱地址" }),
    password: z.string().min(1, { message: "请输入密码" })
})

export const RegisterSchema = z.object({
    name: z.string().min(2, { message: "姓名至少需要2个字符" }),
    email: z.string().email({ message: "请输入有效的邮箱地址" }),
    password: z.string().min(6, { message: "密码至少需要6个字符" })
})

export const CreateTaskSchema = z.object({
    title: z.string().min(1, { message: "标题不能为空" }),
    description: z.string().optional(),
    priority: z.enum(["P0_URGENT", "P1_HIGH", "P2_MEDIUM", "P3_LOW"]).optional(),
    userId: z.string().uuid(),
    caseId: z.string().optional() // Make optional for now, but handle in Action
})

export const ResetPasswordSchema = z.object({
    email: z.string().email({ message: "请输入有效的邮箱地址" })
})

export const NewPasswordSchema = z.object({
    token: z.string(),
    password: z.string().min(6, { message: "密码至少需要6个字符" })
})

export const CreateEventSchema = z.object({
    title: z.string().min(1, { message: "标题不能为空" }),
    startTime: z.string(), // We'll parse to Date in action
    endTime: z.string(),
    type: z.string().optional(),
    userId: z.string().uuid()
})

export const CreateTimeLogSchema = z.object({
    description: z.string().min(1, { message: "描述不能为空" }),
    duration: z.coerce.number().min(1, { message: "时长必须大于0" }),
    startTime: z.string(),
    userId: z.string().uuid(),
    caseId: z.string().optional()
})

export const AddMemberSchema = z.object({
    email: z.string().email({ message: "请输入有效的邮箱地址" }),
    caseId: z.string().uuid({ message: "案件ID格式不正确" }),
    role: z.enum(["VIEWER", "MEMBER", "OWNER"]).optional()
})
