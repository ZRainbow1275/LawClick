export type TemplateVariableType = "string" | "textarea" | "date" | "currency" | "number"

export type DocumentTemplateVariable = {
    key: string
    label: string
    type: TemplateVariableType
    required?: boolean
}

export type DocumentTemplateListItem = {
    code: string
    name: string
    description: string | null
    variables: DocumentTemplateVariable[]
    isActive: boolean
    updatedAt: string
}

export type DocumentTemplateDetail = DocumentTemplateListItem & {
    content: string
}
