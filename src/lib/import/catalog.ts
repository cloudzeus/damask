import crypto from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { bunnyDownload } from '@/lib/bunny-storage'
import { AiQuotaError } from '@/lib/ai/quota'

/**
 * (Plain module — worker.) «Έκδοση καταλόγου» + ξαναεξέταση. Όταν αλλάζει κάτι που επηρεάζει την αναγνώριση/ανάγνωση
 * (τύποι, Οδηγοί/πεδία «Σάρωσης τιμών», δείγματα εκπαίδευσης, απαιτήσεις προγραμμάτων):
 *  1. τα αναγνώριστα αρχεία των ενεργών παρτίδων (και όσα πήγαιναν «στα αρχεία πελάτη») ξαναμπαίνουν στην ουρά·
 *  2. τα ήδη αποθηκευμένα δικαιολογητικά τύπων που απέκτησαν/άλλαξαν Οδηγό διαβάζονται (τιμές στην εταιρία)·
 *  3. ειδοποίηση με το τι βρέθηκε.
 * Τρέχει κάθε 15′ (φθηνός έλεγχος) και ~2′ μετά από κάθε αλλαγή καταλόγου.
 */

export const QUEUE_CATALOG_RECHECK = 'catalog-recheck'
const SETTING_KEY = 'import.catalogVersion'
/** Αναγνώσεις τιμών ανά γύρο (κλήσεις Gemini — όρια δωρεάν βαθμίδας). */
const VALUES_PER_RUN = 8

/** Σήμα «άλλαξε ο κατάλογος» — ο έλεγχος τρέχει σε ~2′ (πολλές αλλαγές μαζί = ένας γύρος). */
export function kickCatalogRecheck(): void {
  import('@/lib/queue')
    .then(({ startBoss }) => startBoss())
    .then(boss => boss.send(QUEUE_CATALOG_RECHECK, {}, { startAfter: 120, singletonKey: 'catalog', singletonSeconds: 120 }))
    .catch(err => console.error('[catalog] enqueue απέτυχε', err))
}

/** Ταυτότητα της τρέχουσας κατάστασης καταλόγου (αλλάζει με κάθε σχετική αλλαγή). */
export async function catalogVersion(): Promise<string> {
  const [types, fields, examples, forms, templates] = await Promise.all([
    prisma.documentType.aggregate({ _count: true, _max: { updatedAt: true } }),
    prisma.taxFormTemplateField.aggregate({ _count: true, _max: { updatedAt: true } }),
    // Μόνο δείγματα «Εκπαίδευσης» — όχι τα αυτόματα από κάθε αποθήκευση (αλλιώς κάθε αυτόματη αποθήκευση θα
    // ξανάβαζε στην ουρά όλα τα αναγνώριστα: βρόχος κλήσεων AI).
    prisma.documentClassificationExample.aggregate({ where: { origin: 'TRAINING' }, _count: true, _max: { createdAt: true } }),
    prisma.programRequiredForm.aggregate({ _count: true, _max: { createdAt: true } }),
    prisma.taxFormTemplate.aggregate({ _count: true, _max: { updatedAt: true } }),
  ])
  const parts = [
    types._count, types._max.updatedAt?.getTime(), fields._count, fields._max.updatedAt?.getTime(),
    examples._count, examples._max.createdAt?.getTime(), forms._count, forms._max.createdAt?.getTime(), templates._count, templates._max.updatedAt?.getTime(),
  ]
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16)
}

/** Ειδικοί αναγνώστες (Ε3/ΕΜΕ/Δήλωση ΜΜΕ) έχουν δική τους ανάγνωση — όχι μέσω του γενικού Οδηγού. */
async function specialTypeIds(): Promise<Set<string>> {
  const [{ isE3TypeName }, { isMmeTypeName }, { isEmeDocumentType }] = await Promise.all([import('@/lib/tax/e3'), import('@/lib/tax/mme'), import('@/lib/tax/eme')])
  const types = await prisma.documentType.findMany({ select: { id: true, name: true } })
  const out = new Set<string>()
  for (const t of types) if (isE3TypeName(t.name) || isMmeTypeName(t.name) || (await isEmeDocumentType(t.id))) out.add(t.id)
  return out
}

export type RecheckResult = { changed: boolean; requeued: number; valuesRead: number; valuesPending: number }

export async function runCatalogRecheck(): Promise<RecheckResult> {
  const version = await catalogVersion()
  const prev = (await prisma.setting.findUnique({ where: { key: SETTING_KEY } }))?.value as { version?: string } | null
  const changed = prev?.version !== version

  // 1. Αναγνώριστα / «στα αρχεία» σε ενεργές παρτίδες, αναγνωρισμένα με παλαιότερο κατάλογο → ξανά στην ουρά.
  let requeued = 0
  if (changed) {
    const candidates = await prisma.importItem.findMany({
      where: { phase: 'REVIEW', batch: { status: 'ACTIVE' }, storageKey: { not: null }, OR: [{ catalogVersion: null }, { catalogVersion: { not: version } }] },
      select: { id: true, dest: true, suggestion: true },
    })
    const ids = candidates.filter(c => {
      const s = c.suggestion as { typeId?: string | null; commercial?: string | null } | null
      return !s?.commercial && (c.dest === 'files' || !s?.typeId)
    }).map(c => c.id)
    if (ids.length) {
      requeued = (await prisma.importItem.updateMany({ where: { id: { in: ids } }, data: { phase: 'QUEUED', attempts: 0, error: null } })).count
      const { kickImportSweep } = await import('./recognize')
      kickImportSweep()
    }
  }

  // 2. Δικαιολογητικά τύπων με έτοιμο Οδηγό που δεν έχουν διαβαστεί (ή διαβάστηκαν πριν την τελευταία αλλαγή του Οδηγού).
  const special = await specialTypeIds()
  const templates = await prisma.taxFormTemplate.findMany({
    where: { status: 'READY', documentTypeId: { not: null }, fields: { some: { kind: { not: 'TABLE' } } } },
    select: { documentTypeId: true, updatedAt: true, fields: { select: { updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 1 } },
  })
  const changedAt = new Map<string, Date>()
  for (const t of templates) {
    if (!t.documentTypeId || special.has(t.documentTypeId)) continue
    const at = [t.updatedAt, t.fields[0]?.updatedAt].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0]
    const cur = changedAt.get(t.documentTypeId)
    if (!cur || at > cur) changedAt.set(t.documentTypeId, at)
  }
  const pendingWhere: Prisma.TrdrDossierDocumentWhereInput = {
    OR: [...changedAt.entries()].map(([typeId, at]) => ({ documentTypeId: typeId, OR: [{ valuesReadAt: null }, { valuesReadAt: { lt: at } }] })),
  }
  let valuesRead = 0
  let valuesPending = 0
  if (changedAt.size) {
    const docs = await prisma.trdrDossierDocument.findMany({ where: pendingWhere, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, trdrId: true, documentTypeId: true, name: true, storageKey: true, mimeType: true, period: true, uploadedById: true } })
    // Ήδη διαβασμένα (π.χ. «Ανάγνωση τιμών» του Φ2) → μόνο σημείωση, χωρίς κλήση AI.
    const records = await prisma.trdrFormRecord.findMany({ where: { dossierDocId: { in: docs.map(d => d.id) } }, select: { dossierDocId: true, createdAt: true } })
    const readAt = new Map(records.map(r => [r.dossierDocId!, r.createdAt]))
    const { processTemplateIfApplicable } = await import('@/lib/tax/template-auto')
    const { extractTextServer } = await import('./recognize')
    // Πέρασμα 1 (χωρίς AI): όσα έχουν ήδη διαβαστεί μετά την τελευταία αλλαγή του Οδηγού → μόνο σήμανση.
    const toRead: typeof docs = []
    for (const d of docs) {
      const prevRead = readAt.get(d.id)
      if (prevRead && prevRead >= (changedAt.get(d.documentTypeId) ?? new Date(0))) await prisma.trdrDossierDocument.update({ where: { id: d.id }, data: { valuesReadAt: prevRead } })
      else toRead.push(d)
    }
    // Πέρασμα 2 (AI, με όριο ανά γύρο).
    let budget = VALUES_PER_RUN
    for (const [i, d] of toRead.entries()) {
      if (budget <= 0) { valuesPending = toRead.length - i; break }
      budget--
      try {
        const buf = await bunnyDownload(d.storageKey)
        const mime = d.mimeType ?? 'application/octet-stream'
        const binary = /pdf|image\//.test(mime)
        const text = binary ? null : await extractTextServer(buf, mime, d.name, null, d.uploadedById).catch(() => '')
        const r = await processTemplateIfApplicable({ docId: d.id, trdrId: d.trdrId, documentTypeId: d.documentTypeId, base64: buf.toString('base64'), mimeType: mime, storageKey: d.storageKey, name: d.name, userId: d.uploadedById, period: d.period, text, throwOnAiError: true })
        await prisma.trdrDossierDocument.update({ where: { id: d.id }, data: { valuesReadAt: new Date() } })
        if (r?.found.length) valuesRead++
      } catch (err) {
        // Όριο/σφάλμα της υπηρεσίας AI (429/403/δίκτυο) → ΔΕΝ σημειώνεται ως διαβασμένο· συνεχίζει στον επόμενο γύρο.
        if (err instanceof AiQuotaError || /Gemini|HTTP \d{3}|fetch failed|network|ECONN|timeout/i.test(err instanceof Error ? err.message : String(err))) { valuesPending = toRead.length - i; break }
        console.error('[catalog] ανάγνωση τιμών απέτυχε', d.id, err)
        await prisma.trdrDossierDocument.update({ where: { id: d.id }, data: { valuesReadAt: new Date() } })
      }
    }
  }

  await prisma.setting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value: { version } }, update: { value: { version } } })
  if (requeued || valuesRead) {
    const { createNotification } = await import('@/lib/notifications/service')
    await createNotification({
      title: 'Η μνήμη εγγράφων ενημερώθηκε με τις αλλαγές στους τύπους',
      body: [
        requeued ? `${requeued} αρχεία μαζικής εισαγωγής ξαναεξετάζονται με τους νέους τύπους/Οδηγούς.` : null,
        valuesRead ? `Διαβάστηκαν τιμές από ${valuesRead} ήδη αποθηκευμένα δικαιολογητικά.` : null,
        valuesPending ? `Εκκρεμούν ακόμη ${valuesPending} — συνεχίζει αυτόματα.` : null,
      ].filter(Boolean).join(' '),
      meta: { kind: 'catalog-recheck', requeued, valuesRead, valuesPending },
    })
  }
  return { changed, requeued, valuesRead, valuesPending }
}
