export type TaskCapabilities = {
    canView: boolean
    canCreate: boolean
    canEdit: boolean
    canDelete: boolean
}

export const EMPTY_TASK_CAPABILITIES: TaskCapabilities = {
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
}

export type DocumentCapabilities = {
    canView: boolean
    canUpload: boolean
    canEdit: boolean
    canDelete: boolean
}

export const EMPTY_DOCUMENT_CAPABILITIES: DocumentCapabilities = {
    canView: false,
    canUpload: false,
    canEdit: false,
    canDelete: false,
}
