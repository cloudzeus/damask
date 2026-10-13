'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { deepseekChat } from '@/lib/deepseek'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { logActivity } from '@/lib/activity/log'

/**
 * «Έλεγχος μνήμης»: η μνήμη είναι τόσο καλή όσο οι συνδέσεις της. Το AI ελέγχει (α) απαιτήσεις προγραμμάτων που
 * είναι συνδεδεμένες με λάθος τύπο ή καθόλου, και (β) διπλότυπους τύπους εγγράφων (ίδιο έγγραφο με άλλο όνομα).
 * Ο χρήστης διορθώνει με ένα κλικ: σύνδεση με τον σωστό τύπο / συγχώνευση τύπων (μεταφέρονται τα πάντα).
 */

export type LinkIssue = { formId: string; formName: string; programTitle: string; currentType: string | null; suggestedTypeId: string; suggestedType: string; reason: string }
export type DuplicateGroup = { keepId: string; keepName: string; merge: { id: string; name: string; docs: number; forms: number }[]; reason: string }
export type MemoryHealth = { links: LinkIssue[]; duplicates: DuplicateGroup[] }

export async function checkMemoryHealth(): Promise<{ ok: true; health: MemoryHealth } | { ok: false; message: string }> {
  const session = await requirePermission('customer.view')
  const [types, forms] = await Promise.all([
    prisma.documentType.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, notes: true, _count: { select: { dossierDocs: true, requiredForms: true } } } }),
    prisma.programRequiredForm.findMany({ select: { id: true, name: true, notes: true, documentTypeId: true, program: { select: { title: true } } } }),
  ])
  const fold = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zα-ω0-9]+/g, ' ').trim()
  const typeByName = new Map(types.map(t => [fold(t.name), t]))
  const formByName = new Map(forms.map(f => [fold(f.name), f]))
  const typeList = types.map(t => `- ${t.name}${t.notes ? ` (σημ.: ${t.notes.slice(0, 100)})` : ''}`).join('\n')
  const formList = forms.map(f => `- «${f.name}» [πρόγραμμα: ${f.program.title}] → τύπος: ${types.find(t => t.id === f.documentTypeId)?.name ?? 'κανένας'}`).join('\n')
  try {
    const text = await deepseekChat([
      { role: 'system', content: [
        'Είσαι ειδικός σε δικαιολογητικά ΕΣΠΑ. Ελέγχεις τον κατάλογο τύπων εγγράφων ενός γραφείου και πώς είναι συνδεδεμένες οι απαιτήσεις των προγραμμάτων.',
        `Τύποι:\n${typeList}`,
        `Απαιτήσεις προγραμμάτων → τρέχων τύπος:\n${formList}`,
        '(α) links: απαιτήσεις συνδεδεμένες με ΠΡΟΦΑΝΩΣ ΛΑΘΟΣ τύπο (ή κανέναν) ενώ υπάρχει κατάλληλος στον κατάλογο. Μόνο βέβαιες περιπτώσεις.',
        '(β) duplicates: τύποι που είναι ΑΚΡΙΒΩΣ ΤΟ ΙΔΙΟ έγγραφο με άλλο όνομα. Ποτέ διαφορετικά έγγραφα (ενημερότητα ≠ ΥΔ, ισολογισμός ≠ ΥΔ λογιστή, σύμβαση ≠ ενημερότητα). Αν δεν είσαι βέβαιος, ΜΗΝ το βάζεις.',
        'Γράψε τα ονόματα ΑΚΡΙΒΩΣ όπως στις λίστες (αντιγραφή). ΑΥΣΤΗΡΑ JSON: {"links":[{"form":"όνομα απαίτησης","type":"όνομα τύπου","reason":"σύντομα"}],"duplicates":[{"keep":"όνομα τύπου","merge":["όνομα τύπου"],"reason":"σύντομα"}]}',
      ].join('\n\n') },
      { role: 'user', content: 'Έλεγξε.' },
    ], { model: 'deepseek-chat', maxTokens: 1500, temperature: 0, scope: 'OTHER', refType: 'memory-health', userId: session.user.id })
    const p = (parseJsonLoose(text) ?? {}) as { links?: { form?: unknown; type?: unknown; reason?: unknown }[]; duplicates?: { keep?: unknown; merge?: unknown; reason?: unknown }[] }
    const T = (n: unknown) => (typeof n === 'string' ? typeByName.get(fold(n)) : undefined)
    const links: LinkIssue[] = []
    for (const l of p.links ?? []) {
      const f = typeof l.form === 'string' ? formByName.get(fold(l.form)) : undefined
      const t = T(l.type)
      if (!f || !t || f.documentTypeId === t.id) continue
      links.push({ formId: f.id, formName: f.name, programTitle: f.program.title, currentType: types.find(x => x.id === f.documentTypeId)?.name ?? null, suggestedTypeId: t.id, suggestedType: t.name, reason: String(l.reason ?? '').slice(0, 200) })
    }
    // Διπλότυποι: δεύτερος, ανεξάρτητος έλεγχος με σημασιολογική ομοιότητα ονομάτων — μια λάθος συγχώνευση χαλάει δεδομένα.
    const cand: { keep: (typeof types)[number]; merge: (typeof types)[number][]; reason: string }[] = []
    for (const d of p.duplicates ?? []) {
      const keep = T(d.keep)
      const merge = (Array.isArray(d.merge) ? d.merge : []).map(T).filter((t): t is (typeof types)[number] => !!t && t.id !== keep?.id)
      if (keep && merge.length) cand.push({ keep, merge, reason: String(d.reason ?? '').slice(0, 200) })
    }
    const duplicates: DuplicateGroup[] = []
    if (cand.length) {
      const { geminiEmbed } = await import('@/lib/gemini')
      const names = [...new Set(cand.flatMap(c => [c.keep, ...c.merge]).map(t => t.name))]
      const vecs = await geminiEmbed(names, { task: 'RETRIEVAL_DOCUMENT', refType: 'memory-health', userId: session.user.id })
      const vec = new Map(names.map((n, i) => [n, vecs[i]]))
      const cos = (a: number[], b: number[]) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i] } return d / Math.sqrt(x * y) }
      for (const c of cand) {
        const ok = c.merge.filter(m => cos(vec.get(c.keep.name)!, vec.get(m.name)!) >= 0.85)
        if (ok.length) duplicates.push({ keepId: c.keep.id, keepName: c.keep.name, merge: ok.map(m => ({ id: m.id, name: m.name, docs: m._count.dossierDocs, forms: m._count.requiredForms })), reason: c.reason })
      }
    }
    return { ok: true, health: { links, duplicates } }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Ο έλεγχος απέτυχε.' }
  }
}

/** Σύνδεση απαίτησης προγράμματος με τον σωστό τύπο (ξαναελέγχονται οι υποχρεώσεις των έργων του προγράμματος). */
export async function relinkRequirement(formId: string, typeId: string): Promise<{ ok: boolean; message?: string }> {
  const session = await requirePermission('programs.manage')
  const form = await prisma.programRequiredForm.update({ where: { id: formId }, data: { documentTypeId: typeId }, select: { programId: true, name: true } })
  const { syncSeriesForForm } = await import('@/lib/pm/form-obligations')
  await syncSeriesForForm(formId).catch(() => {})
  await logActivity('memory.relink', { entityType: 'program', entityId: form.programId, userId: session.user.id, meta: { formId, typeId } })
  revalidatePath(`/programs/${form.programId}`)
  return { ok: true }
}

/** Συγχώνευση τύπων: ΟΛΑ τα συνδεδεμένα (δικαιολογητικά, απαιτήσεις, Οδηγοί, παραδείγματα, έγγραφα έργων, αιτήματα) → keep· οι άλλοι απενεργοποιούνται. */
export async function mergeDocumentTypes(keepId: string, mergeIds: string[]): Promise<{ ok: boolean; message: string }> {
  const session = await requirePermission('doctype.manage')
  // Τύποι με ειδικό αναγνώστη (Ε3/ΕΜΕ/Δήλωση ΜΜΕ) εντοπίζονται με το όνομά τους — αν συμμετέχουν, κρατιούνται αυτοί.
  const [{ MME_DOC_TYPE_NAME }, { E3_DOC_TYPE_NAME }, { EME_DOC_TYPE_NAME }] = await Promise.all([import('@/lib/tax/mme'), import('@/lib/tax/e3'), import('@/lib/tax/eme')])
  const system = await prisma.documentType.findFirst({ where: { id: { in: [keepId, ...mergeIds] }, name: { in: [MME_DOC_TYPE_NAME, E3_DOC_TYPE_NAME, EME_DOC_TYPE_NAME] } }, select: { id: true } })
  if (system && system.id !== keepId) { mergeIds = [keepId, ...mergeIds]; keepId = system.id }
  const ids = mergeIds.filter(id => id !== keepId)
  if (!ids.length) return { ok: false, message: 'Τίποτα για συγχώνευση.' }
  const keep = await prisma.documentType.findUnique({ where: { id: keepId }, select: { name: true, seriesKind: true, expires: true } })
  if (!keep) return { ok: false, message: 'Ο τύπος δεν βρέθηκε.' }
  const others = await prisma.documentType.findMany({ where: { id: { in: ids } }, select: { name: true, seriesKind: true, expires: true } })
  const res = await prisma.$transaction([
    prisma.trdrDossierDocument.updateMany({ where: { documentTypeId: { in: ids } }, data: { documentTypeId: keepId } }),
    prisma.programRequiredForm.updateMany({ where: { documentTypeId: { in: ids } }, data: { documentTypeId: keepId } }),
    prisma.taxFormTemplate.updateMany({ where: { documentTypeId: { in: ids } }, data: { documentTypeId: keepId } }),
    prisma.documentClassificationExample.updateMany({ where: { documentTypeId: { in: ids } }, data: { documentTypeId: keepId } }),
    prisma.documentClassificationExample.updateMany({ where: { predictedTypeId: { in: ids } }, data: { predictedTypeId: keepId } }),
    prisma.applicationDocument.updateMany({ where: { documentTypeId: { in: ids } }, data: { documentTypeId: keepId } }),
    prisma.fileRequestItem.updateMany({ where: { documentTypeId: { in: ids } }, data: { documentTypeId: keepId } }),
    prisma.documentType.updateMany({ where: { id: { in: ids } }, data: { active: false } }),
    // Ο ενιαίος τύπος κρατά τις ιδιότητες «σειρά»/«λήγει» αν τις είχε οποιοσδήποτε.
    prisma.documentType.update({ where: { id: keepId }, data: { seriesKind: keep.seriesKind ?? others.find(o => o.seriesKind)?.seriesKind ?? null, expires: keep.expires || others.some(o => o.expires) } }),
  ])
  await logActivity('memory.merge_types', { entityType: 'documentType', entityId: keepId, userId: session.user.id, meta: { merged: others.map(o => o.name) } })
  revalidatePath('/document-types')
  revalidatePath('/memory')
  return { ok: true, message: `Συγχωνεύτηκαν στο «${keep.name}»: ${others.map(o => o.name).join(', ')} — ${res[0].count} δικαιολογητικά, ${res[1].count} απαιτήσεις προγραμμάτων.` }
}
