import { prisma } from '@/lib/prisma'
import { foldText } from '@/lib/pm/impl-doc-classify'

/**
 * (Plain module — workers/actions/hooks.) ΣΥΜΦΙΛΙΩΣΗ ΕΚΚΡΕΜΟΤΗΤΩΝ με τα δικαιολογητικά της εταιρίας. Η αυτόματη κάλυψη
 * ανά ανέβασμα ταιριάζει ΜΟΝΟ τον ακριβή τύπο του απαιτούμενου εντύπου· εδώ κλείνουν τα κενά που μένουν:
 *  1. Ισοδύναμοι τύποι (π.χ. το πρόγραμμα ζητά «Σχέδιο καταστατικού», ανέβηκε «Καταστατικό και νομιμοποιητικά
 *     έγγραφα»· έντυπο χωρίς τύπο «υπόδειγμα Γ» ↔ «Υπόδειγμα Γ: Δήλωση Σώρευσης») — κανόνες, και AI για τα υπόλοιπα.
 *  2. Σειρές (Φ2): επανυπολογισμός κάλυψης.
 *  3. «Λείπει προσφορά»: κλείνει όταν το έργο εγκρίθηκε ή ο κανόνας του προγράμματος δεν απαιτεί προσφορά.
 * Η κάλυψη βάζει το έγγραφο και κατάσταση «Υποβλήθηκε» (έλεγχος & έγκριση από το γραφείο) — όπως η αυτόματη κάλυψη.
 */

export type ReconcileResult = { covered: { obligation: string; doc: string; via: 'rules' | 'ai' }[]; series: number; waived: number }

const STOP = new Set(['και', 'του', 'της', 'των', 'για', 'απο', 'σε', 'με', 'η', 'ο', 'το', 'τα', 'οι', 'ή', 'ανα', 'κατα', 'προς'])
const stems = (s: string) => new Set(foldText(s).split(/[^a-zα-ω0-9]+/).filter(w => w.length >= 4 && !STOP.has(w)).map(w => w.slice(0, 6)))
const jaccard = (a: Set<string>, b: Set<string>) => { if (!a.size || !b.size) return 0; let h = 0; for (const w of a) if (b.has(w)) h++; return h / (a.size + b.size - h) }
/** «υπόδειγμα Γ» / «παράρτημα VIII» → κωδικός για ακριβές ταίριασμα. */
const modelCode = (s: string) => /υποδειγμα\s+([α-ωa-z])(?![α-ωa-z])/.exec(foldText(s))?.[1] ?? null

/** Ταίριασμα ονομάτων εντύπου ↔ τύπου χωρίς AI (0..1). Εξαγόμενο για tests. */
export function nameMatchScore(formNames: string[], typeName: string): number {
  const tc = modelCode(typeName)
  let best = 0
  for (const n of formNames) {
    if (!n) continue
    const fc = modelCode(n)
    if (fc && tc) { if (fc === tc) return 0.95; continue }
    best = Math.max(best, jaccard(stems(n), stems(typeName)))
  }
  return best
}

type Candidate = { typeId: string; typeName: string; docId: string; docName: string; storageKey: string; mimeType: string | null; size: number | null; expiresAt: Date | null }

async function coverWith(o: { id: string; applicationId: string }, c: Candidate, via: 'rules' | 'ai') {
  const fmt = new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  await prisma.applicationObligation.update({
    where: { id: o.id },
    data: {
      status: 'SUBMITTED',
      notes: `Καλύφθηκε από τα δικαιολογητικά της εταιρίας («${c.docName}», τύπος «${c.typeName}»${c.expiresAt ? `, σε ισχύ έως ${fmt.format(c.expiresAt)}` : ''})${via === 'ai' ? ' — αντιστοίχιση AI' : ''} — έλεγξε & ενέκρινε.`.slice(0, 500),
      documents: { create: { applicationId: o.applicationId, name: c.docName, storageKey: c.storageKey, mimeType: c.mimeType, size: c.size, expiresAt: c.expiresAt, documentTypeId: c.typeId } },
    },
  })
}

async function aiMatch(open: { id: string; names: string[] }[], types: { id: string; name: string; examples: string[] }[], applicationId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!open.length || !types.length) return out
  try {
    const { deepseekChat } = await import('@/lib/deepseek')
    const { parseJsonLoose } = await import('@/lib/ocr/extract')
    const text = await deepseekChat([
      { role: 'system', content: [
        'Είσαι σύμβουλος ΕΣΠΑ. Αντιστοιχίζεις ΑΠΑΙΤΟΥΜΕΝΑ δικαιολογητικά ενός προγράμματος σε ΤΥΠΟΥΣ δικαιολογητικών που έχει ήδη η εταιρία.',
        'Αντιστοίχισε ΜΟΝΟ όταν ο τύπος είναι πράγματι το ίδιο έγγραφο ή το καλύπτει πλήρως (π.χ. «Καταστατικό και στοιχεία εκπροσώπησης» ↔ «Καταστατικό και νομιμοποιητικά έγγραφα»· «Υπεύθυνη δήλωση προηγούμενων επιχορηγήσεων (υπόδειγμα Γ)» ↔ «Υπόδειγμα Γ: Δήλωση Σώρευσης Ενισχύσεων»).',
        'ΟΧΙ για γενικά/συγγενικά (π.χ. «Άδεια λειτουργίας» ≠ «Υπεύθυνη δήλωση», «Δικαιολογητικά συνδεδεμένων επιχειρήσεων» ≠ «Ε3 της ίδιας της εταιρίας», «Προσφορές» ≠ οτιδήποτε άλλο).',
        'Κάθε τύπος έχει examples = ονόματα αρχείων που έχει η εταιρία· διάλεξε τον τύπο που είναι ΑΚΡΙΒΩΣ το ζητούμενο έγγραφο (π.χ. για «Καταστατικό» τον τύπο με καταστατικά, όχι το πιστοποιητικό ΓΕΜΗ).',
        'Απάντησε ΑΥΣΤΗΡΑ JSON: {"matches":[{"obligation":"<id>","type":"<id>","confidence":0.0}]}',
      ].join('\n') },
      { role: 'user', content: JSON.stringify({ required: open.map(o => ({ id: o.id, names: o.names })), companyTypes: types }) },
    ], { model: 'deepseek-chat', maxTokens: 800, temperature: 0, scope: 'OTHER', refType: 'obligations-reconcile', refId: applicationId })
    const p = (parseJsonLoose(text) ?? {}) as { matches?: { obligation?: string; type?: string; confidence?: number }[] }
    const valid = new Set(types.map(t => t.id))
    for (const m of p.matches ?? []) if (m.obligation && m.type && valid.has(m.type) && (m.confidence ?? 0) >= 0.8) out.set(m.obligation, m.type)
  } catch (err) { console.error('[reconcile] AI αντιστοίχιση απέτυχε', err) }
  return out
}

/** Συμφιλίωση ενός έργου. `ai` = και αντιστοίχιση με AI για όσα δεν ταιριάζουν με κανόνες. */
export async function reconcileApplicationObligations(applicationId: string, opts: { ai?: boolean } = {}): Promise<ReconcileResult> {
  const res: ReconcileResult = { covered: [], series: 0, waived: 0 }
  const app = await prisma.programApplication.findUnique({
    where: { id: applicationId },
    select: { id: true, trdrId: true, programId: true, approval: { select: { id: true } }, program: { select: { quotePolicy: true, quotePolicyRule: true } } },
  })
  if (!app) return res

  // 3. «Λείπει προσφορά» που δεν ισχύει πια.
  const quoteObs = await prisma.applicationObligation.findMany({ where: { applicationId, kind: 'CUSTOM', status: { in: ['PENDING', 'IN_PROGRESS'] }, name: { startsWith: 'Λείπει προσφορά' } }, select: { id: true, sourceId: true } })
  if (quoteObs.length) {
    const { quoteRequiredFor } = await import('@/lib/programs/quote-policy')
    const exps = await prisma.programExpense.findMany({ where: { id: { in: quoteObs.map(q => q.sourceId!).filter(Boolean) } }, select: { id: true, amount: true, categoryId: true, status: true } })
    const byId = new Map(exps.map(e => [e.id, e]))
    for (const q of quoteObs) {
      const e = q.sourceId ? byId.get(q.sourceId) : null
      const why = !e || e.status !== 'ACTIVE' ? 'η δαπάνη δεν υπάρχει πια'
        : app.approval ? 'το έργο έχει εγκριθεί — οι προσφορές αφορούσαν την υποβολή'
        : !quoteRequiredFor(app.program.quotePolicy, app.program.quotePolicyRule, { amount: Number(e.amount), categoryId: e.categoryId }) ? 'ο κανόνας του προγράμματος δεν απαιτεί προσφορά για αυτή τη δαπάνη'
        : null
      if (!why) continue
      await prisma.applicationObligation.update({ where: { id: q.id }, data: { status: 'WAIVED', notes: `Δεν απαιτείται: ${why}.` } })
      res.waived++
    }
  }

  // 2. Σειρές.
  const forms = await prisma.applicationObligation.findMany({
    where: { applicationId, kind: 'FORM', status: { in: ['PENDING', 'IN_PROGRESS', 'REJECTED'] } },
    select: { id: true, applicationId: true, name: true, sourceId: true },
  })
  if (!forms.length) return res
  // Έντυπα προσφορών της ΥΠΟΒΟΛΗΣ (π.χ. «Δύο προσφορές για δαπάνες άνω των …») — μετά την έγκριση δεν χρειάζονται.
  if (app.approval) {
    for (const o of forms.filter(f => /προσφορ/.test(foldText(f.name)))) {
      await prisma.applicationObligation.update({ where: { id: o.id }, data: { status: 'WAIVED', notes: 'Δεν απαιτείται: το έργο έχει εγκριθεί — οι προσφορές αφορούσαν την υποβολή.' } })
      res.waived++
    }
  }
  const reqForms = await prisma.programRequiredForm.findMany({ where: { id: { in: forms.map(f => f.sourceId!).filter(Boolean) } }, select: { id: true, name: true, documentTypeId: true, documentType: { select: { name: true, seriesKind: true } } } })
  const formOf = new Map(reqForms.map(f => [f.id, f]))
  const { syncSeriesObligation } = await import('@/lib/pm/form-obligations')
  const single: typeof forms = []
  for (const o of forms.filter(f => !(app.approval && /προσφορ/.test(foldText(f.name))))) {
    const f = o.sourceId ? formOf.get(o.sourceId) : null
    if (f?.documentType?.seriesKind) { const r = await syncSeriesObligation(o.id); if (r?.complete) res.series++ }
    else single.push(o)
  }
  if (!single.length) return res

  // 1. Ισοδύναμοι τύποι από την αποθήκη της εταιρίας (σε ισχύ, επαναχρησιμοποιήσιμα ή του ίδιου προγράμματος).
  const now = new Date()
  const docs = await prisma.trdrDossierDocument.findMany({
    where: { trdrId: app.trdrId, OR: [{ expiresAt: null }, { expiresAt: { gte: now } }], AND: [{ OR: [{ reusable: true }, { programId: null }, { programId: app.programId }] }] },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, storageKey: true, mimeType: true, sizeBytes: true, expiresAt: true, documentTypeId: true, documentType: { select: { name: true, seriesKind: true } } },
  })
  // Ανά τύπο: τα έγγραφα (νεότερο πρώτα). Το «καλύτερο» για μια εκκρεμότητα = αυτό που ταιριάζει και στο ΟΝΟΜΑ
  // (π.χ. «Υπ.Δ. - Σώρευσης» και όχι ένα λάθος καταχωρισμένο αρχείο του ίδιου τύπου), αλλιώς το νεότερο.
  const docsByType = new Map<string, Candidate[]>()
  for (const d of docs) {
    if (d.documentType.seriesKind) continue
    const c = { typeId: d.documentTypeId, typeName: d.documentType.name, docId: d.id, docName: d.name, storageKey: d.storageKey, mimeType: d.mimeType, size: d.sizeBytes, expiresAt: d.expiresAt }
    docsByType.set(d.documentTypeId, [...(docsByType.get(d.documentTypeId) ?? []), c])
  }
  const bestDoc = (typeId: string, names: string[]): Candidate | undefined => {
    const list = docsByType.get(typeId) ?? []
    const scored = list.map((c, i) => ({ c, s: nameMatchScore([...names, c.typeName], c.docName), i }))
    // Έγγραφο χωρίς ΚΑΜΙΑ σχέση με το όνομα του τύπου/εντύπου μόνο αν δεν υπάρχει άλλο.
    return scored.sort((a, b) => (b.s > 0 ? 1 : 0) - (a.s > 0 ? 1 : 0) || a.i - b.i)[0]?.c
  }
  const types = [...docsByType.keys()].map(id => docsByType.get(id)![0])
  const pending: { id: string; names: string[]; o: (typeof forms)[number] }[] = []
  for (const o of single) {
    const f = o.sourceId ? formOf.get(o.sourceId) : null
    const names = [o.name, f?.name ?? '', f?.documentType?.name ?? ''].filter(Boolean)
    const exact = f?.documentTypeId && docsByType.has(f.documentTypeId) ? f.documentTypeId : null
    const scored = exact ? { typeId: exact, s: 1 } : types.map(c => ({ typeId: c.typeId, s: nameMatchScore(names, c.typeName) })).sort((a, b) => b.s - a.s)[0]
    const c = scored && scored.s >= 0.6 ? bestDoc(scored.typeId, names) : undefined
    if (c) { await coverWith(o, c, 'rules'); res.covered.push({ obligation: o.name, doc: c.docName, via: 'rules' }) }
    else pending.push({ id: o.id, names, o })
  }
  if (opts.ai && pending.length) {
    const m = await aiMatch(pending.map(p => ({ id: p.id, names: p.names })), types.map(t => ({ id: t.typeId, name: t.typeName, examples: (docsByType.get(t.typeId) ?? []).slice(0, 4).map(d => d.docName) })), applicationId)
    for (const p of pending) {
      const c = m.get(p.id) ? bestDoc(m.get(p.id)!, p.names) : undefined
      if (!c) continue
      await coverWith(p.o, c, 'ai')
      res.covered.push({ obligation: p.o.name, doc: c.docName, via: 'ai' })
    }
  }
  return res
}

/** Όλα τα έργα ενός πελάτη (μετά από ανεβάσματα δικαιολογητικών). Ποτέ δεν ρίχνει τον καλούντα. */
export async function reconcileTrdrObligations(trdrId: string, opts: { ai?: boolean } = {}): Promise<ReconcileResult> {
  const total: ReconcileResult = { covered: [], series: 0, waived: 0 }
  try {
    const apps = await prisma.programApplication.findMany({ where: { trdrId }, select: { id: true } })
    for (const a of apps) {
      const r = await reconcileApplicationObligations(a.id, opts)
      total.covered.push(...r.covered); total.series += r.series; total.waived += r.waived
    }
  } catch (err) { console.error('[reconcile] απέτυχε', trdrId, err) }
  return total
}

export const QUEUE_OBLIGATIONS_RECONCILE = 'obligations-reconcile'

/** Μετά από ανεβάσματα δικαιολογητικών: συμφιλίωση (με AI) ~1 λεπτό αργότερα, μία φορά για όλη τη «φουρνιά». */
export async function enqueueReconcile(trdrId: string): Promise<void> {
  try {
    const { startBoss } = await import('@/lib/queue')
    const boss = await startBoss()
    await boss.send(QUEUE_OBLIGATIONS_RECONCILE, { trdrId }, { singletonKey: trdrId, singletonSeconds: 90, startAfter: 60, retryLimit: 1 })
  } catch (err) { console.error('[reconcile] προγραμματισμός απέτυχε', err) }
}
