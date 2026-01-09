const fs = require("fs")
const path = require("path")

const PROJECT_ROOT = path.join(__dirname, "..")
const REPO_ROOT = path.join(PROJECT_ROOT, "..")
const OUT_DIR = path.join(REPO_ROOT, "docs", "_artifacts")

const DOC_LIST_PATH = path.join(REPO_ROOT, "docs", "法律文书模板完整清单_2026-01-04.md")
const BUILTIN_TEMPLATES_PATH = path.join(
  PROJECT_ROOT,
  "src",
  "lib",
  "templates",
  "builtin",
  "builtin-document-templates.ts"
)
const STAGE_MAP_PATH = path.join(
  PROJECT_ROOT,
  "src",
  "lib",
  "templates",
  "stage-document-template-map.ts"
)
const LITIGATION_STAGES_PATH = path.join(PROJECT_ROOT, "src", "lib", "litigation-stages.ts")
const NON_LITIGATION_STAGES_PATH = path.join(PROJECT_ROOT, "src", "lib", "non-litigation-stages.ts")

function formatDate(d) {
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8")
}

function uniqSorted(items) {
  return Array.from(new Set(items)).sort()
}

function extractTemplateCodesFromDoc(markdown) {
  const matches = markdown.match(/\b[A-Z]-\d{2}\b/g) || []
  return uniqSorted(matches)
}

function extractTemplateCodesFromBuiltin(source) {
  const codes = new Set()
  for (const line of source.split(/\r?\n/)) {
    const m = /\{\s*code:\s*"([A-Z]-\d{2})"/.exec(line)
    if (m) codes.add(m[1])
  }
  return Array.from(codes).sort()
}

function extractStageDocTypeKeysFromStageConfig(source, namespace) {
  const re = new RegExp(`\\btype\\s*:\\s*${namespace}\\.([A-Z0-9_]+)\\b`, "g")
  const keys = []
  let m
  while ((m = re.exec(source))) keys.push(m[1])
  return uniqSorted(keys)
}

function extractStageDocTemplateMap(source) {
  const re =
    /\[\s*(DocumentTypes|NonLitigationDocumentTypes)\.([A-Z0-9_]+)\s*]\s*:\s*"([A-Z]-\d{2})"\s*,?/g
  const entries = []
  let m
  while ((m = re.exec(source))) {
    entries.push({ namespace: m[1], key: m[2], code: m[3] })
  }
  return entries
}

function diff(a, b) {
  const bSet = new Set(b)
  return a.filter((x) => !bSet.has(x))
}

function intersect(a, b) {
  const bSet = new Set(b)
  return a.filter((x) => bSet.has(x))
}

function groupBy(arr, keyFn) {
  const map = new Map()
  for (const item of arr) {
    const k = keyFn(item)
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(item)
  }
  return map
}

function countByPrefix(codes) {
  const counts = {}
  for (const code of codes) {
    const prefix = String(code).split("-")[0] || "?"
    counts[prefix] = (counts[prefix] || 0) + 1
  }
  return counts
}

// Stage document types that are typically "upload-only" materials and do not have a
// default drafting template in `docs/法律文书模板完整清单_2026-01-04.md`.
// If new stage document types are introduced without mappings, they should be either:
// - added to the mapping (draftable), OR
// - explicitly added here (upload-only), to force a product decision.
const EXPECTED_UPLOAD_ONLY_STAGE_DOC_TYPES = {
  DocumentTypes: new Set([
    "IDENTITY_PROOF", // 身份证明材料
    "JUDGMENT", // 判决书
    "RULING", // 裁定书
    "MEDIATION_AGREEMENT", // 调解书
    "JURISDICTION_STATEMENT", // 管辖权依据说明（通常为材料/条款截图）
  ]),
  NonLitigationDocumentTypes: new Set([
    "REGISTRATION_DOCS", // 工商变更登记材料
    "FUNDS_TRANSFER", // 资金划转证明
  ]),
}

function relPath(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, "/")
}

function findTypeRefs(source, namespace, key, filePath) {
  const needle = `${namespace}.${key}`
  const refs = []
  const lines = source.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) refs.push(`${relPath(filePath)}:${i + 1}`)
  }
  return refs
}

function main() {
  const requiredFiles = [
    DOC_LIST_PATH,
    BUILTIN_TEMPLATES_PATH,
    STAGE_MAP_PATH,
    LITIGATION_STAGES_PATH,
    NON_LITIGATION_STAGES_PATH,
  ]
  for (const p of requiredFiles) {
    if (!fs.existsSync(p)) {
      console.error(`[stage-template-map] missing file: ${p}`)
      process.exitCode = 1
      return
    }
  }

  const docText = readText(DOC_LIST_PATH)
  const docCodes = extractTemplateCodesFromDoc(docText)
  const builtinText = readText(BUILTIN_TEMPLATES_PATH)
  const builtinCodes = extractTemplateCodesFromBuiltin(builtinText)

  const stageMapText = readText(STAGE_MAP_PATH)
  const mapEntries = extractStageDocTemplateMap(stageMapText)

  const litigationStageText = readText(LITIGATION_STAGES_PATH)
  const nonLitigationStageText = readText(NON_LITIGATION_STAGES_PATH)

  const stageLitKeys = extractStageDocTypeKeysFromStageConfig(litigationStageText, "DocumentTypes")
  const stageNonKeys = extractStageDocTypeKeysFromStageConfig(
    nonLitigationStageText,
    "NonLitigationDocumentTypes"
  )

  const mappedLitEntries = mapEntries.filter((e) => e.namespace === "DocumentTypes")
  const mappedNonEntries = mapEntries.filter((e) => e.namespace === "NonLitigationDocumentTypes")
  const mappedLitKeys = uniqSorted(mappedLitEntries.map((e) => e.key))
  const mappedNonKeys = uniqSorted(mappedNonEntries.map((e) => e.key))

  const mappingCodes = uniqSorted(mapEntries.map((e) => e.code))
  const mappingCodesMissingInDoc = diff(mappingCodes, docCodes)
  const mappingCodesMissingInBuiltin = diff(mappingCodes, builtinCodes)

  const unmappedLitStageKeys = diff(stageLitKeys, mappedLitKeys)
  const unmappedNonStageKeys = diff(stageNonKeys, mappedNonKeys)
  const mappedButUnusedLitKeys = diff(mappedLitKeys, stageLitKeys)
  const mappedButUnusedNonKeys = diff(mappedNonKeys, stageNonKeys)

  const expectedUnmappedLitKeys = unmappedLitStageKeys.filter((k) =>
    EXPECTED_UPLOAD_ONLY_STAGE_DOC_TYPES.DocumentTypes.has(k)
  )
  const expectedUnmappedNonKeys = unmappedNonStageKeys.filter((k) =>
    EXPECTED_UPLOAD_ONLY_STAGE_DOC_TYPES.NonLitigationDocumentTypes.has(k)
  )
  const unexpectedUnmappedLitKeys = diff(unmappedLitStageKeys, expectedUnmappedLitKeys)
  const unexpectedUnmappedNonKeys = diff(unmappedNonStageKeys, expectedUnmappedNonKeys)

  const duplicateCodeGroups = groupBy(mapEntries, (e) => e.code)
  const duplicateCodes = Array.from(duplicateCodeGroups.entries())
    .filter(([, list]) => list.length > 1)
    .map(([code, list]) => ({ code, keys: list.map((x) => `${x.namespace}.${x.key}`).sort() }))
    .sort((a, b) => a.code.localeCompare(b.code))

  const usedMappedLitKeys = intersect(stageLitKeys, mappedLitKeys)
  const usedMappedNonKeys = intersect(stageNonKeys, mappedNonKeys)

  const date = formatDate(new Date())
  const outPath = path.join(OUT_DIR, `stage_document_template_map_audit_${date}.md`)

  const lines = []
  lines.push(`# Stage Document → Template Map Audit (${date})`)
  lines.push("")
  lines.push("> 目的：校验“阶段文书(Document.documentType) ↔ 默认模板码(DocumentTemplate.code)”映射的完备性，避免出现：阶段清单里有文书，但无法一键从默认模板起草。")
  lines.push("> 说明：未映射的文书类型并不一定是缺陷（可能是需上传的法院文书/材料），但需要人工确认。")
  lines.push("")

  lines.push("## Summary")
  lines.push(`- doc list codes: ${docCodes.length}`)
  lines.push(`- builtin template codes: ${builtinCodes.length}`)
  lines.push(`- mapping entries: ${mapEntries.length}`)
  lines.push(`- mapping codes: ${mappingCodes.length}`)
  lines.push(`- mapping codes missing in doc list: ${mappingCodesMissingInDoc.length}`)
  lines.push(`- mapping codes missing in builtin: ${mappingCodesMissingInBuiltin.length}`)
  lines.push(`- litigation stage doc types: ${stageLitKeys.length}`)
  lines.push(`- non-litigation stage doc types: ${stageNonKeys.length}`)
  lines.push(`- litigation mapped types used by stages: ${usedMappedLitKeys.length}`)
  lines.push(`- non-litigation mapped types used by stages: ${usedMappedNonKeys.length}`)
  lines.push(`- unmapped litigation types (expected upload-only): ${expectedUnmappedLitKeys.length}`)
  lines.push(`- unmapped litigation types (needs decision): ${unexpectedUnmappedLitKeys.length}`)
  lines.push(`- unmapped non-litigation types (expected upload-only): ${expectedUnmappedNonKeys.length}`)
  lines.push(`- unmapped non-litigation types (needs decision): ${unexpectedUnmappedNonKeys.length}`)
  lines.push("")

  lines.push("## Mapping Code Breakdown")
  const mappingCounts = countByPrefix(mappingCodes)
  const mappingPrefixes = Object.keys(mappingCounts).sort()
  for (const p of mappingPrefixes) lines.push(`- ${p}: ${mappingCounts[p]}`)
  lines.push("")

  lines.push("## Mapping Codes Missing In Doc List")
  if (mappingCodesMissingInDoc.length === 0) {
    lines.push("")
    lines.push("- ✅ None")
  } else {
    lines.push("")
    for (const code of mappingCodesMissingInDoc) lines.push(`- \`${code}\``)
  }
  lines.push("")

  lines.push("## Mapping Codes Missing In Builtin Templates")
  if (mappingCodesMissingInBuiltin.length === 0) {
    lines.push("")
    lines.push("- ✅ None")
  } else {
    lines.push("")
    for (const code of mappingCodesMissingInBuiltin) lines.push(`- \`${code}\``)
  }
  lines.push("")

  lines.push("## Unmapped Stage Document Types (Litigation) — Expected Upload-Only")
  if (expectedUnmappedLitKeys.length === 0) {
    lines.push("")
    lines.push("- ✅ None")
  } else {
    lines.push("")
    for (const key of expectedUnmappedLitKeys) {
      const refs = findTypeRefs(litigationStageText, "DocumentTypes", key, LITIGATION_STAGES_PATH)
      lines.push(`- \`DocumentTypes.${key}\`${refs.length ? ` — ${refs.map((r) => `\`${r}\``).join(", ")}` : ""}`)
    }
  }
  lines.push("")

  lines.push("## Unmapped Stage Document Types (Litigation) — Needs Decision / Mapping")
  if (unexpectedUnmappedLitKeys.length === 0) {
    lines.push("")
    lines.push("- ✅ None")
  } else {
    lines.push("")
    for (const key of unexpectedUnmappedLitKeys) {
      const refs = findTypeRefs(litigationStageText, "DocumentTypes", key, LITIGATION_STAGES_PATH)
      lines.push(`- \`DocumentTypes.${key}\`${refs.length ? ` — ${refs.map((r) => `\`${r}\``).join(", ")}` : ""}`)
    }
  }
  lines.push("")

  lines.push("## Unmapped Stage Document Types (Non-Litigation) — Expected Upload-Only")
  if (expectedUnmappedNonKeys.length === 0) {
    lines.push("")
    lines.push("- ✅ None")
  } else {
    lines.push("")
    for (const key of expectedUnmappedNonKeys) {
      const refs = findTypeRefs(
        nonLitigationStageText,
        "NonLitigationDocumentTypes",
        key,
        NON_LITIGATION_STAGES_PATH
      )
      lines.push(
        `- \`NonLitigationDocumentTypes.${key}\`${refs.length ? ` — ${refs.map((r) => `\`${r}\``).join(", ")}` : ""}`
      )
    }
  }
  lines.push("")

  lines.push("## Unmapped Stage Document Types (Non-Litigation) — Needs Decision / Mapping")
  if (unexpectedUnmappedNonKeys.length === 0) {
    lines.push("")
    lines.push("- ✅ None")
  } else {
    lines.push("")
    for (const key of unexpectedUnmappedNonKeys) {
      const refs = findTypeRefs(
        nonLitigationStageText,
        "NonLitigationDocumentTypes",
        key,
        NON_LITIGATION_STAGES_PATH
      )
      lines.push(
        `- \`NonLitigationDocumentTypes.${key}\`${refs.length ? ` — ${refs.map((r) => `\`${r}\``).join(", ")}` : ""}`
      )
    }
  }
  lines.push("")

  lines.push("## Mapped-But-Unused Types (Litigation)")
  if (mappedButUnusedLitKeys.length === 0) {
    lines.push("")
    lines.push("- ✅ None")
  } else {
    lines.push("")
    for (const key of mappedButUnusedLitKeys) lines.push(`- \`DocumentTypes.${key}\``)
  }
  lines.push("")

  lines.push("## Mapped-But-Unused Types (Non-Litigation)")
  if (mappedButUnusedNonKeys.length === 0) {
    lines.push("")
    lines.push("- ✅ None")
  } else {
    lines.push("")
    for (const key of mappedButUnusedNonKeys) lines.push(`- \`NonLitigationDocumentTypes.${key}\``)
  }
  lines.push("")

  lines.push("## Duplicate Template Codes")
  if (duplicateCodes.length === 0) {
    lines.push("")
    lines.push("- ✅ None")
  } else {
    lines.push("")
    for (const item of duplicateCodes) {
      lines.push(`- \`${item.code}\`: ${item.keys.map((k) => `\`${k}\``).join(", ")}`)
    }
  }
  lines.push("")

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8")

  console.log(`[stage-template-map] mapping entries: ${mapEntries.length}`)
  console.log(
    `[stage-template-map] unmapped litigation stage types: ${unmappedLitStageKeys.length} (expected: ${expectedUnmappedLitKeys.length}, needs decision: ${unexpectedUnmappedLitKeys.length})`
  )
  console.log(
    `[stage-template-map] unmapped non-litigation stage types: ${unmappedNonStageKeys.length} (expected: ${expectedUnmappedNonKeys.length}, needs decision: ${unexpectedUnmappedNonKeys.length})`
  )
  console.log(`[stage-template-map] wrote: ${relPath(outPath)}`)

  if (
    mappingCodesMissingInDoc.length ||
    mappingCodesMissingInBuiltin.length ||
    unexpectedUnmappedLitKeys.length ||
    unexpectedUnmappedNonKeys.length
  ) {
    process.exitCode = 1
  }
}

main()
