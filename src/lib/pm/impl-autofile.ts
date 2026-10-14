import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { ExtractedDocument } from '@/lib/ocr/schema'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { classifyImplDoc, invoiceNumberHint, folderOf, ROLE_LABEL, type ImplDocRole } from '@/lib/pm/impl-doc-classify'
import { isPayrollExpense } from '@/lib/pm/invoice-match'
import { createInvoiceCore, attachPaymentCore, attachCertCore, addAttachmentCore, type StoredFile } from '@/lib/pm/impl-core'
import { ingestPayrollDocCore, type PayrollDocKind } from '@/lib/pm/payroll-core'

/**
 * (Plain module — worker.) «Αυτόματη καταχώριση στην υλοποίηση»: τα αρχεία του «Προς καταχώριση» ενός έργου →
 * ρόλος (impl-doc-classify) → παραστατικά στις εγκεκριμένες δαπάνες (AI αντιστοίχιση), πληρωμές/βεβαιώσεις/λογιστικά/
 * φωτογραφίες στο παραστατικό του ΦΑΚΕΛΟΥ τους (ή με τον αριθμό στο όνομα), μισθοδοσία στη δαπάνη προσωπικού.
 * Ό,τι υπάρχει ήδη παραλείπεται· ό,τι δεν βρίσκει θέση μένει στο «Προς καταχώριση» για τον χρήστη.
 */

export const QUEUE_IMPL_AUTOFILE = 'impl-autofile'
const statusKey = (applicationId: string) => `implAutofile:${applicationId}`

export type AutofileStatus = {
  state: 'RUNNING' | 'DONE' | 'FAILED'
  total: number
  done: number
  counts: { invoices: number; payments: number; certs: number; attachments: number; payroll: number; existing: number; unresolved: number }
  /** Τι έμεινε για τον χρήστη (σύντομα). */
  notes: string[]
  startedAt: string
  finishedAt?: string
  error?: string
}

export async function readAutofileStatus(applicationId: string): Promise<AutofileStatus | null> {
  const s = await prisma.setting.findUnique({ where: { key: statusKey(applicationId) } })
  return (s?.value as AutofileStatus | undefined) ?? null
}
async function writeStatus(applicationId: string, st: AutofileStatus) {
  const value = st as unknown as Prisma.InputJsonValue
  await prisma.setting.upsert({ where: { key: statusKey(applicationId) }, create: { key: statusKey(applicationId), value }, update: { value } })
}

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').replace(/^0+/, '')
const r2 = (v: number) => Math.round(v * 100) / 100

type InboxRow = { id: string; fileName: string; relPath: string | null; storageKey: string; mimeType: string; kind: string; extracted: unknown }
type Item = InboxRow & { role: ImplDocRole; folder: string; numberHint: string | null; x: ExtractedDocument | null }

/** Ποια εγκεκριμένη δαπάνη αφορά κάθε νέο παραστατικό (AI με ποσά/προμηθευτή/είδη). */
async function assignInvoices(invoices: Item[], expenses: { id: string; description: string; category: string | null; approved: number; invoiced: number }[], userId: string | null): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!invoices.length || !expenses.length) return out
  if (expenses.length === 1) { for (const i of invoices) out.set(i.id, expenses[0].id); return out }
  try {
    const { deepseekChat } = await import('@/lib/deepseek')
    const text = await deepseekChat([
      { role: 'system', content: [
        'Είσαι σύμβουλος ΕΣΠΑ σε φάση υλοποίησης. Αντιστοίχισε κάθε ΠΑΡΑΣΤΑΤΙΚΟ σε μία ΕΓΚΕΚΡΙΜΕΝΗ ΔΑΠΑΝΗ του έργου (id) ή null.',
        'Κριτήρια: αντικείμενο/είδη, προμηθευτής (π.χ. σύμβουλος → υπηρεσίες παρακολούθησης), φάκελος, και ότι τα καθαρά ποσά των παραστατικών μιας δαπάνης αθροίζουν περίπου στο εγκεκριμένο.',
        'Απάντησε ΑΥΣΤΗΡΑ JSON: {"map":[{"i":αριθμός παραστατικού,"expenseId":"id ή null"}]}',
      ].join('\n') },
      { role: 'user', content: [
        'ΕΓΚΕΚΡΙΜΕΝΕΣ ΔΑΠΑΝΕΣ:',
        ...expenses.map(e => `- id=${e.id}: ${e.description} [${e.category ?? '—'}] εγκεκριμένο ${e.approved}€ (ήδη παραστατικά ${e.invoiced}€)`),
        '', 'ΠΑΡΑΣΤΑΤΙΚΑ:',
        ...invoices.map((v, i) => `${i}. ${v.x?.issuer?.name ?? '—'} αρ.${v.x?.documentNumber ?? v.numberHint ?? '—'} καθαρό ${v.x?.totals?.net ?? '—'}€ σύνολο ${v.x?.totals?.gross ?? '—'}€ · είδη: ${(v.x?.lines ?? []).slice(0, 4).map(l => l.description).join('; ').slice(0, 220)} · φάκελος: ${v.relPath ?? ''}`),
      ].join('\n') },
    ], { model: 'deepseek-chat', maxTokens: 800, scope: 'OTHER', refType: 'impl-autofile', userId })
    const p = (parseJsonLoose(text) ?? {}) as { map?: { i?: unknown; expenseId?: unknown }[] }
    const valid = new Set(expenses.map(e => e.id))
    for (const m of p.map ?? []) {
      const i = Number(m.i)
      if (invoices[i] && typeof m.expenseId === 'string' && valid.has(m.expenseId)) out.set(invoices[i].id, m.expenseId)
    }
  } catch (err) { console.error('[impl-autofile] αντιστοίχιση απέτυχε', err) }
  return out
}

export async function runImplAutofile(applicationId: string, userId: string | null): Promise<AutofileStatus> {
  const st: AutofileStatus = { state: 'RUNNING', total: 0, done: 0, counts: { invoices: 0, payments: 0, certs: 0, attachments: 0, payroll: 0, existing: 0, unresolved: 0 }, notes: [], startedAt: new Date().toISOString() }
  try {
    const app = await prisma.programApplication.findUniqueOrThrow({ where: { id: applicationId }, select: { trdr: { select: { NAME: true, AFM: true } } } })
    const rows = await prisma.applicationInboxDoc.findMany({ where: { applicationId, status: 'PENDING' }, select: { id: true, fileName: true, relPath: true, storageKey: true, mimeType: true, kind: true, extracted: true }, orderBy: { createdAt: 'asc' } })
    const items: Item[] = rows.map(r => {
      const x = (r.kind === 'INVOICE' ? (r.extracted as ExtractedDocument | null) : null) ?? null
      return {
        ...r, x, folder: folderOf(r.relPath), numberHint: invoiceNumberHint(`${r.relPath ?? ''} ${r.fileName}`),
        role: classifyImplDoc({ fileName: r.fileName, relPath: r.relPath, mimeType: r.mimeType, docType: x?.docType, issuerName: x?.issuer?.name, issuerAfm: x?.issuer?.afm, gross: x?.totals?.gross, beneficiaryName: app.trdr.NAME, beneficiaryAfm: app.trdr.AFM, inboxKind: r.kind }),
      }
    }).filter(i => i.role !== 'APPROVAL' && i.role !== 'OTHER')
    st.total = items.length
    await writeStatus(applicationId, st)

    const expenses = await prisma.programExpense.findMany({
      where: { applicationId, status: 'ACTIVE' },
      select: { id: true, description: true, amount: true, category: { select: { name: true } }, invoices: { select: { id: true, number: true, netAmount: true, invoiceName: true, supplierCertKey: true, payments: { select: { docs: true } }, attachments: { select: { name: true } } } } },
    })
    const payrollExpense = expenses.find(e => isPayrollExpense(e.category?.name ?? null, e.description)) ?? null
    const invoiceExpenses = expenses.filter(e => e !== payrollExpense)

    const processed = new Set<string>()
    const done = async (id: string, note: string) => {
      processed.add(id)
      await prisma.applicationInboxDoc.update({ where: { id }, data: { status: 'DONE', processedAt: new Date(), resultNote: note.slice(0, 300) } })
      st.done++
      if (st.done % 5 === 0) await writeStatus(applicationId, st)
    }
    const file = (i: Item): StoredFile => ({ key: i.storageKey, name: i.fileName, mime: i.mimeType })

    // ── 1. Παραστατικά: υπάρχοντα (ίδιος αριθμός) ή νέα με AI αντιστοίχιση σε δαπάνη ──────────────────────
    const byNumber = new Map<string, string>() // αριθμός → invoiceId
    for (const e of invoiceExpenses) for (const inv of e.invoices) { const d = digits(inv.number); if (d) byNumber.set(d, inv.id) }
    // «Σχετικά» με παραστατικό που ΔΕΝ είναι το ίδιο (π.χ. «Netscope - Παραστατικό π1-14759» = απόδειξη είσπραξης NS.201/AR):
    // ο αριθμός στο όνομα ≠ ο αριθμός του εγγράφου → συνοδευτικό του παραστατικού με τον αριθμό του ονόματος.
    const related = new Set<string>()
    for (const i of items) {
      if (i.role !== 'INVOICE' || !i.numberHint) continue
      const own = digits(i.x?.documentNumber)
      if (own && !own.endsWith(i.numberHint) && !i.numberHint.endsWith(own)) related.add(i.id)
    }
    const invItems = items.filter(i => i.role === 'INVOICE' && !related.has(i.id))
    // Παραστατικά χωρίς ανάγνωση τιμολογίου (π.χ. ήρθαν ως «εγκριτική» από τον φάκελο ΕΓΚΡΙΣΗ) → ανάγνωση τώρα.
    for (const i of invItems) {
      if (i.x || !/pdf|image\//.test(i.mimeType)) continue
      try {
        const { extractDocument } = await import('@/lib/ocr/extract')
        const { contentOf } = await import('@/lib/pm/impl-core')
        i.x = (await extractDocument({ images: [{ base64: await contentOf(file(i)), mimeType: i.mimeType as 'image/png' }], docType: 'invoice', refId: applicationId, userId })).data
        if (!i.numberHint) i.numberHint = digits(i.x.documentNumber) || null
      } catch (err) { console.error('[impl-autofile] ανάγνωση παραστατικού απέτυχε', i.fileName, err) }
    }
    // Διπλά στο ίδιο ανέβασμα (π.χ. «ΤΔΑ 14759.pdf» και «Netscope - Παραστατικό π1-14759.pdf»): ένα ανά αριθμό — προτιμάται αυτό στον φάκελο του παραστατικού.
    const pick = new Map<string, Item>()
    for (const i of invItems) {
      const d = digits(i.x?.documentNumber) || i.numberHint || i.id
      const cur = pick.get(d)
      const inOwnFolder = (v: Item) => !!v.numberHint && v.folder.includes(v.numberHint)
      if (!cur || (inOwnFolder(i) && !inOwnFolder(cur))) pick.set(d, i)
    }
    const fresh: Item[] = []
    for (const [d, i] of pick) {
      if (byNumber.has(d)) { st.counts.existing++; continue }
      fresh.push(i)
    }
    const assigned = await assignInvoices(fresh, invoiceExpenses.map(e => ({
      id: e.id, description: e.description, category: e.category?.name ?? null, approved: Number(e.amount),
      invoiced: r2(e.invoices.reduce((a, v) => a + Number(v.netAmount ?? 0), 0)),
    })), userId)
    // Εφεδρεία: ίδιος προμηθευτής (ΑΦΜ ή όνομα) με παραστατικό που ήδη ανήκει σε δαπάνη → ίδια δαπάνη.
    const supplierExpense = new Map<string, string>()
    // Κλειδιά προμηθευτή: ΑΦΜ ΚΑΙ όνομα (το ένα παραστατικό μπορεί να διαβάστηκε με ΑΦΜ, το άλλο μόνο με όνομα).
    const supKeys = (afm: string | null | undefined, name: string | null | undefined) =>
      [digits(afm) ? `afm:${digits(afm)}` : '', `name:${(name ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zα-ω]/g, '').slice(0, 12)}`].filter(k => k && k !== 'name:')
    const remember = (afm: string | null | undefined, name: string | null | undefined, expenseId: string) => { for (const k of supKeys(afm, name)) supplierExpense.set(k, expenseId) }
    const recall = (afm: string | null | undefined, name: string | null | undefined) => supKeys(afm, name).map(k => supplierExpense.get(k)).find(Boolean)
    for (const e of invoiceExpenses) for (const v of await prisma.expenseInvoice.findMany({ where: { expenseId: e.id }, select: { supplier: true, supplierAfm: true } })) remember(v.supplierAfm, v.supplier, e.id)
    for (const i of fresh) if (assigned.has(i.id)) remember(i.x?.issuer?.afm, i.x?.issuer?.name, assigned.get(i.id)!)
    for (const i of fresh) {
      const expenseId = assigned.get(i.id) ?? recall(i.x?.issuer?.afm, i.x?.issuer?.name)
      if (!expenseId) { st.counts.unresolved++; st.notes.push(`Παραστατικό «${i.fileName}»: δεν βρέθηκε εγκεκριμένη δαπάνη — καταχωρίστε το χειροκίνητα.`); continue }
      const invoiceId = await createInvoiceCore({ expenseId, file: file(i), userId, extracted: i.x })
      const d = digits(i.x?.documentNumber) || i.numberHint
      if (d) byNumber.set(d, invoiceId)
      st.counts.invoices++
      await done(i.id, `Καταχωρίστηκε ως παραστατικό στη δαπάνη «${invoiceExpenses.find(e => e.id === expenseId)?.description.slice(0, 80)}».`)
    }
    // Τα διπλά/υπάρχοντα παραστατικά → «υπάρχει ήδη».
    for (const i of invItems) {
      if (processed.has(i.id)) continue
      const d = digits(i.x?.documentNumber) || i.numberHint
      if (d && byNumber.has(d) && !fresh.includes(i)) await done(i.id, `Υπάρχει ήδη το παραστατικό αρ. ${d}.`)
    }

    // ── 2. Φάκελος → παραστατικό (ο φάκελος ή κάποιος γονικός περιέχει τον αριθμό, ή το ίδιο το παραστατικό) ───
    const folderInvoice = new Map<string, string>()
    for (const i of invItems) { const d = digits(i.x?.documentNumber) || i.numberHint; if (d && byNumber.has(d) && i.folder) folderInvoice.set(i.folder, byNumber.get(d)!) }
    const anchorOf = (i: Item): string | null => {
      for (let f = i.folder; f; f = folderOf(f)) {
        if (folderInvoice.has(f)) return folderInvoice.get(f)!
        const n = invoiceNumberHint(f.split('/').pop() ?? '')
        if (n && byNumber.has(n)) return byNumber.get(n)!
      }
      return i.numberHint && byNumber.has(i.numberHint) ? byNumber.get(i.numberHint)! : null
    }
    // Ήδη συνδεδεμένα (ίδιο όνομα αρχείου) → δεν ξαναμπαίνουν.
    const known = new Map<string, Set<string>>()
    for (const e of invoiceExpenses) for (const v of e.invoices) {
      const s = new Set<string>(v.attachments.map(a => a.name))
      for (const p of v.payments) for (const doc of (Array.isArray(p.docs) ? p.docs as { name: string }[] : [])) s.add(doc.name)
      if (v.supplierCertKey) s.add('__cert__')
      known.set(v.id, s)
    }

    // ── 3. Πληρωμές / βεβαιώσεις / λογιστικά / φωτογραφίες ─────────────────────────────────────────────
    for (const i of items.filter(v => ['PAYMENT', 'SUPPLIER_CERT', 'ACCOUNTING', 'PHOTO'].includes(v.role) || related.has(v.id))) {
      const invoiceId = anchorOf(i)
      if (!invoiceId) { st.counts.unresolved++; st.notes.push(`${ROLE_LABEL[i.role]} «${i.fileName}»: δεν βρέθηκε το παραστατικό του.`); continue }
      const k = known.get(invoiceId) ?? new Set<string>()
      known.set(invoiceId, k)
      if (k.has(i.fileName) || (i.role === 'SUPPLIER_CERT' && k.has('__cert__'))) { st.counts.existing++; await done(i.id, 'Υπάρχει ήδη στο παραστατικό.'); continue }
      try {
        if (i.role === 'PAYMENT') { await attachPaymentCore({ invoiceId, file: file(i), userId }); st.counts.payments++ }
        else if (i.role === 'SUPPLIER_CERT') { await attachCertCore({ invoiceId, file: file(i), userId }); st.counts.certs++; k.add('__cert__') }
        else { await addAttachmentCore({ invoiceId, kind: related.has(i.id) ? 'OTHER' : i.role === 'ACCOUNTING' ? 'ACCOUNTING' : 'PHOTO', file: file(i) }); st.counts.attachments++ }
        k.add(i.fileName)
        await done(i.id, `${related.has(i.id) ? 'Σχετικό έγγραφο' : ROLE_LABEL[i.role]} → συνδέθηκε με το παραστατικό.`)
      } catch (err) {
        st.counts.unresolved++
        st.notes.push(`${ROLE_LABEL[i.role]} «${i.fileName}»: ${err instanceof Error ? err.message.slice(0, 120) : 'απέτυχε'}.`)
      }
    }

    // ── 4. Μισθοδοσία ────────────────────────────────────────────────────────────────────────────────
    const payrollItems = items.filter(v => ['PAYSLIPS', 'HIRING', 'PAYROLL_PAYMENT', 'PAYROLL_OTHER'].includes(v.role))
    if (payrollItems.length && !payrollExpense) st.notes.push(`${payrollItems.length} έγγραφα προσωπικού: το έργο δεν έχει εγκεκριμένη δαπάνη προσωπικού.`)
    if (payrollExpense) {
      const existing = new Set((await prisma.payrollDoc.findMany({ where: { expenseId: payrollExpense.id }, select: { name: true } })).map(d => d.name))
      // Αναγγελίες πρώτα (ορίζουν τους νέους εργαζόμενους), μετά μισθοδοτικές, πληρωμές, λοιπά.
      const order: ImplDocRole[] = ['HIRING', 'PAYSLIPS', 'PAYROLL_PAYMENT', 'PAYROLL_OTHER']
      for (const role of order) for (const i of payrollItems.filter(v => v.role === role)) {
        if (existing.has(i.fileName)) { st.counts.existing++; await done(i.id, 'Υπάρχει ήδη στη μισθοδοσία.'); continue }
        const kind: PayrollDocKind = role === 'HIRING' ? 'HIRING' : role === 'PAYSLIPS' ? 'PAYSLIPS' : role === 'PAYROLL_PAYMENT' ? 'PAYMENT' : 'OTHER'
        try {
          const r = await ingestPayrollDocCore({ expenseId: payrollExpense.id, kind, file: file(i), userId })
          st.counts.payroll++
          await done(i.id, `Μισθοδοσία: ${r.note}`)
        } catch (err) {
          st.counts.unresolved++
          st.notes.push(`${ROLE_LABEL[i.role]} «${i.fileName}»: ${err instanceof Error ? err.message.slice(0, 120) : 'απέτυχε'}.`)
        }
      }
    }

    st.state = 'DONE'
    st.finishedAt = new Date().toISOString()
    st.notes = st.notes.slice(0, 40)
    await writeStatus(applicationId, st)
    return st
  } catch (err) {
    st.state = 'FAILED'
    st.error = err instanceof Error ? err.message.slice(0, 300) : 'Απέτυχε.'
    st.finishedAt = new Date().toISOString()
    await writeStatus(applicationId, st)
    return st
  }
}

/** Έναρξη στο παρασκήνιο (pg-boss) — η σελίδα παρακολουθεί την πρόοδο. */
export async function enqueueImplAutofile(applicationId: string, userId: string | null): Promise<void> {
  await writeStatus(applicationId, { state: 'RUNNING', total: 0, done: 0, counts: { invoices: 0, payments: 0, certs: 0, attachments: 0, payroll: 0, existing: 0, unresolved: 0 }, notes: [], startedAt: new Date().toISOString() })
  const { startBoss } = await import('@/lib/queue')
  const boss = await startBoss()
  await boss.send(QUEUE_IMPL_AUTOFILE, { applicationId, userId }, { singletonKey: applicationId, retryLimit: 0 })
}
