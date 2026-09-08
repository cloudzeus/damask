'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuUpload, LuLoaderCircle, LuFileSpreadsheet, LuCircleCheck, LuCircleX, LuTriangleAlert, LuUserCheck, LuMailCheck, LuDownload } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { readWorkbookFromFile, readSheetRows } from '@/lib/import/xlsx-parse'
import { runReferralBatch, type ReferrerOption, type ReferralCompanyResult, type ReferralRowInput } from '@/lib/referrals/actions'
import { exportEligibleXlsx } from '@/lib/referrals/export-xlsx'
import { sendProgramNewsletterTest } from '@/lib/prospects/actions'
import { PromoButtons } from './promo-buttons'

/**
 * Client εργαλείο χαρτογράφησης παραπομπών: επιλογή εταιρίας παραπομπής →
 * ανέβασμα Excel/CSV (ΑΦΜ + προαιρετικά τηλέφωνο/email) → parse client-side →
 * runReferralBatch (ΑΑΔΕ + έλεγχος επιλεξιμότητας) → πίνακας αποτελεσμάτων.
 * Ξεχωρίζει «ήδη πελάτης» (μέσω ΑΦΜ). Περιλαμβάνει δοκιμαστικό preview email.
 */

const PREVIEW_DEFAULT_EMAIL = 'gkozyris@i4ria.com'

/** Ανίχνευση στήλης βάσει keywords στο header (case/accent-insensitive). */
function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}
function findCol(header: (string | null)[], keys: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const h = norm(header[i])
    if (h && keys.some(k => h.includes(k))) return i
  }
  return -1
}
function digits9(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '').slice(0, 9)
}

type ParsedFile = { fileName: string; rows: ReferralRowInput[]; skipped: number }

function parseSheet(fileName: string, cells: (string | null)[][]): ParsedFile {
  if (cells.length === 0) return { fileName, rows: [], skipped: 0 }
  const header = cells[0]
  let afmCol = findCol(header, ['αφμ', 'afm', 'vat', 'α.φ.μ'])
  const emailCol = findCol(header, ['email', 'mail', 'ηλεκτρον', 'e-mail'])
  const phoneCol = findCol(header, ['τηλ', 'phone', 'κινητ', 'mobile'])
  const hasHeader = afmCol >= 0 || emailCol >= 0 || phoneCol >= 0 || !/^\d{9}$/.test(digits9(header[0]))

  const dataRows = hasHeader ? cells.slice(1) : cells
  // Fallback: αν δεν βρέθηκε στήλη ΑΦΜ από header, διάλεξε τη στήλη με τα
  // περισσότερα 9ψήφια κελιά.
  if (afmCol < 0) {
    const colCount = Math.max(...cells.map(r => r.length), 0)
    let best = -1, bestScore = 0
    for (let c = 0; c < colCount; c++) {
      const score = dataRows.filter(r => digits9(r[c]).length === 9).length
      if (score > bestScore) { bestScore = score; best = c }
    }
    afmCol = best
  }
  if (afmCol < 0) return { fileName, rows: [], skipped: dataRows.length }

  const seen = new Set<string>()
  const rows: ReferralRowInput[] = []
  let skipped = 0
  for (const r of dataRows) {
    const afm = digits9(r[afmCol])
    if (afm.length !== 9) { if (r.some(c => c && c.trim())) skipped++; continue }
    if (seen.has(afm)) continue
    seen.add(afm)
    rows.push({
      afm,
      email: emailCol >= 0 ? (r[emailCol]?.trim() || null) : null,
      phone: phoneCol >= 0 ? (r[phoneCol]?.trim() || null) : null,
    })
  }
  return { fileName, rows, skipped }
}

const STATUS_META: Record<string, { label: string; cls: string; Icon: typeof LuCircleCheck }> = {
  ELIGIBLE: { label: 'Επιλέξιμη', cls: 'ok', Icon: LuCircleCheck },
  INELIGIBLE: { label: 'Μη επιλέξιμη', cls: 'muted', Icon: LuCircleX },
  NOT_FOUND: { label: 'Δεν βρέθηκε στην ΑΑΔΕ', cls: 'warn', Icon: LuTriangleAlert },
  ERROR: { label: 'Σφάλμα', cls: 'warn', Icon: LuTriangleAlert },
}

export function ReferralsTool({
  referrers, programs,
}: {
  referrers: ReferrerOption[]
  programs: { id: string; title: string }[]
}) {
  const [referrerId, setReferrerId] = React.useState('')
  const [parsed, setParsed] = React.useState<ParsedFile | null>(null)
  const [parsing, setParsing] = React.useState(false)
  const [running, setRunning] = React.useState(false)
  const [results, setResults] = React.useState<ReferralCompanyResult[] | null>(null)
  const [summary, setSummary] = React.useState<{ total: number; eligible: number } | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setParsing(true)
    setResults(null)
    setSummary(null)
    try {
      const wb = await readWorkbookFromFile(file)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const { rows } = readSheetRows(ws)
      const cells = rows.map(r => r.cells)
      const p = parseSheet(file.name, cells)
      setParsed(p)
      if (p.rows.length === 0) toast.error('Δεν βρέθηκαν έγκυρα ΑΦΜ (9 ψηφία) στο αρχείο.')
      else toast.success(`Βρέθηκαν ${p.rows.length} μοναδικά ΑΦΜ${p.skipped ? ` (${p.skipped} γραμμές αγνοήθηκαν)` : ''}.`)
    } catch {
      toast.error('Η ανάγνωση του αρχείου απέτυχε.')
      setParsed(null)
    } finally {
      setParsing(false)
    }
  }

  async function handleRun() {
    if (!referrerId) { toast.error('Επίλεξε εταιρία παραπομπής.'); return }
    if (!parsed || parsed.rows.length === 0) { toast.error('Ανέβασε αρχείο με έγκυρα ΑΦΜ.'); return }
    setRunning(true)
    try {
      const res = await runReferralBatch(referrerId, parsed.fileName, parsed.rows)
      if (!res.ok) { toast.error(res.message ?? 'Η επεξεργασία απέτυχε.'); return }
      setResults(res.companies)
      setSummary({ total: res.total, eligible: res.eligible })
      toast.success(`Ολοκληρώθηκε: ${res.eligible} επιλέξιμες από ${res.total}.`)
    } catch {
      toast.error('Η επεξεργασία απέτυχε.')
    } finally {
      setRunning(false)
    }
  }

  const referrerName = referrers.find(r => r.id === referrerId)?.name

  return (
    <div className="flex flex-col gap-3">
      {/* Ρυθμίσεις batch */}
      <section className="glass rounded-[22px] p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="field !mb-0">
            <label htmlFor="ref-select">Εταιρία παραπομπής</label>
            <Select value={referrerId} onValueChange={v => setReferrerId(v ?? '')}>
              <SelectTrigger id="ref-select" className="h-9 w-full rounded-full border-border bg-card px-3">
                <SelectValue placeholder="Επίλεξε…" />
              </SelectTrigger>
              <SelectContent>
                {referrers.length === 0
                  ? <SelectItem value="__none" disabled>— Δεν υπάρχουν ενεργές εταιρίες παραπομπής —</SelectItem>
                  : referrers.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="field !mb-0">
            <label>Αρχείο (Excel/CSV)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = '' }}
            />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={parsing}>
                {parsing ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuUpload className="size-3.5" aria-hidden />}
                {parsed ? 'Αλλαγή αρχείου' : 'Επίλεξε αρχείο'}
              </Button>
              {parsed && (
                <span className="inline-flex items-center gap-1.5 truncate text-[0.75rem] text-muted-foreground">
                  <LuFileSpreadsheet className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{parsed.fileName}</span>
                  <span className="badge-pill ok shrink-0">{parsed.rows.length} ΑΦΜ</span>
                </span>
              )}
            </div>
          </div>
        </div>
        <p className="mt-2 text-[0.71875rem] text-muted-foreground">
          Το αρχείο πρέπει να έχει μια στήλη <strong>ΑΦΜ</strong> (αναγνωρίζεται αυτόματα). Προαιρετικά στήλες <strong>Τηλέφωνο</strong> και <strong>Email</strong>.
        </p>
        <div className="mt-3 flex justify-end">
          <Button type="button" onClick={handleRun} disabled={running || parsing || !referrerId || !parsed || parsed.rows.length === 0}>
            {running ? <><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Επεξεργασία…</> : <>Έλεγχος επιλεξιμότητας</>}
          </Button>
        </div>
      </section>

      {/* Αποτελέσματα */}
      {results && summary && (
        <section className="glass rounded-[22px] p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="dotted-leader flex-1 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
              Αποτελέσματα{referrerName ? ` — ${referrerName}` : ''} ({summary.total})
            </div>
            <span className="badge-pill ok shrink-0">{summary.eligible} επιλέξιμες</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={summary.eligible === 0}
              onClick={() => exportEligibleXlsx(results.filter(c => c.status === 'ELIGIBLE'), `epilexima-${referrerName ?? 'parapombi'}.xlsx`)}
            >
              <LuDownload className="size-3.5" aria-hidden /> Εξαγωγή επιλέξιμων
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[0.78125rem]">
              <thead>
                <tr className="text-left text-[0.6875rem] font-bold text-muted-foreground uppercase">
                  <th className="py-1.5 pr-3">ΑΦΜ</th>
                  <th className="py-1.5 pr-3">Επωνυμία</th>
                  <th className="py-1.5 pr-3">Περιοχή</th>
                  <th className="py-1.5 pr-3">Κατάσταση</th>
                  <th className="py-1.5 pr-3">Επιλέξιμα προγράμματα</th>
                </tr>
              </thead>
              <tbody>
                {results.map(c => {
                  const meta = STATUS_META[c.status] ?? STATUS_META.INELIGIBLE
                  return (
                    <tr key={c.id} className="border-t border-border align-top">
                      <td className="py-2 pr-3 tabular-nums whitespace-nowrap">{c.afm}</td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold">{c.name ?? '—'}</span>
                          {c.existingTrdrId && (
                            <span className={`badge-pill shrink-0 self-start ${c.existingIsCustomer ? 'warn' : 'muted'}`}>
                              <LuUserCheck className="size-3" aria-hidden /> {c.existingIsCustomer ? 'Ήδη πελάτης' : 'Ήδη καταχωρημένη'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {c.regionName ?? '—'}
                        {c.regionName && !c.regionConfident && <span className="badge-pill muted ml-1 shrink-0" title="Εκτίμηση Περιφέρειας από ΤΚ">εκτ.</span>}
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`badge-pill shrink-0 ${meta.cls}`}><meta.Icon className="size-3" aria-hidden /> {meta.label}</span>
                        {c.error && <div className="mt-0.5 text-[0.6875rem] text-muted-foreground">{c.error}</div>}
                      </td>
                      <td className="py-2 pr-3">
                        {c.eligiblePrograms.length === 0
                          ? <span className="text-muted-foreground">—</span>
                          : (
                            <div className="flex flex-wrap gap-1">
                              {c.eligiblePrograms.map(p => (
                                <span key={p.programId} className="badge-pill ok shrink-0">
                                  {p.title}{p.fundingRate != null ? ` · ${p.fundingRate}%` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {(() => {
            const m = new Map<string, string>()
            for (const c of results) for (const p of c.eligiblePrograms) m.set(p.programId, p.title)
            const distinct = [...m.entries()].map(([programId, title]) => ({ programId, title }))
            return distinct.length > 0 ? <div className="mt-4"><PromoButtons programs={distinct} /></div> : null
          })()}
          <p className="mt-3 text-[0.71875rem] text-muted-foreground">
            Οι επιλέξιμες εταιρίες αποθηκεύτηκαν και εμφανίζονται στη σελίδα «Επιλέξιμοι ανά παραπομπή», όπου μπορείς να δημιουργήσεις δυνητικό πελάτη ανά πρόγραμμα.
          </p>
        </section>
      )}

      {/* Δοκιμαστικό preview email */}
      <PreviewEmail programs={programs} />
    </div>
  )
}

function PreviewEmail({ programs }: { programs: { id: string; title: string }[] }) {
  const [programId, setProgramId] = React.useState('')
  const [email, setEmail] = React.useState(PREVIEW_DEFAULT_EMAIL)
  const [sending, setSending] = React.useState(false)

  async function handleSend() {
    if (!programId) { toast.error('Επίλεξε πρόγραμμα.'); return }
    if (!email.trim()) { toast.error('Δώσε email.'); return }
    setSending(true)
    try {
      const res = await sendProgramNewsletterTest(programId, email.trim())
      if (res.ok) toast.success(`Το δοκιμαστικό email στάλθηκε στο ${email.trim()}.`)
      else toast.error(res.message ?? 'Η αποστολή απέτυχε.')
    } catch {
      toast.error('Η αποστολή απέτυχε.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="dotted-leader mb-3 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
        Δοκιμαστικό preview email
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="field !mb-0">
          <label htmlFor="pv-program">Πρόγραμμα</label>
          <Select value={programId} onValueChange={v => setProgramId(v ?? '')}>
            <SelectTrigger id="pv-program" className="h-9 w-full rounded-full border-border bg-card px-3">
              <SelectValue placeholder="Επίλεξε…" />
            </SelectTrigger>
            <SelectContent>
              {programs.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="field !mb-0">
          <label htmlFor="pv-email">Email παραλήπτη</label>
          <Input id="pv-email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="h-9" />
        </div>
        <Button type="button" onClick={handleSend} disabled={sending || !programId}>
          {sending ? <><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Αποστολή…</> : <><LuMailCheck className="size-3.5" aria-hidden /> Στείλε δείγμα</>}
        </Button>
      </div>
      <p className="mt-2 text-[0.71875rem] text-muted-foreground">
        Στέλνει το ακριβές email του προγράμματος με δείγμα επωνυμίας — χωρίς καταγραφή lead, ο σύνδεσμος δεν είναι ενεργός.
      </p>
    </section>
  )
}
