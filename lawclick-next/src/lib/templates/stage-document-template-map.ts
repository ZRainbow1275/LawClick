import { DocumentTypes } from "@/lib/litigation-stages"
import { NonLitigationDocumentTypes } from "@/lib/non-litigation-stages"
import { TemplateCodeSchema } from "@/lib/templates/schemas"

const STAGE_DOCUMENT_TEMPLATE_CODE_MAP: Record<string, string> = {
    // Litigation
    [DocumentTypes.SERVICE_CONTRACT]: "L-01",
    [DocumentTypes.CONFLICT_CHECK_REPORT]: "L-02",
    [DocumentTypes.INTAKE_APPROVAL]: "L-03",
    [DocumentTypes.POWER_OF_ATTORNEY]: "L-04",
    [DocumentTypes.LAW_FIRM_LETTER]: "L-05",
    [DocumentTypes.ENGAGEMENT_NOTICE]: "L-06",
    [DocumentTypes.COMPLAINT]: "L-07",
    [DocumentTypes.COUNTERCLAIM]: "L-08",
    [DocumentTypes.APPEAL]: "L-09",
    [DocumentTypes.SERVICE_ADDRESS_CONFIRM]: "L-10",
    [DocumentTypes.LITIGATION_INTEGRITY]: "L-11",
    [DocumentTypes.EVIDENCE_LIST_INITIAL]: "L-12",
    [DocumentTypes.PRESERVATION_APPLICATION]: "L-13",
    [DocumentTypes.PRESERVATION_GUARANTEE]: "L-14",
    [DocumentTypes.JURISDICTION_OBJECTION]: "L-15",
    [DocumentTypes.ONLINE_FILING_SCREENSHOT]: "L-16",
    [DocumentTypes.ONLINE_FILING_RECEIPT]: "L-16",
    [DocumentTypes.EXTENSION_EVIDENCE]: "L-17",
    [DocumentTypes.INVESTIGATION_ORDER]: "L-18",
    [DocumentTypes.WITNESS_APPLICATION]: "L-19",
    [DocumentTypes.APPRAISAL_APPLICATION]: "L-20",
    [DocumentTypes.EVIDENCE_BUNDLE]: "L-21",
    [DocumentTypes.SPECIMEN_CONFIRMATION]: "L-22",
    [DocumentTypes.ADD_PARTY_APPLICATION]: "L-23",
    [DocumentTypes.CLAIM_CHANGE_APPLICATION]: "L-24",
    [DocumentTypes.TRIAL_OUTLINE]: "L-25",
    [DocumentTypes.CROSS_EXAMINATION]: "L-26",
    [DocumentTypes.AGENT_STATEMENT]: "L-27",
    [DocumentTypes.SIMILAR_CASES_REPORT]: "L-28",
    [DocumentTypes.TRIAL_RECORD]: "L-29",
    [DocumentTypes.ENFORCEMENT_APPLICATION]: "L-30",
    [DocumentTypes.ASSET_CLUE_REPORT]: "L-31",
    [DocumentTypes.CASE_CLOSING_REPORT]: "L-32",
    [DocumentTypes.RETRIAL_APPLICATION]: "L-33",
    [DocumentTypes.EXECUTION_OBJECTION]: "L-34",

    // Non Litigation
    [NonLitigationDocumentTypes.DD_CHECKLIST]: "N-01",
    [NonLitigationDocumentTypes.EXECUTIVE_INTERVIEW]: "N-02",
    [NonLitigationDocumentTypes.NDA]: "N-03",
    [NonLitigationDocumentTypes.TERM_SHEET]: "N-04",
    [NonLitigationDocumentTypes.EXCLUSIVITY_AGREEMENT]: "N-05",
    [NonLitigationDocumentTypes.DD_REPORT]: "N-06",
    [NonLitigationDocumentTypes.INTERVIEW_RECORD]: "N-07",
    [NonLitigationDocumentTypes.MOU]: "N-08",
    [NonLitigationDocumentTypes.CAPITAL_INCREASE]: "N-09",
    [NonLitigationDocumentTypes.SHARE_TRANSFER]: "N-10",
    [NonLitigationDocumentTypes.SHAREHOLDERS_AGREEMENT]: "N-11",
    [NonLitigationDocumentTypes.ARTICLES_AMENDMENT]: "N-12",
    [NonLitigationDocumentTypes.DISCLOSURE_SCHEDULE]: "N-13",
    [NonLitigationDocumentTypes.TRANSACTION_MEMO]: "N-14",
    [NonLitigationDocumentTypes.ESOP]: "N-15",
    [NonLitigationDocumentTypes.NON_COMPETE]: "N-16",
    [NonLitigationDocumentTypes.IP_TRANSFER]: "N-17",
    [NonLitigationDocumentTypes.SPOUSE_CONSENT]: "N-18",
    [NonLitigationDocumentTypes.CLOSING_CHECKLIST]: "N-19",
    [NonLitigationDocumentTypes.CP_SATISFACTION]: "N-20",
    [NonLitigationDocumentTypes.BOARD_RESOLUTION]: "N-21",
    [NonLitigationDocumentTypes.SHAREHOLDER_RESOLUTION]: "N-22",
    [NonLitigationDocumentTypes.ROFR_WAIVER]: "N-23",
    [NonLitigationDocumentTypes.CLOSING_MEMO]: "N-24",
    [NonLitigationDocumentTypes.LEGAL_REP_CHANGE_FORM]: "N-25",
    [NonLitigationDocumentTypes.LEGAL_OPINION]: "N-26",
}

export function getTemplateCodeForStageDocumentType(
    documentType: string | null | undefined
): string | null {
    const cleaned = typeof documentType === "string" ? documentType.trim() : ""
    if (!cleaned) return null

    const code = STAGE_DOCUMENT_TEMPLATE_CODE_MAP[cleaned]
    if (!code) return null

    const parsed = TemplateCodeSchema.safeParse(code)
    return parsed.success ? parsed.data : null
}
