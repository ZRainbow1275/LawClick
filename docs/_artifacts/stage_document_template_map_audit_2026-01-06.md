# Stage Document → Template Map Audit (2026-01-06)

> 目的：校验“阶段文书(Document.documentType) ↔ 默认模板码(DocumentTemplate.code)”映射的完备性，避免出现：阶段清单里有文书，但无法一键从默认模板起草。
> 说明：未映射的文书类型并不一定是缺陷（可能是需上传的法院文书/材料），但需要人工确认。

## Summary
- doc list codes: 86
- builtin template codes: 86
- mapping entries: 61
- mapping codes: 60
- mapping codes missing in doc list: 0
- mapping codes missing in builtin: 0
- litigation stage doc types: 40
- non-litigation stage doc types: 28
- litigation mapped types used by stages: 35
- non-litigation mapped types used by stages: 26
- unmapped litigation types (expected upload-only): 5
- unmapped litigation types (needs decision): 0
- unmapped non-litigation types (expected upload-only): 2
- unmapped non-litigation types (needs decision): 0

## Mapping Code Breakdown
- L: 34
- N: 26

## Mapping Codes Missing In Doc List

- ✅ None

## Mapping Codes Missing In Builtin Templates

- ✅ None

## Unmapped Stage Document Types (Litigation) — Expected Upload-Only

- `DocumentTypes.IDENTITY_PROOF` — `lawclick-next/src/lib/litigation-stages.ts:151`
- `DocumentTypes.JUDGMENT` — `lawclick-next/src/lib/litigation-stages.ts:225`
- `DocumentTypes.JURISDICTION_STATEMENT` — `lawclick-next/src/lib/litigation-stages.ts:157`
- `DocumentTypes.MEDIATION_AGREEMENT` — `lawclick-next/src/lib/litigation-stages.ts:227`
- `DocumentTypes.RULING` — `lawclick-next/src/lib/litigation-stages.ts:226`

## Unmapped Stage Document Types (Litigation) — Needs Decision / Mapping

- ✅ None

## Unmapped Stage Document Types (Non-Litigation) — Expected Upload-Only

- `NonLitigationDocumentTypes.FUNDS_TRANSFER` — `lawclick-next/src/lib/non-litigation-stages.ts:162`
- `NonLitigationDocumentTypes.REGISTRATION_DOCS` — `lawclick-next/src/lib/non-litigation-stages.ts:160`

## Unmapped Stage Document Types (Non-Litigation) — Needs Decision / Mapping

- ✅ None

## Mapped-But-Unused Types (Litigation)

- ✅ None

## Mapped-But-Unused Types (Non-Litigation)

- ✅ None

## Duplicate Template Codes

- `L-16`: `DocumentTypes.ONLINE_FILING_RECEIPT`, `DocumentTypes.ONLINE_FILING_SCREENSHOT`

