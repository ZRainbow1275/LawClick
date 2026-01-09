import {
    RegisterSchema,
    CreateTaskSchema,
    AddMemberSchema
} from "@/lib/schemas"

describe("Zod Schemas Validation", () => {
    describe("RegisterSchema", () => {
        test("validates correct input", () => {
            const result = RegisterSchema.safeParse({
                name: "Test User",
                email: "test@example.com",
                password: "password123"
            })
            expect(result.success).toBe(true)
        })

        test("fails on short password", () => {
            const result = RegisterSchema.safeParse({
                name: "Test User",
                email: "test@example.com",
                password: "123"
            })
            expect(result.success).toBe(false)
        })

        test("fails on invalid email", () => {
            const result = RegisterSchema.safeParse({
                name: "Test User",
                email: "invalid-email",
                password: "password123"
            })
            expect(result.success).toBe(false)
        })
    })

    describe("AddMemberSchema", () => {
        test("validates correct input", () => {
            const result = AddMemberSchema.safeParse({
                email: "invite@example.com",
                caseId: "123e4567-e89b-12d3-a456-426614174000",
                role: "MEMBER"
            })
            expect(result.success).toBe(true)
        })

        test("validates minimal input (default role)", () => {
            const result = AddMemberSchema.safeParse({
                email: "invite@example.com",
                caseId: "123e4567-e89b-12d3-a456-426614174000"
            })
            expect(result.success).toBe(true)
        })

        test("fails on missing caseId", () => {
            const result = AddMemberSchema.safeParse({
                email: "invite@example.com"
            })
            expect(result.success).toBe(false)
        })
    })

    describe("CreateTaskSchema", () => {
        test("validates correct input", () => {
            const result = CreateTaskSchema.safeParse({
                title: "New Task",
                priority: "P1_HIGH",
                userId: "123e4567-e89b-12d3-a456-426614174000"
            })
            expect(result.success).toBe(true)
        })
    })
})
