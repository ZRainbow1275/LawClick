const UUID_SEGMENT_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuidSegment(segment: string) {
    return UUID_SEGMENT_RE.test(segment)
}

function sanitizeWorkspaceSegment(value: string) {
    const trimmed = (value || "").trim().toLowerCase()
    if (!trimmed) return null
    if (trimmed.length > 40) return null
    if (!/^[a-z0-9_-]+$/.test(trimmed)) return null
    return trimmed
}

function extractEntityIdFromPathname(pathname: string) {
    const raw = (pathname || "").trim()
    if (!raw || !raw.startsWith("/")) return null
    const parts = raw.split("/").filter(Boolean)
    const last = parts[parts.length - 1]
    if (!last) return null
    return isUuidSegment(last) ? last : null
}

export function normalizePathnameForWorkspace(pathname: string) {
    const raw = (pathname || "").trim()
    if (!raw || !raw.startsWith("/")) return "/"
    const parts = raw.split("/").filter(Boolean)
    const normalized = parts.map((part) => (isUuidSegment(part) ? ":id" : part))
    return "/" + normalized.join("/")
}

export function buildPageWorkspaceKey(pathname: string) {
    const normalized = normalizePathnameForWorkspace(pathname)
    const entityId = extractEntityIdFromPathname(pathname)
    if (entityId) return `page:${normalized}::entity::${entityId}`
    return `page:${normalized}`
}

export function buildSectionWorkspaceKey(
    pathname: string,
    options?: { sectionId?: string; entityId?: string | null }
) {
    const normalized = normalizePathnameForWorkspace(pathname)
    const sectionId = sanitizeWorkspaceSegment(options?.sectionId || "main") || "main"
    const entityId = (options?.entityId || "").trim()
    if (entityId) return `section:${normalized}::${sectionId}::entity::${entityId}`
    return `section:${normalized}::${sectionId}`
}
