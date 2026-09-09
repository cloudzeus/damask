'use client'

import * as React from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Upload, LoaderCircle, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, UserCheck, Download, ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { readWorkbookFromFile, readSheetRows } from '@/lib/import/xlsx-parse'
import { runReferralBatch, type ReferralCompanyResult, type ReferralRowInput } from '@/lib/referrals/actions'
import { exportEligibleXlsx } from '@/lib/referrals/export-xlsx'

/**
 * Modal ανά εταιρία παραπομπής (scoped σε referrerId): ανέβασμα Excel/CSV →
 * ρητή χαρτογράφηση στηλών (ΑΦΜ/Τηλέφωνο/Email) → runReferralBatch (ΑΑΔΕ +
 * Περιφέρεια από ΤΚ + έλεγχος επιλεξιμότητας σε ενεργά προγράμματα) → πίνακας
 * αποτελεσμάτων. ⚠ Δεν δημιουργεί συναλλασσόμενους — τα αποτελέσματα μένουν
 * στο staging «Επιλέξιμοι ανά παραπομπή» και η αναγωγή σε δυνητικό πελάτη
 * γίνεται ξεχωριστά εκεί (convertReferralToProspect).
 */

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
function colLetter(i: number): string {
  let s = ''
  let n = i
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0)
  return s
}

const NONE = '-1'

type Sheet = { fileName: string; cells: (string | null)[][]; colCount: number }
type Mapping = { header: boolean; afm: number; email: number; phone: number }

function buildRows(sheet: Sheet, map: Mapping): { rows: ReferralRowInput[]; skipped: number } {
  const dataRows = map.header ? sheet.cells.slice(1) : sheet.cells
  const seen = new Set<string>()
  const rows: ReferralRowInput[] = []
  let skipped = 0
  for (const r of dataRows) {
    const afm = digits9(r[map.afm])
    if (afm.length !== 9) { if (r.some(c => c && c.trim())) skipped++; continue }
    if (seen.has(afm)) continue
    seen.add(afm)
    rows.push({
      afm,
      email: map.email >= 0 ? (r[map.email]?.trim() || null) : null,
      phone: map.phone >= 0 ? (r[map.phone]?.trim() || null) : null,
    })
  }
  return { rows, skipped }
}

type ColOption = { value: string; label: string; sample: string }

/** Dropdown χαρτογράφησης μιας στήλης σε ρόλο (ΑΦΜ/Τηλέφωνο/Email). */
function MapSelect({ role, value, onChange, required, colOptions }: {
  role: string; value: number; onChange: (v: number) => void; required?: boolean; colOptions: ColOption[]
}) {
  return (
    <div className="field !mb-0">
      <label>{role}{required ? '*' : ''}</label>
      <Select value={String(value)} onValueChange={v => onChange(Number(v))}>
        <SelectTrigger className="h-9 w-full rounded-full border-border bg-card px-3">
          <SelectValue placeholder="Επίλεξε στήλη…" />
        </SelectTrigger>
        <SelectContent>
          {!required && <SelectItem value={NONE}>— Καμία —</SelectItem>}
          {colOptions.map(o => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}{o.sample ? ` · π.χ. ${o.sample.slice(0, 18)}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

const STATUS_META: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  ELIGIBLE: { label: 'Επιλέξιμη', cls: 'ok', Icon: CheckCircle2 },
  INELIGIBLE: { label: 'Μη επιλέξιμη', cls: 'muted', Icon: XCircle },
  NOT_FOUND: { label: 'Δεν βρέθηκε στην ΑΑΔΕ', cls: 'warn', Icon: AlertTriangle },
  ERROR: { label: 'Σφάλμα', cls: 'warn', Icon: AlertTriangle },
}

export function ReferralEligibilityDialog({
  open, onOpenChange, referrerId, referrerName, onCompleted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  referrerId: string
  referrerName: string
  /** Καλείται μετά από επιτυχή batch — ο γονέας ανανεώνει μετρητές/panels. */
  onCompleted?: () => void
}) {
  const [sheet, setSheet] = React.useState<Sheet | null>(null)
  const [map, setMap] = React.useState<Mapping>({ header: true, afm: -1, email: -1, phone: -1 })
  const [parsing, setParsing] = React.useState(false)
  const [running, setRunning] = React.useState(false)
  const [results, setResults] = React.useState<ReferralCompanyResult[] | null>(null)
  const [summary, setSummary] = React.useState<{ total: number; eligible: number } | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  function reset() {
    setSheet(null)
    setMap({ header: true, afm: -1, email: -1, phone: -1 })
    setResults(null)
    setSummary(null)
  }

  async function handleFile(file: File) {
    setParsing(true)
    setResults(null)
    setSummary(null)
    try {
      const wb = await readWorkbookFromFile(file)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const { rows } = readSheetRows(ws)
      const cells = rows.map(r => r.cells)
      if (cells.length === 0) { toast.error('Το φύλλο είναι κενό.'); setSheet(null); return }
      const colCount = Math.max(...cells.map(r => r.length), 0)
      // Αυτόματη πρόταση: έχει επικεφαλίδες αν το πρώτο κελί δεν είναι 9ψήφιο ΑΦΜ.
      const header = cells[0]
      const looksHeader = !/^\d{9}$/.test(digits9(header[0]))
      let afm = looksHeader ? findCol(header, ['αφμ', 'afm', 'vat', 'α.φ.μ']) : -1
      const email = looksHeader ? findCol(header, ['email', 'mail', 'ηλεκτρον', 'e-mail']) : -1
      const phone = looksHeader ? findCol(header, ['τηλ', 'phone', 'κινητ', 'mobile']) : -1
      // Fallback ΑΦΜ: η στήλη με τα περισσότερα 9ψήφια κελιά.
      if (afm < 0) {
        const body = looksHeader ? cells.slice(1) : cells
        let best = -1, bestScore = 0
        for (let c = 0; c < colCount; c++) {
          const score = body.filter(r => digits9(r[c]).length === 9).length
          if (score > bestScore) { bestScore = score; best = c }
        }
        afm = best
      }
      setSheet({ fileName: file.name, cells, colCount })
      setMap({ header: looksHeader, afm, email, phone })
    } catch {
      toast.error('Η ανάγνωση του αρχείου απέτυχε.')
      setSheet(null)
    } finally {
      setParsing(false)
    }
  }

  const preview = React.useMemo(() => sheet ? buildRows(sheet, map) : null, [sheet, map])

  async function handleRun() {
    if (!sheet || map.afm < 0) { toast.error('Όρισε τη στήλη ΑΦΜ.'); return }
    if (!preview || preview.rows.length === 0) { toast.error('Δεν βρέθηκαν έγκυρα ΑΦΜ (9 ψηφία) με την τρέχουσα χαρτογράφηση.'); return }
    setRunning(true)
    try {
      const res = await runReferralBatch(referrerId, sheet.fileName, preview.rows)
      if (!res.ok) { toast.error(res.message ?? 'Η επεξεργασία απέτυχε.'); return }
      setResults(res.companies)
      setSummary({ total: res.total, eligible: res.eligible })
      toast.success(`Ολοκληρώθηκε: ${res.eligible} επιλέξιμες από ${res.total}.`)
      onCompleted?.()
    } catch {
      toast.error('Η επεξεργασία απέτυχε.')
    } finally {
      setRunning(false)
    }
  }

  // Επιλογές στηλών για τα dropdown χαρτογράφησης.
  const colOptions = React.useMemo(() => {
    if (!sheet) return []
    return Array.from({ length: sheet.colCount }, (_, c) => {
      const head = map.header ? (sheet.cells[0]?.[c]?.trim() || '') : ''
      const sample = (map.header ? sheet.cells.slice(1) : sheet.cells).map(r => r[c]).find(v => v && v.trim())?.trim() ?? ''
      const label = head || `Στήλη ${colLetter(c)}`
      return { value: String(c), label, sample }
    })
  }, [sheet, map.header])

  return (
    <Dialog open={open} onOpenChange={next => { if (running) return; onOpenChange(next); if (!next) reset() }}>
      <DialogContent className="glass max-h-[88vh] overflow-y-auto sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle>Έλεγχος επιλεξιμότητας επαφών — {referrerName}</DialogTitle>
          <DialogDescription>
            Ανέβασε Excel/CSV με ΑΦΜ (προαιρετικά τηλέφωνο/email), αντιστοίχισε τις στήλες και δες σε ποια
            ενεργά προγράμματα μπορεί να συμμετέχει κάθε εταιρία. Τα στοιχεία (επωνυμία, Περιφέρεια) αντλούνται από την ΑΑΔΕ.
          </DialogDescription>
        </DialogHeader>

        {/* Βήμα 1 — αρχείο */}
        <section className="rounded-2xl border border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = '' }}
            />
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={parsing || running}>
              {parsing ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Upload className="size-3.5" aria-hidden />}
              {sheet ? 'Αλλαγή αρχείου' : 'Επίλεξε αρχείο'}
            </Button>
            {sheet && (
              <span className="inline-flex items-center gap-1.5 truncate text-[0.75rem] text-muted-foreground">
                <FileSpreadsheet className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{sheet.fileName}</span>
              </span>
            )}
          </div>
        </section>

        {/* Βήμα 2 — χαρτογράφηση στηλών */}
        {sheet && !results && (
          <section className="rounded-2xl border border-border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
                Αντιστοίχιση στηλών
              </span>
              <label className="flex cursor-pointer items-center gap-2 text-[0.75rem] font-semibold">
                <Switch checked={map.header} onCheckedChange={v => setMap(m => ({ ...m, header: v }))} size="sm" />
                Η πρώτη γραμμή είναι επικεφαλίδες
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MapSelect role="ΑΦΜ" value={map.afm} required colOptions={colOptions} onChange={v => setMap(m => ({ ...m, afm: v }))} />
              <MapSelect role="Τηλέφωνο" value={map.phone} colOptions={colOptions} onChange={v => setMap(m => ({ ...m, phone: v }))} />
              <MapSelect role="Email" value={map.email} colOptions={colOptions} onChange={v => setMap(m => ({ ...m, email: v }))} />
            </div>
            {preview && (
              <p className="mt-2 text-[0.71875rem] text-muted-foreground">
                {preview.rows.length > 0
                  ? <>Βρέθηκαν <strong>{preview.rows.length}</strong> μοναδικά ΑΦΜ{preview.skipped ? ` (${preview.skipped} γραμμές χωρίς έγκυρο ΑΦΜ αγνοούνται)` : ''}.</>
                  : <>Δεν βρέθηκαν έγκυρα 9ψήφια ΑΦΜ — έλεγξε τη στήλη ΑΦΜ ή την επιλογή επικεφαλίδων.</>}
              </p>
            )}
            <div className="mt-3 flex justify-end">
              <Button type="button" onClick={handleRun} disabled={running || parsing || map.afm < 0 || !preview || preview.rows.length === 0}>
                {running ? <><LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Επεξεργασία…</> : <>Έλεγχος επιλεξιμότητας</>}
              </Button>
            </div>
          </section>
        )}

        {/* Βήμα 3 — αποτελέσματα */}
        {results && summary && (
          <section className="rounded-2xl border border-border p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="flex-1 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
                Αποτελέσματα ({summary.total})
              </span>
              <span className="badge-pill ok shrink-0">{summary.eligible} επιλέξιμες</span>
              <Button
                type="button" variant="outline" size="sm" disabled={summary.eligible === 0}
                onClick={() => exportEligibleXlsx(results.filter(c => c.status === 'ELIGIBLE'), `epilexima-${referrerName}.xlsx`)}
              >
                <Download className="size-3.5" aria-hidden /> Εξαγωγή επιλέξιμων
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
                                <UserCheck className="size-3" aria-hidden /> {c.existingIsCustomer ? 'Ήδη πελάτης' : 'Ήδη καταχωρημένη'}
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
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/50 p-3">
              <p className="text-[0.71875rem] text-muted-foreground">
                Οι επιλέξιμες εταιρίες <strong>δεν προστέθηκαν</strong> στους συναλλασσόμενους. Αποθηκεύτηκαν στους «Επιλέξιμους ανά παραπομπή»,
                όπου μπορείς να τις αναγάγεις σε δυνητικό πελάτη ανά πρόγραμμα — με την παραπομπή «{referrerName}».
              </p>
              <Button type="button" variant="outline" size="sm" nativeButton={false} render={<Link href="/referrals/eligible" />}>
                Επιλέξιμοι ανά παραπομπή <ArrowRight className="size-3.5" aria-hidden />
              </Button>
            </div>
          </section>
        )}
      </DialogContent>
    </Dialog>
  )
}
