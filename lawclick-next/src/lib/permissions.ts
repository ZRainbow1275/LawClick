/**
 * 权限配置 - 基于架构设计文档的身份权限管理
 * 
 * 角色层级：
 * - 专业序列：PARTNER > SENIOR_LAWYER > LAWYER > TRAINEE
 * - 行政序列：ADMIN > HR/MARKETING > LEGAL_SECRETARY
 * - 外部角色：CLIENT
 * - 系统角色：FIRM_ENTITY（用于离职归档）
 */

import type { Role } from "@prisma/client"
import type { RoleKey } from "@/lib/role-keys"

type Assert<T extends true> = T
type RoleKeysMatchPrismaRole = Exclude<Role, RoleKey> extends never ? (Exclude<RoleKey, Role> extends never ? true : false) : false
export const ROLE_KEYS_MATCH_PRISMA_ROLE: Assert<RoleKeysMatchPrismaRole> = true

// ==============================================================================
// 权限类型定义
// ==============================================================================

export type Permission =
    // Dashboard permissions
    | 'dashboard:view'
    | 'dashboard:edit'
    // Case permissions
    | 'case:view'
    | 'case:create'
    | 'case:edit'
    | 'case:delete'
    | 'case:assign'
    | 'case:archive'
    // Task permissions
    | 'task:view'
    | 'task:create'
    | 'task:edit'
    | 'task:delete'
    // Document permissions
    | 'document:view'
    | 'document:upload'
    | 'document:edit'
    | 'document:delete'
    | 'document:template_manage'
    // Billing permissions
    | 'billing:view'
    | 'billing:create'
    | 'billing:edit'
    | 'billing:approve'
    | 'timelog:approve'
    // Team permissions
    | 'team:view'
    | 'team:manage'
    | 'user:manage'
    | 'user:view_all'
    // Approval / OA permissions
    | 'approval:create'
    | 'approval:approve'
    | 'approval:view_all'
    // CRM permissions
    | 'crm:view'
    | 'crm:edit'
  // Tools permissions
  | 'tools:manage'
  // AI permissions
  | 'ai:use'
  // Admin permissions
  | 'admin:access'
  | 'admin:settings'
  | 'admin:audit'

export const ALL_PERMISSIONS = [
    "dashboard:view",
    "dashboard:edit",
    "case:view",
    "case:create",
    "case:edit",
    "case:delete",
    "case:assign",
    "case:archive",
    "task:view",
    "task:create",
    "task:edit",
    "task:delete",
    "document:view",
    "document:upload",
    "document:edit",
    "document:delete",
    "document:template_manage",
    "billing:view",
    "billing:create",
    "billing:edit",
    "billing:approve",
    "timelog:approve",
    "team:view",
    "team:manage",
    "user:manage",
    "user:view_all",
    "approval:create",
    "approval:approve",
    "approval:view_all",
    "crm:view",
    "crm:edit",
    "tools:manage",
    "ai:use",
    "admin:access",
    "admin:settings",
    "admin:audit",
] as const satisfies ReadonlyArray<Permission>

type PermissionKeysMatch = Exclude<Permission, (typeof ALL_PERMISSIONS)[number]> extends never
    ? Exclude<(typeof ALL_PERMISSIONS)[number], Permission> extends never
        ? true
        : false
    : false
export const PERMISSION_KEYS_MATCH_ALL_PERMISSIONS: Assert<PermissionKeysMatch> = true

// ==============================================================================
// 角色层级（数字越大权限越高）
// ==============================================================================

export const ROLE_HIERARCHY: Record<Role, number> = {
    PARTNER: 100,
    SENIOR_LAWYER: 80,
    LAWYER: 60,
    TRAINEE: 40,
    ADMIN: 90,
    HR: 50,
    MARKETING: 50,
    LEGAL_SECRETARY: 45,
    CLIENT: 10,
    FIRM_ENTITY: 0,
}

// ==============================================================================
// 角色权限配置
// ==============================================================================

type RolePermissions = Record<Role, Permission[]>

export const ROLE_PERMISSIONS: RolePermissions = {
    PARTNER: [
        'dashboard:view', 'dashboard:edit',
        'case:view', 'case:create', 'case:edit', 'case:delete', 'case:assign', 'case:archive',
        'task:view', 'task:create', 'task:edit', 'task:delete',
        'document:view', 'document:upload', 'document:edit', 'document:delete', 'document:template_manage',
        'billing:view', 'billing:create', 'billing:edit', 'billing:approve', 'timelog:approve',
        'team:view', 'team:manage', 'user:manage', 'user:view_all',
        'approval:create', 'approval:approve', 'approval:view_all',
        'crm:view', 'crm:edit',
        'tools:manage',
        'ai:use',
        'admin:access', 'admin:settings', 'admin:audit'
    ],
    SENIOR_LAWYER: [
        'dashboard:view', 'dashboard:edit',
        'case:view', 'case:create', 'case:edit', 'case:assign', 'case:archive',
        'task:view', 'task:create', 'task:edit', 'task:delete',
        'document:view', 'document:upload', 'document:edit', 'document:delete',
        'billing:view', 'billing:create', 'timelog:approve',
        'team:view', 'team:manage',
        'approval:create', 'approval:approve',
        'crm:view', 'crm:edit',
        'ai:use',
    ],
    LAWYER: [
        'dashboard:view', 'dashboard:edit',
        'case:view', 'case:create', 'case:edit', 'case:assign',
        'task:view', 'task:create', 'task:edit',
        'document:view', 'document:upload', 'document:edit',
        'billing:view', 'billing:create',
        'team:view',
        'approval:create',
        'crm:view', 'crm:edit',
        'ai:use',
    ],
    TRAINEE: [
        'dashboard:view', 'dashboard:edit',
        'case:view',
        'task:view', 'task:create', 'task:edit',
        'document:view', 'document:upload',
        'team:view',
        'approval:create',
        'crm:view',
        'ai:use',
    ],
    ADMIN: [
        'dashboard:view', 'dashboard:edit',
        'case:view',
        'task:view', 'task:create', 'task:edit', 'task:delete',
        'document:view', 'document:upload', 'document:edit', 'document:delete', 'document:template_manage',
        'billing:view', 'billing:create', 'billing:edit', 'billing:approve',
        'team:view', 'team:manage', 'user:manage', 'user:view_all',
        'approval:create', 'approval:approve', 'approval:view_all',
        'crm:view', 'crm:edit',
        'tools:manage',
        'ai:use',
        'admin:access', 'admin:settings', 'admin:audit'
    ],
    HR: [
        'dashboard:view', 'dashboard:edit',
        'task:view', 'task:create', 'task:edit',
        'document:view', 'document:upload',
        'team:view', 'user:manage', 'user:view_all',
        'approval:create',
        'ai:use',
    ],
    MARKETING: [
        'dashboard:view', 'dashboard:edit',
        'task:view', 'task:create', 'task:edit',
        'document:view', 'document:upload',
        'team:view',
        'approval:create',
        'crm:view', 'crm:edit',
        'ai:use',
    ],
    LEGAL_SECRETARY: [
        'dashboard:view', 'dashboard:edit',
        'case:view',
        'task:view', 'task:create', 'task:edit',
        'document:view', 'document:upload', 'document:edit',
        'billing:view',
        'team:view',
        'approval:create',
        'crm:view', 'crm:edit',
        'ai:use',
    ],
    CLIENT: [
        'case:view',
        'document:view',
        'billing:view'
    ],
    FIRM_ENTITY: []
}

// ==============================================================================
// 辅助函数
// ==============================================================================

export function hasPermission(role: Role, permission: Permission): boolean {
    const permissions = ROLE_PERMISSIONS[role] || []
    return permissions.includes(permission)
}

export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
    return permissions.some(p => hasPermission(role, p))
}

export function hasAllPermissions(role: Role, permissions: Permission[]): boolean {
    return permissions.every(p => hasPermission(role, p))
}

export function isHigherRole(role1: Role, role2: Role): boolean {
    return ROLE_HIERARCHY[role1] > ROLE_HIERARCHY[role2]
}

// ==============================================================================
// 角色显示名称
// ==============================================================================

export const ROLE_DISPLAY_NAMES: Record<Role, string> = {
    PARTNER: '合伙人',
    SENIOR_LAWYER: '高级律师',
    LAWYER: '专职律师',
    TRAINEE: '实习生',
    ADMIN: '管理员',
    HR: '人事',
    MARKETING: '品牌',
    LEGAL_SECRETARY: '法律秘书',
    CLIENT: '客户',
    FIRM_ENTITY: '律所',
}

export const PROFESSIONAL_ROLES: Role[] = ['PARTNER', 'SENIOR_LAWYER', 'LAWYER', 'TRAINEE']
export const ADMIN_ROLES: Role[] = ['ADMIN', 'HR', 'MARKETING', 'LEGAL_SECRETARY']

export function isProfessionalRole(role: Role): boolean {
    return PROFESSIONAL_ROLES.includes(role)
}

export function isAdminRole(role: Role): boolean {
    return ADMIN_ROLES.includes(role)
}
