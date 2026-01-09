export const TASK_TYPE_VALUES = [
    "DOCUMENT_DRAFT",
    "MATERIAL_COLLECT",
    "MEETING",
    "COURT",
    "REVIEW",
    "OTHER",
] as const

export type TaskTypeValue = (typeof TASK_TYPE_VALUES)[number]

export const TASK_TYPES: Array<{ value: TaskTypeValue; label: string }> = [
    { value: "DOCUMENT_DRAFT", label: "文书起草" },
    { value: "MATERIAL_COLLECT", label: "材料收集" },
    { value: "MEETING", label: "会议/沟通" },
    { value: "COURT", label: "开庭/出庭" },
    { value: "REVIEW", label: "审阅/校对" },
    { value: "OTHER", label: "其他" },
]

