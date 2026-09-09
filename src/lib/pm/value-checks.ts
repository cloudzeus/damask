'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { deepseekChat } from '@/lib/deepseek'
import { parseJsonLoose } from '@/lib/ocr/extract'

/**
 * RV-4 — «auto-fill» των αποθηκευμένων τιμών του πελάτη (TrdrFinancialValue) στην
 * αξιολόγηση ένταξης: για κάθε αριθμητικό κριτήριο του προγράμματος, φέρνει την
 * αντίστοιχη τιμή του πελάτη + ✓/✗. Ξεκινά απλά: ΕΜΕ (fieldKey «eme») vs
 * Program.minEmployeesFte (ελάχιστες ΕΜΕ). Επεκτείνεται με νέα ζεύγη αργότερα.
 */

export type ValueOption = { year: number; value: number | null }

export type ValueCheck = {
  key: string
  label: string
  requirement: number | null
  requirementLabel: string
  /** Όλες οι καταχωρημένες τιμές του πελάτη (ανά έτος) — ο διαχειριστής ΕΠΙΛΕΓΕΙ
   * ποια θα συγκρίνει. Σκόπιμα ΧΩΡΙΣ αυτόματη επιλογή (ευαίσθητο κομμάτι). */
  options: ValueOption[]
  /** Αποθηκευμένη ΧΕΙΡΟΚΙΝΗΤΗ επιλογή του διαχειριστή (RV-4 persistence). */
  selectedYear: number | null
}

/** Ζεύγη «fieldKey τιμής → αριθμητικό κριτήριο προγράμματος». */
const PAIRS: { key: string; label: string; fieldKeys: string[]; programField: 'minEmployeesFte'; requirementLabel: string }[] = [
  { key: 'eme', label: 'Ετήσιες Μονάδες Εργασίας (ΕΜΕ)', fieldKeys: ['eme'], programField: 'minEmployeesFte', requirementLabel: 'ελάχιστες ΕΜΕ' },
]

export async function getApplicationValueChecks(trdrId: string, programId: string, applicationId?: string): Promise<ValueCheck[]> {
  await requirePermission('customer.view')
  const program = await prisma.program.findUnique({ where: { id: programId }, select: { minEmployeesFte: true } })
  if (!program) return []

  const allFieldKeys = [...new Set(PAIRS.flatMap(p => p.fieldKeys))]
  const values = await prisma.trdrFinancialValue.findMany({
    where: { trdrId, fieldKey: { in: allFieldKeys } },
    orderBy: { year: 'desc' },
    select: { fieldKey: true, value: true, year: true },
  })
  // Αποθηκευμένες χειροκίνητες επιλογές (RV-4 persistence) ανά fieldKey.
  const selectedByKey = new Map<string, number>()
  if (applicationId) {
    const saved = await prisma.applicationValueCheck.findMany({ where: { applicationId }, select: { fieldKey: true, selectedYear: true } })
    for (const s of saved) { if (s.selectedYear != null) selectedByKey.set(s.fieldKey, s.selectedYear) }
  }
  // Όλες οι τιμές ανά fieldKey (ανά έτος) — προς επιλογή από τον διαχειριστή.
  const byKey = new Map<string, ValueOption[]>()
  for (const v of values) {
    const arr = byKey.get(v.fieldKey) ?? []
    arr.push({ year: v.year, value: v.value == null ? null : Number(v.value) })
    byKey.set(v.fieldKey, arr)
  }

  const out: ValueCheck[] = []
  for (const p of PAIRS) {
    const requirement = program[p.programField] == null ? null : Number(program[p.programField])
    const options: ValueOption[] = []
    for (const fk of p.fieldKeys) { const arr = byKey.get(fk); if (arr) options.push(...arr) }
    options.sort((a, b) => b.year - a.year)
    // Δείξε μόνο αν υπάρχει κριτήριο Ή έστω μία τιμή.
    if (requirement == null && options.length === 0) continue
    // Η επιλογή αποθηκεύεται ανά key (πρώτο fieldKey του ζεύγους).
    const selectedYear = p.fieldKeys.map(fk => selectedByKey.get(fk)).find(y => y != null) ?? null
    out.push({ key: p.key, label: p.label, requirement, requirementLabel: p.requirementLabel, options, selectedYear })
  }
  return out
}

/** RV-4 persistence — αποθήκευση της ΧΕΙΡΟΚΙΝΗΤΗΣ επιλογής τιμής του διαχειριστή
 * (ποιο έτος/τιμή επέλεξε να ελέγξει). Δεν αποφασίζει επιλεξιμότητα το σύστημα. */
export async function saveApplicationValueCheck(
  applicationId: string,
  fieldKey: string,
  input: { year: number | null; value: number | null },
): Promise<{ ok: boolean }> {
  await requirePermission('customer.edit')
  const data = { selectedYear: input.year, selectedValue: input.value }
  await prisma.applicationValueCheck.upsert({
    where: { applicationId_fieldKey: { applicationId, fieldKey } },
    create: { applicationId, fieldKey, ...data },
    update: data,
  })
  return { ok: true }
}

// ── #4: AI ΕΝΔΕΙΚΤΙΚΕΣ παρατηρήσεις επιλεξιμότητας πελάτη ──────────────────────
// ΠΟΛΥ ευαίσθητο: το AI ΔΕΝ αποφασίζει επιλεξιμότητα. Δίνει μόνο παρατηρήσεις/
// σημεία προσοχής προς έλεγχο από τον διαχειριστή (ο άνθρωπος αποφασίζει).

export type EligibilityObservations = { observations: string[] }

export async function assessClientEligibility(trdrId: string, programId: string, applicationId: string): Promise<{ ok: true; result: EligibilityObservations } | { ok: false; message: string }> {
  await requirePermission('customer.view')
  const program = await prisma.program.findUnique({ where: { id: programId }, select: { title: true, eligibilityNote: true } })
  if (!program) return { ok: false, message: 'Δεν βρέθηκε το πρόγραμμα.' }
  const checks = await getApplicationValueChecks(trdrId, programId, applicationId)
  const app = await prisma.programApplication.findUnique({ where: { id: applicationId }, select: { eligibilitySnapshot: true } })

  const checkLines = checks.map(c => {
    const picked = c.selectedYear != null ? c.options.find(o => o.year === c.selectedYear) : null
    const val = picked?.value ?? null
    return `- ${c.label}: επιλεγμένη τιμή ${val != null ? val : '(δεν έχει επιλεγεί)'}${c.requirement != null ? ` / απαιτούμενο ≥ ${c.requirement}` : ''}`
  }).join('\n')

  const facts = [
    `Πρόγραμμα: ${program.title}`,
    program.eligibilityNote ? `Όροι επιλεξιμότητας: ${program.eligibilityNote}` : null,
    checkLines ? `Τιμές που επέλεξε ο διαχειριστής να ελέγξει:\n${checkLines}` : 'Δεν υπάρχουν αριθμητικά κριτήρια προς έλεγχο.',
    app?.eligibilitySnapshot ? `Στοιχεία ένταξης (snapshot): ${JSON.stringify(app.eligibilitySnapshot).slice(0, 800)}` : null,
  ].filter(Boolean).join('\n')

  const messages = [
    { role: 'system' as const, content: 'Είσαι βοηθός συμβούλου ΕΣΠΑ. Δώσε ΜΟΝΟ ΕΝΔΕΙΚΤΙΚΕΣ παρατηρήσεις για να βοηθήσεις τον διαχειριστή να ελέγξει την επιλεξιμότητα ενός πελάτη. ΠΟΛΥ ΣΗΜΑΝΤΙΚΟ: ΔΕΝ αποφασίζεις εσύ αν είναι επιλέξιμος — ο άνθρωπος αποφασίζει. Επισήμανε σημεία προσοχής, πιθανά ρίσκα, τι πρέπει να ελεγχθεί/τεκμηριωθεί, τυχόν αποκλίσεις από τα κριτήρια. Απάντησε ΑΥΣΤΗΡΑ σε JSON: {"observations":["σύντομες παρατηρήσεις στα ελληνικά, ενδεικτικές, χωρίς τελική ετυμηγορία επιλεξιμότητας"]}.' },
    { role: 'user' as const, content: facts },
  ]
  try {
    const text = await deepseekChat(messages, { model: 'deepseek-chat', maxTokens: 600, scope: 'OTHER', refType: 'client-eligibility', refId: applicationId })
    const p = parseJsonLoose(text) as { observations?: unknown } | null
    const observations = Array.isArray(p?.observations) ? p.observations.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map(x => x.trim()) : []
    return { ok: true, result: { observations: observations.length ? observations : ['Δεν προέκυψαν παρατηρήσεις — έλεγξε χειροκίνητα.'] } }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Η ανάλυση απέτυχε.' }
  }
}
