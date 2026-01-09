export const ROLE_KEYS = [
    "PARTNER",
    "SENIOR_LAWYER",
    "LAWYER",
    "TRAINEE",
    "ADMIN",
    "HR",
    "MARKETING",
    "LEGAL_SECRETARY",
    "CLIENT",
    "FIRM_ENTITY",
] as const

export type RoleKey = (typeof ROLE_KEYS)[number]

const ROLE_SET = new Set<string>(ROLE_KEYS)

export function parseRoleKey(value: unknown): RoleKey {
    if (typeof value !== "string") return "CLIENT"
    return ROLE_SET.has(value) ? (value as RoleKey) : "CLIENT"
}

