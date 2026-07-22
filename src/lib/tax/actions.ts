'use server'

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { revalidatePath } from 'next/cache'
import { prepareFieldWrites } from '@/lib/tax/field-prep'
import { extractFields, scanTable, type SeriesPoint } from '@/lib/tax/tax-extract'
import { coerceFinancialValue } from '@/lib/tax/greek-format'
import type { TemplateField, RegionHint } from '@/lib/tax/template'
import { buildOcrCostViewForSession } from '@/lib/ingestion/ocr-cost'
import { prepareValueWrites, type GridEntry } from '@/lib/tax/value-prep'

/**
 * Server orchestration για την authoring πλευρά των Tax Form Templates:
 * list/create/update/delete templates + upload του κενού δείγματος (sample)
 * στο ιδιωτικό BunnyCDN. Κάθε exported action ΞΕΚΙΝΑΕΙ με requirePermission
 * (ΠΟΤΕ render-time gating). `listReadyTemplates` πυλωρείται με `taxform.scan`
 * (χαμηλότερο δικαίωμα) — προορίζεται για το dialog σάρωσης πελάτη.
 */

export type TemplateListItem = {
  id: string
  code: string
  name: string
  year: number | null
  description: string | null
  status: string
  fieldCount: number
}

export async function listTemplates(): Promise<TemplateListItem[]> {
  await requirePermission('taxform.manage')
  const rows = await prisma.taxFormTemplate.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { fields: true } } },
  })
  return rows.map(r => ({
    id: r.id,
    code: r.code,
    name: r.name,
    year: r.year,
    description: r.description,
    status: r.status,
    fieldCount: r._count.fields,
  }))
}

export async function listReadyTemplates(): Promise<{ id: string; code: string; name: string; year: number | null }[]> {
  await requirePermission('taxform.scan')
  const rows = await prisma.taxFormTemplate.findMany({
    where: { status: 'READY' },
    orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true, year: true },
  })
  return rows
}

export type TrdrFormRecordItem = {
  id: string
  name: string
  usage: string | null
  templateId: string
  templateName: string
  year: number
  status: string
  createdAt: string
}

export type TrdrFinancialValueItem = {
  fieldKey: string
  year: number
  value: number | null
  valueText: string | null
  kind: string
  valueType: string
}

/**
 * Το «Φορολογικά» tab μιας καρτέλας συναλλασσόμενου (Task 15): τα
 * TrdrFormRecord (ιστορικό σαρώσεων) + τα τρέχοντα TrdrFinancialValue
 * (fieldKey × year matrix) του trdr. Ίδιο δικαίωμα με scanForm/
 * saveFinancialValues (`taxform.scan`) — όποιος βλέπει τα δεδομένα μπορεί και
 * να σαρώσει νέο έντυπο.
 */
export async function listTrdrFinancials(trdrId: string): Promise<{
  records: TrdrFormRecordItem[]
  values: TrdrFinancialValueItem[]
}> {
  await requirePermission('taxform.scan')
  const [records, values] = await Promise.all([
    prisma.trdrFormRecord.findMany({
      where: { trdrId },
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
      include: { template: { select: { name: true } } },
    }),
    prisma.trdrFinancialValue.findMany({
      where: { trdrId },
      orderBy: [{ fieldKey: 'asc' }, { year: 'desc' }],
    }),
  ])
  return {
    records: records.map(r => ({
      id: r.id,
      name: r.name,
      usage: r.usage,
      templateId: r.templateId,
      templateName: r.template.name,
      year: r.year,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
    values: values.map(v => ({
      fieldKey: v.fieldKey,
      year: v.year,
      value: v.value != null ? Number(v.value) : null,
      valueText: v.valueText,
      kind: v.kind,
      valueType: v.valueType,
    })),
  }
}

/**
 * Τα χαρτογραφημένα πεδία ενός ΕΤΟΙΜΟΥ template — καταναλώνεται από το
 * scan-form-dialog.tsx (Task 14) για να χτίσει τα per-field crops πριν
 * καλέσει scanForm. Ίδιο δικαίωμα με scanForm/listReadyTemplates
 * (`taxform.scan` — χαμηλότερο από `taxform.manage`, ο σαρωτής πελάτη δεν
 * χρειάζεται δικαίωμα επεξεργασίας οδηγών).
 */
export async function getTemplateFields(templateId: string): Promise<TemplateField[]> {
  await requirePermission('taxform.scan')
  const rows = await prisma.taxFormTemplateField.findMany({
    where: { templateId },
    orderBy: { order: 'asc' },
  })
  return rows.map(r => ({
    id: r.id,
    fieldKey: r.fieldKey,
    label: r.label,
    section: r.section,
    valueType: r.valueType,
    kind: r.kind,
    config: r.config as unknown as TemplateField['config'],
    regionHint: r.regionHint as unknown as RegionHint | null,
    aiHint: r.aiHint,
    required: r.required,
    order: r.order,
  }))
}

export async function createTemplate(input: { code: string; name: string; year?: number | null; description?: string | null }): Promise<{ id: string }> {
  const session = await requirePermission('taxform.manage')
  const t = await prisma.taxFormTemplate.create({
    data: {
      code: input.code.trim(),
      name: input.name.trim(),
      year: input.year ?? null,
      description: input.description?.trim() || null,
      status: 'DRAFT',
      createdById: session.user.id,
    },
  })
  revalidatePath('/tax-templates')
  return { id: t.id }
}

export async function updateTemplateMeta(
  id: string,
  input: { name?: string; year?: number | null; description?: string | null; status?: 'DRAFT' | 'READY' },
): Promise<void> {
  await requirePermission('taxform.manage')
  await prisma.taxFormTemplate.update({
    where: { id },
    data: {
      ...(input.name != null ? { name: input.name.trim() } : {}),
      ...(input.year !== undefined ? { year: input.year } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
  })
  revalidatePath(`/tax-templates/${id}`)
}

export async function deleteTemplate(id: string): Promise<void> {
  await requirePermission('taxform.manage')
  await prisma.taxFormTemplate.delete({ where: { id } })
  revalidatePath('/tax-templates')
}

export async function uploadSample(
  templateId: string,
  input: { base64: string; mimeType: string; ext: string; pageCount: number; thumbUrl?: string | null },
): Promise<{ storageKey: string }> {
  await requirePermission('taxform.manage')
  const key = `tax-templates/${templateId}/sample.${input.ext}`
  await bunnyUploadPrivate({ key, body: Buffer.from(input.base64, 'base64'), contentType: input.mimeType })
  await prisma.taxFormTemplate.update({
    where: { id: templateId },
    data: { sampleStorageKey: key, samplePageCount: input.pageCount, sampleThumbUrl: input.thumbUrl ?? null },
  })
  revalidatePath(`/tax-templates/${templateId}`)
  return { storageKey: key }
}

/**
 * Αντικαθιστά ΟΛΑ τα fields ενός template — delete-all + recreate σε
 * transaction (ο editor στέλνει πάντα το πλήρες, τελικό σετ). `order`
 * σταθεροποιείται από prepareFieldWrites (θέση στο array).
 */
export async function saveFields(templateId: string, fields: unknown[]): Promise<void> {
  await requirePermission('taxform.manage')
  const writes = prepareFieldWrites(fields as Partial<TemplateField>[])
  await prisma.$transaction([
    prisma.taxFormTemplateField.deleteMany({ where: { templateId } }),
    ...writes.map(w => prisma.taxFormTemplateField.create({
      data: {
        templateId,
        fieldKey: w.fieldKey,
        label: w.label,
        section: w.section,
        valueType: w.valueType,
        kind: w.kind,
        config: w.config != null ? (w.config as Prisma.InputJsonValue) : undefined,
        regionHint: w.regionHint != null ? (w.regionHint as Prisma.InputJsonValue) : undefined,
        aiHint: w.aiHint,
        required: w.required,
        order: w.order,
      },
    })),
  ])
  revalidatePath(`/tax-templates/${templateId}`)
}

/**
 * OCR-άρει μία ήδη-cropped περιοχή εικόνας πάνω σε ένα υποψήφιο field, ώστε
 * ο author να επιβεβαιώσει ότι η περιοχή διαβάζεται σωστά πριν πάει live.
 * Δεν persist-άρει τίποτα — μόνο extractFields + coerceFinancialValue.
 */
export async function testField(input: {
  image: { base64: string; mimeType: string }
  label: string
  valueType: 'CURRENCY' | 'NUMBER' | 'PERCENT' | 'INTEGER' | 'DATE' | 'BOOLEAN'
  kind?: 'SINGLE' | 'SERIES'
  aiHint?: string | null
}): Promise<{ raw: string | null; value: number | null; model: string }> {
  await requirePermission('taxform.manage')
  const key = 'test'
  const r = await extractFields([input.image], [{
    fieldKey: key,
    label: input.label,
    valueType: input.valueType,
    kind: input.kind ?? 'SINGLE',
    aiHint: input.aiHint ?? null,
  }])
  const raw = r.values[key] ?? null
  return { raw, value: coerceFinancialValue(raw, input.valueType), model: r.model }
}

/**
 * Σαρώνει ένα ΣΥΜΠΛΗΡΩΜΕΝΟ έντυπο για συγκεκριμένο πελάτη/χρονιά: ανεβάζει το
 * δείγμα στο ιδιωτικό Bunny, OCR-άρει ΚΑΘΕ ήδη-cropped πεδίο ξεχωριστά (ένα
 * geminiGenerate call ανά field-region — ίδιο idiom με testField, πολλαπλές
 * μικρές εικόνες αντί μία ολόκληρη σελίδα, ώστε το hint της περιοχής να μην
 * χαθεί), κι έπειτα OCR-άρει ΚΑΘΕ TABLE περιοχή (tableImages) μέσω scanTable
 * (γενικό {columns,rows} grid), γράφει ένα TrdrFormRecord με το πλήρες payload
 * (SINGLE/SERIES/TABLE μαζί), και επιστρέφει ένα correction grid (προς
 * επιβεβαίωση από τον χρήστη πριν το saveFinancialValues) μαζί με role-gated
 * κόστος OCR (buildOcrCostViewForSession — SUPER_ADMIN/ADMIN βλέπουν ποσό,
 * μόνο SUPER_ADMIN βλέπει breakdown).
 */
export async function scanForm(input: {
  trdrId: string
  templateId: string
  year: number
  name: string
  usage?: string | null
  sample: { base64: string; mimeType: string; ext: string; pageCount: number }
  fieldImages: {
    fieldKey: string
    label: string
    valueType: 'CURRENCY' | 'NUMBER' | 'PERCENT' | 'INTEGER' | 'DATE' | 'BOOLEAN'
    kind: 'SINGLE' | 'SERIES'
    aiHint?: string | null
    image: { base64: string; mimeType: string }
  }[]
  tableImages?: {
    fieldKey: string
    label: string
    valueType: 'CURRENCY' | 'NUMBER' | 'PERCENT' | 'INTEGER' | 'DATE' | 'BOOLEAN'
    columns?: string[]
    image: { base64: string; mimeType: string }
  }[]
}) {
  const session = await requirePermission('taxform.scan')
  const recordId = crypto.randomUUID()
  const key = `tax-records/${input.trdrId}/${recordId}.${input.sample.ext}`
  await bunnyUploadPrivate({ key, body: Buffer.from(input.sample.base64, 'base64'), contentType: input.sample.mimeType })

  const grid: { fieldKey: string; label: string; raw: string | null; value: number | null; valueType: string; kind: string; confidence: number | null; series?: SeriesPoint[]; json?: { columns: string[]; rows: { label: string; values: string[] }[] } }[] = []
  let model = ''
  let tokens = 0
  const payload: Record<string, unknown> = {}
  for (const fi of input.fieldImages) {
    const r = await extractFields(
      [fi.image],
      [{ fieldKey: fi.fieldKey, label: fi.label, valueType: fi.valueType, kind: fi.kind, aiHint: fi.aiHint ?? null }],
      { refId: recordId, userId: session.user.id },
    )
    model = r.model
    tokens += r.tokensUsed ?? 0
    if (fi.kind === 'SERIES') {
      // SERIES holds multi-year data ({year,value}[]) — keep it as an array end
      // to end (payload archival + grid), never squash it through the scalar
      // coerceFinancialValue parser (that used to stringify + garbage-parse it).
      const points = r.series[fi.fieldKey] ?? []
      payload[fi.fieldKey] = points
      grid.push({ fieldKey: fi.fieldKey, label: fi.label, raw: null, value: null, valueType: fi.valueType, kind: fi.kind, confidence: null, series: points })
    } else {
      const raw = r.values[fi.fieldKey] ?? null
      payload[fi.fieldKey] = raw
      grid.push({ fieldKey: fi.fieldKey, label: fi.label, raw, value: coerceFinancialValue(raw, fi.valueType), valueType: fi.valueType, kind: fi.kind, confidence: null })
    }
  }
  for (const ti of input.tableImages ?? []) {
    const t = await scanTable([ti.image], ti.columns, { refId: recordId, userId: session.user.id })
    model = t.model
    tokens += t.tokensUsed ?? 0
    const json = { columns: t.columns, rows: t.rows }
    payload[ti.fieldKey] = json
    grid.push({ fieldKey: ti.fieldKey, label: ti.label, raw: null, value: null, valueType: ti.valueType, kind: 'TABLE', confidence: null, json })
  }

  const record = await prisma.trdrFormRecord.create({
    data: {
      id: recordId,
      name: input.name.trim(),
      usage: input.usage?.trim() || null,
      trdrId: input.trdrId,
      templateId: input.templateId,
      year: input.year,
      storageKey: key,
      pageCount: input.sample.pageCount,
      status: 'EXTRACTED',
      extractedData: payload as Prisma.InputJsonValue,
      model,
      tokensUsed: tokens,
      createdById: session.user.id,
    },
  })
  const cost = await buildOcrCostViewForSession(session.user.role, model, tokens)
  return { recordId: record.id, grid, cost }
}

/**
 * Upsert-άρει τα (πιθανά διορθωμένα από τον χρήστη) grid entries ως
 * TrdrFinancialValue rows, ένα ανά (trdrId, fieldKey, year) — δες
 * prepareValueWrites (pure) για το mapping raw/json → value/valueText/valueJson
 * ανά valueType. Idempotent: επαναληπτικό saveFinancialValues πάνω στο ίδιο
 * (trdr, field, year) αντικαθιστά την τιμή, δεν διπλασιάζει γραμμές.
 */
export async function saveFinancialValues(input: {
  trdrId: string
  templateId: string
  year: number
  recordId: string
  entries: GridEntry[]
}): Promise<{ saved: number }> {
  await requirePermission('taxform.scan')
  const writes = prepareValueWrites(input)
  await prisma.$transaction(writes.map(w => prisma.trdrFinancialValue.upsert({
    where: { trdrId_fieldKey_year: { trdrId: w.trdrId, fieldKey: w.fieldKey, year: w.year } },
    create: {
      trdrId: w.trdrId,
      fieldKey: w.fieldKey,
      templateId: w.templateId,
      year: w.year,
      kind: w.kind,
      valueType: w.valueType,
      value: w.value ?? undefined,
      valueText: w.valueText ?? undefined,
      valueJson: w.valueJson != null ? (w.valueJson as Prisma.InputJsonValue) : undefined,
      source: 'OCR',
      sourceRecordId: w.sourceRecordId,
      confidence: w.confidence ?? undefined,
    },
    update: {
      value: w.value ?? null,
      valueText: w.valueText ?? null,
      valueJson: w.valueJson != null ? (w.valueJson as Prisma.InputJsonValue) : undefined,
      kind: w.kind,
      valueType: w.valueType,
      source: 'OCR',
      sourceRecordId: w.sourceRecordId,
      confidence: w.confidence ?? null,
    },
  })))
  return { saved: writes.length }
}
