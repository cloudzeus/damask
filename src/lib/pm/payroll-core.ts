import { prisma } from '@/lib/prisma'
import { aiReadDoc, contentOf, num, str, type StoredFile } from '@/lib/pm/impl-core'
import { samePerson, periodFromText } from '@/lib/pm/payroll-calc'

/**
 * (Plain module — actions & αυτόματη καταχώριση.) Καταχώριση εγγράφου μισθοδοσίας σε ήδη αποθηκευμένο αρχείο:
 * μισθοδοτικές → εργαζόμενοι × μήνες, αναγγελίες → νέοι εργαζόμενοι του έργου, πληρωμές → μήνας/ποσό.
 */

export type PayrollDocKind = 'PAYSLIPS' | 'PAYMENT' | 'HIRING' | 'OTHER'
type FileIn = StoredFile
const toDate = (s: string | null) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s) : null)
const period = (v: unknown) => { const s = str(v); return s && /^\d{4}-\d{2}$/.test(s) ? s : null }

const PAYSLIP_PROMPT = [
  'Διαβάζεις ελληνικές ΜΙΣΘΟΔΟΤΙΚΕΣ ΚΑΤΑΣΤΑΣΕΙΣ (μπορεί πολλοί μήνες/εργαζόμενοι). Για ΚΑΘΕ εργαζόμενο και ΚΑΘΕ μήνα επέστρεψε μία γραμμή — κανέναν μην παραλείψεις.',
  'Ξεχωριστές γραμμές για τακτικές αποδοχές, δώρο Χριστουγέννων, δώρο Πάσχα, επίδομα αδείας (ίδιος μήνας, άλλο είδος).',
  'Γράψε το ονοματεπώνυμο ακριβώς όπως αναγράφεται (ΕΠΩΝΥΜΟ ΟΝΟΜΑ) και ΑΦΜ/ΑΜΚΑ αν φαίνονται.',
  'Απάντησε ΑΥΣΤΗΡΑ JSON: {"rows":[{"name":"ΕΠΩΝΥΜΟ ΟΝΟΜΑ","afm":"","amka":"","period":"YYYY-MM","kind":"τακτικές|δώρο Χριστουγέννων|δώρο Πάσχα|επίδομα αδείας|άλλο","days":αριθμός|null,"gross":μικτές αποδοχές,"employeeContrib":εισφορές εργαζομένου,"employerContrib":εισφορές εργοδότη,"tax":φόρος,"net":καθαρές πληρωτέες}]}',
].join('\n')
const PAGES_PER_CHUNK = 6

/**
 * Μισθοδοτικές: μεγάλα PDF (π.χ. 12 μήνες × πολλοί εργαζόμενοι, 60+ σελίδες) διαβάζονται σε κομμάτια σελίδων —
 * αλλιώς η απάντηση του AI κόβεται και χάνονται εργαζόμενοι/μήνες.
 */
async function readPayslips(file: FileIn, userId: string, refId: string): Promise<{ rows: Record<string, unknown>[] }> {
  if (file.mime !== 'application/pdf') return (await aiRead<{ rows?: Record<string, unknown>[] }>(file, PAYSLIP_PROMPT, userId, refId, 30_000).then(x => ({ rows: x?.rows ?? [] })))
  const { PDFDocument } = await import('pdf-lib')
  const src = await PDFDocument.load(Buffer.from(await contentOf(file), 'base64'), { ignoreEncryption: true })
  const total = src.getPageCount()
  if (total <= PAGES_PER_CHUNK) return aiRead<{ rows?: Record<string, unknown>[] }>(file, PAYSLIP_PROMPT, userId, refId, 30_000).then(x => ({ rows: x?.rows ?? [] }))
  const chunks: number[][] = []
  for (let i = 0; i < total; i += PAGES_PER_CHUNK) chunks.push(Array.from({ length: Math.min(PAGES_PER_CHUNK, total - i) }, (_, k) => i + k))
  const out: Record<string, unknown>[][] = new Array(chunks.length)
  // Ανάγνωση εύρους σελίδων· άκυρη/κενή απάντηση → 2η προσπάθεια → αλλιώς χωρίζεται στα δύο (ως 1 σελίδα).
  const readRange = async (pages: number[]): Promise<Record<string, unknown>[]> => {
    const part = await PDFDocument.create()
    for (const pg of await part.copyPages(src, pages)) part.addPage(pg)
    const doc: StoredFile = { key: '', name: `${file.name} (σελ. ${pages[0] + 1}-${pages[pages.length - 1] + 1})`, base64: Buffer.from(await part.save()).toString('base64'), mime: 'application/pdf' }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const rows = (await aiRead<{ rows?: Record<string, unknown>[] }>(doc, PAYSLIP_PROMPT, userId, refId, 24_000))?.rows
        if (Array.isArray(rows) && rows.length) return rows
      } catch (err) { if (attempt && pages.length === 1) throw err }
    }
    if (pages.length === 1) return []
    const mid = Math.ceil(pages.length / 2)
    return [...(await readRange(pages.slice(0, mid))), ...(await readRange(pages.slice(mid)))]
  }
  let next = 0
  const worker = async () => {
    while (next < chunks.length) {
      const idx = next++
      out[idx] = await readRange(chunks[idx])
    }
  }
  await Promise.all([worker(), worker(), worker()])
  return { rows: out.flat() }
}

async function aiRead<T>(file: FileIn, system: string, userId: string, refId: string, maxOutputTokens?: number): Promise<T | null> {
  return aiReadDoc<T>(file, system, userId || null, refId, 'payroll', maxOutputTokens)
}

type Emp = { id: string; name: string; afm: string | null }
async function findOrCreateEmployee(expenseId: string, cache: Emp[], who: { name: string; afm?: string | null; amka?: string | null; hiredAt?: Date | null; projectHire?: boolean }): Promise<Emp> {
  const hit = cache.find(e => samePerson(e, who))
  if (hit) {
    const data: { afm?: string; amka?: string; hiredAt?: Date; projectHire?: boolean } = {}
    if (!hit.afm && who.afm) data.afm = who.afm
    if (who.amka) data.amka = who.amka
    if (who.hiredAt) data.hiredAt = who.hiredAt
    if (who.projectHire) data.projectHire = true
    if (Object.keys(data).length) await prisma.payrollEmployee.update({ where: { id: hit.id }, data })
    return hit
  }
  const row = await prisma.payrollEmployee.create({ data: { expenseId, name: who.name.slice(0, 200), afm: who.afm ?? null, amka: who.amka ?? null, hiredAt: who.hiredAt ?? null, projectHire: !!who.projectHire } })
  const emp = { id: row.id, name: row.name, afm: row.afm }
  cache.push(emp)
  return emp
}


/** Καταχώριση + ανάγνωση. Επιστρέφει σύντομη περιγραφή του τι βρέθηκε. */
export async function ingestPayrollDocCore(input: { expenseId: string; kind: PayrollDocKind; file: StoredFile; userId: string | null }): Promise<{ docId: string; note: string }> {
  const { expenseId, kind } = input
  const file = input.file
  const userIdS = input.userId ?? ''
  const doc = await prisma.payrollDoc.create({ data: { expenseId, kind, key: file.key, name: file.name.slice(0, 250), mime: file.mime, createdById: input.userId } })
    const cache: Emp[] = (await prisma.payrollEmployee.findMany({ where: { expenseId }, select: { id: true, name: true, afm: true } }))
    let note = 'Καταχωρίστηκε.'
    try {
      if (kind === 'PAYSLIPS') {
        const x = await readPayslips(file, userIdS, expenseId)
        let count = 0
        for (const r of x?.rows ?? []) {
          const name = str(r.name), p = period(r.period), gross = num(r.gross)
          if (!name || !p || gross == null || gross <= 0) continue
          const emp = await findOrCreateEmployee(expenseId, cache, { name, afm: str(r.afm)?.replace(/\D/g, '') || null, amka: str(r.amka) })
          const kindL = str(r.kind) ?? 'τακτικές'
          const data = { docId: doc.id, days: num(r.days), gross, employeeContrib: num(r.employeeContrib), employerContrib: num(r.employerContrib) ?? 0, tax: num(r.tax), net: num(r.net) }
          await prisma.payrollLine.upsert({ where: { employeeId_period_kind: { employeeId: emp.id, period: p, kind: kindL } }, create: { employeeId: emp.id, period: p, kind: kindL, ...data }, update: data })
          count++
        }
        const periods = [...new Set((x?.rows ?? []).map(r => period(r.period)).filter(Boolean))].sort()
        note = count ? `Διαβάστηκαν ${count} γραμμές μισθοδοσίας${periods.length ? ` (${periods[0]} έως ${periods[periods.length - 1]})` : ''}.` : 'Δεν βρέθηκαν γραμμές μισθοδοσίας.'
      } else if (kind === 'PAYMENT') {
        const x = await aiRead<{ amount?: unknown; date?: unknown; period?: unknown; kind?: unknown }>(file, [
          'Διαβάζεις ελληνικό αποδεικτικό ΠΛΗΡΩΜΗΣ ΜΙΣΘΟΔΟΣΙΑΣ (μαζική πληρωμή μισθών / μεταφορά προς εργαζόμενους) ή εξτρέ.',
          'Απάντησε ΑΥΣΤΗΡΑ JSON: {"amount": συνολικό ποσό χρέωσης (αριθμός), "date":"YYYY-MM-DD", "period":"YYYY-MM του μήνα μισθοδοσίας που αφορά (από αιτιολογία/όνομα αρχείου)", "kind":"προκαταβολή|εξόφληση|εισφορές|άλλο"}.',
        ].join('\n'), userIdS, expenseId)
        const p = period(x?.period) ?? periodFromText(file.name)
        await prisma.payrollDoc.update({ where: { id: doc.id }, data: { amount: num(x?.amount), paidAt: toDate(str(x?.date)), period: p, note: str(x?.kind) } })
        note = x ? `Πληρωμή ${num(x.amount)?.toLocaleString('el-GR', { minimumFractionDigits: 2 }) ?? '—'} € για ${p ?? 'άγνωστο μήνα'}.` : 'Συμπληρώστε ποσό και μήνα.'
      } else if (kind === 'HIRING') {
        const x = await aiRead<{ employees?: Record<string, unknown>[] }>(file, [
          'Διαβάζεις ελληνική ΑΝΑΓΓΕΛΙΑ ΠΡΟΣΛΗΨΗΣ (ΕΡΓΑΝΗ Ε3) ή σύμβαση εργασίας.',
          'Απάντησε ΑΥΣΤΗΡΑ JSON: {"employees":[{"name":"ΕΠΩΝΥΜΟ ΟΝΟΜΑ","afm":"","amka":"","hiredAt":"YYYY-MM-DD","partTime":true|false,"weeklyHours":αριθμός|null}]}',
        ].join('\n'), userIdS, expenseId)
        const names: string[] = []
        for (const r of x?.employees ?? []) {
          const name = str(r.name)
          if (!name) continue
          const emp = await findOrCreateEmployee(expenseId, cache, { name, afm: str(r.afm)?.replace(/\D/g, '') || null, amka: str(r.amka), hiredAt: toDate(str(r.hiredAt)), projectHire: true })
          const hours = num(r.weeklyHours)
          if (r.partTime === true && hours && hours < 40) await prisma.payrollEmployee.update({ where: { id: emp.id }, data: { fte: Math.round((hours / 40) * 100) / 100 } })
          names.push(name)
        }
        note = names.length ? `Νέος/οι εργαζόμενος/οι του έργου: ${names.join(', ')}.` : 'Δεν βρέθηκε εργαζόμενος — σημειώστε τον χειροκίνητα.'
      }
    } catch (err) {
      await prisma.payrollDoc.update({ where: { id: doc.id }, data: { readError: err instanceof Error ? err.message.slice(0, 300) : 'Η ανάγνωση απέτυχε.' } })
      note = 'Ανέβηκε, αλλά η ανάγνωση απέτυχε — δοκιμάστε ξανά ή συμπληρώστε χειροκίνητα.'
    }
  return { docId: doc.id, note }
}
