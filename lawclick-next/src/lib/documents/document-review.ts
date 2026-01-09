import "server-only"

import { TemplateCodeSchema } from "@/lib/templates/schemas"
import { findBuiltinDocumentTemplate } from "@/lib/templates/builtin/builtin-document-templates"
import type { DocumentReviewDoc, DocumentReviewItem, DocumentReviewStatus } from "@/lib/documents/document-review-types"

function buildItem(input: {
    id: string
    title: string
    status: DocumentReviewStatus
    detail?: string | null
}): DocumentReviewItem {
    return {
        id: input.id,
        title: input.title,
        status: input.status,
        detail: input.detail ?? null,
    }
}

function normalizeTag(value: string): string {
    return value.trim()
}

function parseTemplateCodeFromTag(tag: string): { ok: true; code: string } | { ok: false; error: string } {
    const raw = normalizeTag(tag)
    if (!raw.toLowerCase().startsWith("template:")) {
        return { ok: false, error: "不是 template:* 标签" }
    }

    const codeRaw = raw.slice("template:".length).trim()
    if (!codeRaw) {
        return { ok: false, error: "template 标签缺少模板代码" }
    }

    const parsed = TemplateCodeSchema.safeParse(codeRaw)
    if (!parsed.success) {
        return { ok: false, error: "模板代码格式不合法" }
    }

    return { ok: true, code: parsed.data }
}

export function buildDocumentReviewItems(document: DocumentReviewDoc): DocumentReviewItem[] {
    const items: DocumentReviewItem[] = []

    const tags = (document.tags || []).map(normalizeTag).filter(Boolean)
    const notes = (document.notes || "").trim()
    const hasFile = Boolean((document.fileUrl || "").trim())
    const hasNotes = notes.length > 0

    items.push(
        buildItem({
            id: "r_content_source",
            title: "内容来源（附件/备注）",
            status: hasFile ? "PASS" : hasNotes ? "WARN" : "FAIL",
            detail: hasFile ? "已上传附件" : hasNotes ? "未上传附件，当前仅有备注/草稿" : "未上传附件且备注为空，无法审阅正文",
        })
    )

    items.push(
        buildItem({
            id: "r_category",
            title: "文档分类（category）",
            status: document.category ? "PASS" : "WARN",
            detail: document.category ? `分类：${document.category}` : "建议设置分类，便于检索与权限/保密策略扩展",
        })
    )

    items.push(
        buildItem({
            id: "r_tags",
            title: "标签（tags）",
            status: tags.length > 0 ? "PASS" : "WARN",
            detail: tags.length > 0 ? `标签数量：${tags.length}` : "未设置标签（建议保留 template:* 与阶段/类别标签）",
        })
    )

    const templateTags = tags.filter((t) => t.toLowerCase().startsWith("template:"))
    if (templateTags.length === 0) {
        items.push(
            buildItem({
                id: "r_template_tag",
                title: "模板来源（template:*）",
                status: "WARN",
                detail: "未发现 template:* 标签（如由模板起草生成，建议保留以便追溯）",
            })
        )
    } else {
        const parsedCodes = templateTags.map((tag) => ({ tag, parsed: parseTemplateCodeFromTag(tag) }))
        const invalid = parsedCodes.filter((it) => !it.parsed.ok)
        const normalizedCodes = parsedCodes
            .filter((it) => it.parsed.ok)
            .map((it) => (it.parsed as { ok: true; code: string }).code)

        const uniqueCodes = Array.from(new Set(normalizedCodes))
        const unknown = uniqueCodes.filter((code) => !findBuiltinDocumentTemplate(code))

        const status: DocumentReviewStatus =
            invalid.length > 0 ? "WARN" : unknown.length > 0 ? "WARN" : templateTags.length > 1 ? "WARN" : "PASS"

        const detailLines: string[] = []
        if (templateTags.length > 1) detailLines.push(`检测到多个 template 标签：${templateTags.join("、")}`)
        if (uniqueCodes.length > 0) detailLines.push(`模板代码：${uniqueCodes.join("、")}`)
        if (invalid.length > 0) detailLines.push(`不合法：${invalid.map((it) => it.tag).join("、")}`)
        if (unknown.length > 0) detailLines.push(`未知模板代码（不在内置模板库）：${unknown.join("、")}`)

        items.push(
            buildItem({
                id: "r_template_tag",
                title: "模板来源（template:*）",
                status,
                detail: detailLines.join("\n") || null,
            })
        )
    }

    items.push(
        buildItem({
            id: "r_confidential",
            title: "保密标识",
            status: "PASS",
            detail: document.isConfidential ? "已标记为保密文档" : "未标记保密",
        })
    )

    items.push(
        buildItem({
            id: "r_summary",
            title: "摘要（summary）",
            status: (document.summary || "").trim().length > 0 ? "PASS" : "WARN",
            detail: (document.summary || "").trim().length > 0 ? "已填写摘要" : "未填写摘要（建议补齐用于检索与复盘）",
        })
    )

    return items
}

