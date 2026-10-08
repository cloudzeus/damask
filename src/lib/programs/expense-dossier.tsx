import path from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import { prisma } from '@/lib/prisma'
import { bunnyDownload } from '@/lib/bunny-storage'
import { ensureFonts, C } from '@/lib/assessment/pdf'
import type { ExpenseEligibilityDetail } from './expense-eligibility'

/**
 * (Server-only.) «Φάκελος τεκμηρίωσης δαπανών» ενός έργου για τη Διαχειριστική Αρχή, on demand:
 * PDF (εξώφυλλο, σύνοψη ανά κατηγορία έναντι ορίων, καρτέλα ανά δαπάνη με γραμμές, προσφορά/παραστατικό,
 * τεκμηρίωση επιλεξιμότητας) + ZIP με τα πρωτότυπα αρχεία σε φάκελο ανά δαπάνη.
 */

const n = (v: unknown) => (v == null ? null : Number(v))
const EUR = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const eur = (v: number | null | undefined) => (v == null ? '—' : `${EUR.format(v)} €`)
const dateEl = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10).split('-').reverse().join('/') : '—')

async function loadDossier(applicationId: string) {
  return prisma.programApplication.findUniqueOrThrow({
    where: { id: applicationId },
    select: {
      id: true, opskeRef: true, opskeSubmittedAt: true,
      trdr: { select: { NAME: true, AFM: true, ADDRESS: true, CITY: true, ZIP: true } },
      program: {
        select: {
          title: true, referenceCode: true,
          expenseCats: { select: { id: true, name: true, minAmount: true, maxAmount: true, minPercentage: true, maxPercentage: true, mandatory: true } },
        },
      },
      expenses: {
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, description: true, amount: true, vatAmount: true, date: true, categoryId: true, confirmed: true,
          vendor: true, vendorAfm: true, supplier: { select: { NAME: true, AFM: true } },
          quoteStorageKey: true, quoteName: true, quoteMimeType: true,
          eligibilityVerdict: true, eligibilityNote: true, eligibilityDetail: true,
          lines: { orderBy: { order: 'asc' }, select: { product: true, description: true, quantity: true, unit: true, unitPrice: true, lineTotal: true } },
          purchase: {
            select: {
              invoiceNumber: true, invoiceDate: true, paidAmount: true, serial: true,
              invoiceKey: true, invoiceName: true, bankExtraitKey: true, bankExtraitName: true, supplierCertKey: true, supplierCertName: true,
              ocrNumber: true, ocrDate: true, ocrAmount: true,
            },
          },
        },
      },
    },
  })
}
type Dossier = Awaited<ReturnType<typeof loadDossier>>

const s = StyleSheet.create({
  page: { fontFamily: 'Roboto', fontSize: 9, color: C.ink, paddingTop: 30, paddingBottom: 46, paddingHorizontal: 36 },
  h1: { fontFamily: 'RobotoCondensed', fontWeight: 900, fontSize: 22, color: '#FFFFFF', marginBottom: 6, letterSpacing: 0.3 },
  h2: { fontFamily: 'RobotoCondensed', fontWeight: 900, fontSize: 12.5, color: C.navy, marginTop: 14, marginBottom: 7, letterSpacing: 0.4 },
  th: { fontSize: 7, fontWeight: 700, color: C.muted, letterSpacing: 0.5 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: C.rule, paddingVertical: 5 },
  pill: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, fontSize: 7, fontWeight: 700, alignSelf: 'flex-start' },
  footer: { position: 'absolute', bottom: 18, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: C.muted, borderTopWidth: 0.75, borderTopColor: C.rule, paddingTop: 6 },
})

const VERDICT: Record<string, { label: string; fg: string; bg: string }> = {
  ELIGIBLE: { label: 'Επιλέξιμη', fg: C.ok, bg: C.okBg },
  INELIGIBLE: { label: 'Μη επιλέξιμη', fg: C.bad, bg: C.badBg },
  UNCERTAIN: { label: 'Προς έλεγχο', fg: C.warn, bg: C.warnBg },
}
const CHECK: Record<string, { label: string; fg: string; bg: string }> = {
  PASS: { label: 'Σύμφωνο', fg: C.ok, bg: C.okBg }, WARN: { label: 'Προσοχή', fg: C.warn, bg: C.warnBg },
  FAIL: { label: 'Μη σύμφωνο', fg: C.bad, bg: C.badBg }, UNKNOWN: { label: 'Άγνωστο', fg: C.muted, bg: C.canvas },
}

function Pill({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return <Text style={[s.pill, { color: fg, backgroundColor: bg }]}>{label}</Text>
}

function DossierDocument({ d, now }: { d: Dossier; now: Date }) {
  const total = d.expenses.reduce((a, e) => a + Number(e.amount), 0)
  const cats = d.program.expenseCats.map(c => {
    const spent = d.expenses.filter(e => e.categoryId === c.id).reduce((a, e) => a + Number(e.amount), 0)
    const pct = total ? (spent / total) * 100 : 0
    const maxEur = n(c.maxAmount), minPct = n(c.minPercentage), maxPct = n(c.maxPercentage), minEur = n(c.minAmount)
    const issues = [
      maxEur != null && spent > maxEur ? `υπέρβαση ορίου ${eur(maxEur)}` : null,
      minEur != null && spent > 0 && spent < minEur ? `κάτω από ελάχιστο ${eur(minEur)}` : null,
      maxPct != null && pct > maxPct ? `πάνω από ${maxPct}%` : null,
      minPct != null && pct < minPct && (spent > 0 || c.mandatory) ? `κάτω από ${minPct}%` : null,
      c.mandatory && spent === 0 ? 'υποχρεωτική κενή' : null,
    ].filter(Boolean) as string[]
    return { ...c, spent, pct, issues }
  })
  const uncategorised = d.expenses.filter(e => !e.categoryId)
  const withQuote = d.expenses.filter(e => e.quoteStorageKey).length
  const withInvoice = d.expenses.filter(e => e.purchase?.invoiceKey).length
  const shared = new Map<string, number>()
  for (const e of d.expenses) for (const k of [e.quoteStorageKey, e.purchase?.invoiceKey, e.purchase?.bankExtraitKey, e.purchase?.supplierCertKey]) if (k) shared.set(k, (shared.get(k) ?? 0) + 1)

  return (
    <Document title={`Φάκελος τεκμηρίωσης δαπανών — ${d.trdr.NAME}`} author="World Wide Associates" language="el">
      <Page size="A4" style={s.page}>
        <View style={{ backgroundColor: C.navy950, marginTop: -30, marginHorizontal: -36, paddingHorizontal: 36, paddingTop: 22, paddingBottom: 20, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image */}
            <Image src={path.join(process.cwd(), 'public', 'wwa', 'wwa-logo-light-text.png')} style={{ width: 112, height: 35 }} />
            <Text style={{ color: C.cyan, fontSize: 8, fontWeight: 700, letterSpacing: 1.2 }}>ΦΑΚΕΛΟΣ ΤΕΚΜΗΡΙΩΣΗΣ ΔΑΠΑΝΩΝ · {dateEl(now)}</Text>
          </View>
          <Text style={s.h1}>{d.trdr.NAME.toUpperCase()}</Text>
          <Text style={{ color: C.navy200, fontSize: 9.5 }}>ΑΦΜ {d.trdr.AFM ?? '—'} · {[d.trdr.ADDRESS, d.trdr.ZIP, d.trdr.CITY].filter(Boolean).join(' ') || '—'}</Text>
          <Text style={{ color: C.cyan, fontSize: 7.5, fontWeight: 700, letterSpacing: 1, marginTop: 8 }}>ΠΡΟΓΡΑΜΜΑ</Text>
          <Text style={{ color: '#FFFFFF', fontSize: 10.5, fontWeight: 500, marginTop: 2 }}>{d.program.title}{d.program.referenceCode ? ` (${d.program.referenceCode})` : ''}</Text>
          {d.opskeRef ? <Text style={{ color: C.navy200, fontSize: 8.5, marginTop: 4 }}>Κωδικός ΟΠΣΚΕ: {d.opskeRef}{d.opskeSubmittedAt ? ` · υποβολή ${dateEl(d.opskeSubmittedAt)}` : ''}</Text> : null}
        </View>

        <View style={{ flexDirection: 'row', marginBottom: 6 }}>
          {[
            ['Δαπάνες', String(d.expenses.length)],
            ['Συνολικός π/υ (καθαρό)', eur(total)],
            ['Με προσφορά', `${withQuote} / ${d.expenses.length}`],
            ['Με παραστατικό', `${withInvoice} / ${d.expenses.length}`],
          ].map(([l, v]) => (
            <View key={l} style={{ flex: 1, backgroundColor: C.canvas, borderRadius: 8, padding: 9, marginRight: 6 }}>
              <Text style={{ fontSize: 7, color: C.muted, fontWeight: 700, letterSpacing: 0.5 }}>{l.toUpperCase()}</Text>
              <Text style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginTop: 2 }}>{v}</Text>
            </View>
          ))}
        </View>

        <Text style={s.h2} minPresenceAhead={60}>ΣΥΝΟΨΗ ΑΝΑ ΚΑΤΗΓΟΡΙΑ ΔΑΠΑΝΗΣ</Text>
        <View style={[s.tr, { paddingVertical: 4 }]}>
          <Text style={[s.th, { width: '40%' }]}>ΚΑΤΗΓΟΡΙΑ</Text>
          <Text style={[s.th, { width: '16%', textAlign: 'right' }]}>ΠΟΣΟ</Text>
          <Text style={[s.th, { width: '10%', textAlign: 'right' }]}>%</Text>
          <Text style={[s.th, { width: '34%', paddingLeft: 10 }]}>ΟΡΙΑ / ΠΑΡΑΤΗΡΗΣΕΙΣ</Text>
        </View>
        {cats.map(c => (
          <View key={c.id} style={s.tr} wrap={false}>
            <Text style={{ width: '40%', fontSize: 8.5, fontWeight: c.spent ? 700 : 400, paddingRight: 6 }}>{c.name}{c.mandatory ? ' *' : ''}</Text>
            <Text style={{ width: '16%', fontSize: 8.5, textAlign: 'right' }}>{eur(c.spent)}</Text>
            <Text style={{ width: '10%', fontSize: 8.5, textAlign: 'right' }}>{EUR.format(c.pct)}%</Text>
            <Text style={{ width: '34%', fontSize: 7.5, paddingLeft: 10, color: c.issues.length ? C.bad : C.muted }}>
              {c.issues.length ? c.issues.join(' · ') : [c.minPercentage != null ? `≥${n(c.minPercentage)}%` : null, c.maxPercentage != null ? `≤${n(c.maxPercentage)}%` : null, c.maxAmount != null ? `≤${eur(n(c.maxAmount))}` : null].filter(Boolean).join(' · ') || 'εντός ορίων'}
            </Text>
          </View>
        ))}
        {uncategorised.length > 0 && <Text style={{ fontSize: 8, color: C.bad, marginTop: 4 }}>{uncategorised.length} δαπάνη/ες χωρίς κατηγορία.</Text>}
        <Text style={{ fontSize: 7, color: C.muted, marginTop: 3 }}>* υποχρεωτική κατηγορία</Text>

        {d.expenses.map((e, idx) => {
          const det = (e.eligibilityDetail as unknown as ExpenseEligibilityDetail | null) ?? null
          const v = e.eligibilityVerdict ? VERDICT[e.eligibilityVerdict] : null
          const cat = d.program.expenseCats.find(c => c.id === e.categoryId)
          const p = e.purchase
          return (
            <View key={e.id} break={idx === 0} style={{ marginTop: idx === 0 ? 0 : 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1.5, borderBottomColor: C.navy, paddingBottom: 4, marginBottom: 6 }} wrap={false} minPresenceAhead={120}>
                <Text style={{ fontFamily: 'RobotoCondensed', fontWeight: 900, fontSize: 13, color: C.navy, width: 30 }}>{String(idx + 1).padStart(2, '0')}</Text>
                <Text style={{ flex: 1, fontSize: 11, fontWeight: 700 }}>{e.description}</Text>
                <Text style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>{eur(Number(e.amount))}</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
                {[
                  ['Κατηγορία', cat?.name ?? '—'],
                  ['Προμηθευτής', e.supplier?.NAME ?? e.vendor ?? '—'],
                  ['ΑΦΜ προμηθευτή', e.supplier?.AFM ?? e.vendorAfm ?? '—'],
                  ['ΦΠΑ', eur(n(e.vatAmount))],
                  ['Προσφορά', e.quoteName ?? (e.quoteStorageKey ? 'Ναι' : '—')],
                  ['Παραστατικό', p?.invoiceNumber || p?.ocrNumber ? `${p?.invoiceNumber ?? p?.ocrNumber} · ${dateEl(p?.invoiceDate ?? p?.ocrDate)}` : '—'],
                ].map(([l, val]) => (
                  <View key={l} style={{ width: '33.33%', paddingRight: 8, marginBottom: 5 }}>
                    <Text style={{ fontSize: 6.8, color: C.muted, fontWeight: 700, letterSpacing: 0.5 }}>{l.toUpperCase()}</Text>
                    <Text style={{ fontSize: 8.5 }}>{val}</Text>
                  </View>
                ))}
              </View>

              {e.lines.length > 0 && (
                <View style={{ marginBottom: 5 }}>
                  <View style={[s.tr, { paddingVertical: 3 }]}>
                    <Text style={[s.th, { width: '30%' }]}>ΕΙΔΟΣ</Text>
                    <Text style={[s.th, { width: '34%' }]}>ΠΕΡΙΓΡΑΦΗ</Text>
                    <Text style={[s.th, { width: '10%', textAlign: 'right' }]}>ΠΟΣ.</Text>
                    <Text style={[s.th, { width: '13%', textAlign: 'right' }]}>ΤΙΜΗ ΜΟΝ.</Text>
                    <Text style={[s.th, { width: '13%', textAlign: 'right' }]}>ΣΥΝΟΛΟ</Text>
                  </View>
                  {e.lines.map((l, i) => (
                    <View key={i} style={[s.tr, { paddingVertical: 3.5 }]} wrap={false}>
                      <Text style={{ width: '30%', fontSize: 8, fontWeight: 700, paddingRight: 4 }}>{l.product}</Text>
                      <Text style={{ width: '34%', fontSize: 7.5, color: C.fg2, paddingRight: 4 }}>{l.description ?? ''}</Text>
                      <Text style={{ width: '10%', fontSize: 8, textAlign: 'right' }}>{l.quantity != null ? `${EUR.format(Number(l.quantity)).replace(/,00$/, '')}${l.unit ? ` ${l.unit}` : ''}` : '—'}</Text>
                      <Text style={{ width: '13%', fontSize: 8, textAlign: 'right' }}>{eur(n(l.unitPrice))}</Text>
                      <Text style={{ width: '13%', fontSize: 8, textAlign: 'right', fontWeight: 700 }}>{eur(Number(l.lineTotal))}</Text>
                    </View>
                  ))}
                </View>
              )}

              {(det || e.eligibilityNote) && (
                <View style={{ backgroundColor: C.canvas, borderRadius: 8, padding: 9 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ fontFamily: 'RobotoCondensed', fontWeight: 900, fontSize: 9, color: C.navy, marginRight: 6 }}>ΤΕΚΜΗΡΙΩΣΗ ΕΠΙΛΕΞΙΜΟΤΗΤΑΣ</Text>
                    {v && <Pill {...v} />}
                    {det?.eligibleAmount != null && <Text style={{ marginLeft: 'auto', fontSize: 8, fontWeight: 700 }}>Επιλέξιμο: {eur(det.eligibleAmount)}</Text>}
                  </View>
                  <Text style={{ fontSize: 8.5, lineHeight: 1.45, color: C.fg2 }}>{det?.summary ?? e.eligibilityNote}</Text>
                  {det?.checks.map((c, i) => (
                    <View key={i} style={{ flexDirection: 'row', marginTop: 4 }} wrap={false}>
                      <View style={{ width: 62 }}><Pill {...(CHECK[c.status] ?? CHECK.UNKNOWN)} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 8, fontWeight: 700 }}>{c.rule}{c.guideRef ? <Text style={{ fontWeight: 400, color: C.navy, fontStyle: 'italic' }}>{`  (Οδηγός: ${c.guideRef})`}</Text> : null}</Text>
                        <Text style={{ fontSize: 7.8, color: C.fg2, lineHeight: 1.35 }}>{c.explanation}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              <Text style={{ fontSize: 7, color: C.muted, marginTop: 4 }}>
                Συνημμένα: {([[e.quoteStorageKey, 'προσφορά'], [p?.invoiceKey, 'παραστατικό'], [p?.bankExtraitKey, 'extrait τράπεζας'], [p?.supplierCertKey, 'βεβαίωση προμηθευτή']] as [string | null | undefined, string][])
                  .filter(([k]) => k)
                  .map(([k, l]) => `${l} (${(shared.get(k!) ?? 0) > 1 ? 'φάκελος «Κοινά έγγραφα»' : `φάκελος ${String(idx + 1).padStart(2, '0')}`})`)
                  .join(', ') || 'κανένα αρχείο'}
              </Text>
            </View>
          )
        })}

        <View style={s.footer} fixed>
          <Text>World Wide Associates · Φάκελος τεκμηρίωσης δαπανών · {d.trdr.NAME}</Text>
          <Text render={({ pageNumber, totalPages }) => `Σελίδα ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

const safeName = (s: string, max = 60) => s.normalize('NFC').replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || 'αρχείο'
const extOf = (key: string, fallback = 'pdf') => (/\.([a-z0-9]{2,5})$/i.exec(key)?.[1] ?? fallback).toLowerCase()

export async function buildExpenseDossierPdf(applicationId: string): Promise<{ pdf: Buffer; trdrName: string }> {
  ensureFonts()
  const d = await loadDossier(applicationId)
  const pdf = await renderToBuffer(<DossierDocument d={d} now={new Date()} />)
  return { pdf, trdrName: d.trdr.NAME }
}

/** ZIP: PDF τεκμηρίωσης + φάκελος ανά δαπάνη με τα πρωτότυπα (προσφορά, παραστατικό, extrait, βεβαίωση). */
export async function buildExpenseDossierZip(applicationId: string): Promise<{ zip: Uint8Array; trdrName: string; missing: string[] }> {
  ensureFonts()
  const d = await loadDossier(applicationId)
  const pdf = await renderToBuffer(<DossierDocument d={d} now={new Date()} />)
  const files: Record<string, Uint8Array> = { '00 — Τεκμηρίωση δαπανών.pdf': new Uint8Array(pdf) }
  const missing: string[] = []
  const tasks: Promise<void>[] = []
  // Αρχείο κοινό σε πολλές δαπάνες (π.χ. μία προσφορά → πολλά είδη) → μία φορά στα «Κοινά έγγραφα».
  const uses = new Map<string, number>()
  for (const e of d.expenses) for (const k of [e.quoteStorageKey, e.purchase?.invoiceKey, e.purchase?.bankExtraitKey, e.purchase?.supplierCertKey]) if (k) uses.set(k, (uses.get(k) ?? 0) + 1)
  const placed = new Set<string>()
  d.expenses.forEach((e, idx) => {
    const own = `${String(idx + 1).padStart(2, '0')} — ${safeName(e.description, 50)}`
    const add = (key: string | null | undefined, label: string, original?: string | null) => {
      if (!key) return
      const shared = (uses.get(key) ?? 0) > 1
      if (shared && placed.has(key)) return
      placed.add(key)
      const folder = shared ? '00 — Κοινά έγγραφα' : own
      tasks.push(bunnyDownload(key)
        .then(buf => { files[`${folder}/${label}${original ? ` — ${safeName(original.replace(/\.[^.]+$/, ''), 40)}` : ''}.${extOf(key)}`] = new Uint8Array(buf) })
        .catch(() => { missing.push(`${folder}: ${label}`) }))
    }
    add(e.quoteStorageKey, 'Προσφορά', e.quoteName)
    add(e.purchase?.invoiceKey, 'Παραστατικό', e.purchase?.invoiceName)
    add(e.purchase?.bankExtraitKey, 'Extrait τράπεζας', e.purchase?.bankExtraitName)
    add(e.purchase?.supplierCertKey, 'Βεβαίωση προμηθευτή', e.purchase?.supplierCertName)
  })
  await Promise.all(tasks)
  if (missing.length) files['ΛΕΙΠΟΥΝ.txt'] = strToU8(`Αρχεία που δεν βρέθηκαν στην αποθήκη:\n${missing.join('\n')}\n`)
  return { zip: zipSync(files, { level: 6 }), trdrName: d.trdr.NAME, missing }
}
