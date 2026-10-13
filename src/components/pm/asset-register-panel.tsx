'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuBookCheck, LuLoaderCircle, LuUpload, LuDownload, LuChevronDown } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { uploadAssetRegister, getAssetReport, type AssetReport } from '@/lib/pm/asset-register'
import type { AssetMatchStatus } from '@/lib/pm/asset-match'

/**
 * «Μητρώο παγίων — διασταύρωση»: κάθε δαπάνη (παραστατικό/ημερομηνία/ποσό/S/N) απέναντι στο μητρώο παγίων
 * της εταιρίας. Αναφορά με κατάσταση ανά δαπάνη και εξαγωγή CSV για τον φάκελο / τον ελεγκτή.
 */

const EUR = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' })
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('el-GR') : '—')
const STATUS: Record<AssetMatchStatus, { label: string; cls: string }> = {
  OK: { label: 'Καταχωρισμένο', cls: 'ok' },
  AMOUNT_DIFF: { label: 'Διαφορά ποσού', cls: 'warn' },
  DATE_DIFF: { label: 'Διαφορά ημερομηνίας', cls: 'warn' },
  NOT_FOUND: { label: 'Δεν βρέθηκε', cls: 'danger' },
  NO_INVOICE: { label: 'Χωρίς παραστατικό', cls: 'muted' },
  NOT_REQUIRED: { label: 'Δεν απαιτείται', cls: 'muted' },
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => { const s = String(r.result); resolve(s.includes(',') ? s.split(',')[1] : s) }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export function AssetRegisterPanel({ applicationId }: { applicationId: string }) {
  const [report, setReport] = React.useState<AssetReport | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [showExtra, setShowExtra] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const load = React.useCallback(() => {
    getAssetReport(applicationId).then(r => { setReport(r); setFailed(false) }).catch(() => setFailed(true))
  }, [applicationId])
  React.useEffect(() => { load() }, [load])

  async function upload(f: File) {
    setBusy(true)
    try {
      const isSheet = /\.(xlsx|xls|csv)$/i.test(f.name)
      let payload: { name: string; base64?: string; mimeType: string; text?: string }
      if (isSheet) {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
        const text = wb.SheetNames.map(n => XLSX.utils.sheet_to_csv(wb.Sheets[n])).join('\n')
        payload = { name: f.name, mimeType: 'text/csv', text }
      } else {
        payload = { name: f.name, base64: await readFile(f), mimeType: f.type || 'application/pdf' }
      }
      const res = await uploadAssetRegister(applicationId, payload)
      if (!res.ok) { toast.error(res.message); return }
      toast.success(`Μητρώο παγίων${res.year ? ` ${res.year}` : ''}: ${res.items} πάγια — έγινε η διασταύρωση.`)
      load()
    } catch { toast.error('Η ανάγνωση απέτυχε.') } finally { setBusy(false) }
  }

  function exportCsv() {
    if (!report) return
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [
      ['Δαπάνη', 'Κατηγορία', 'Καθαρό ποσό', 'Αρ. παραστατικού', 'Ημ. παραστατικού', 'Κατάσταση', 'Πάγια (κωδικός · περιγραφή · ημ. · αξία)', 'Αξία μητρώου', 'Παρατηρήσεις'].map(esc).join(';'),
      ...report.rows.map(r => [
        r.description, r.categoryName, r.net.toFixed(2).replace('.', ','), r.invoiceNumber, dt(r.invoiceDate), STATUS[r.status].label,
        r.items.map(i => [i.code, i.description, dt(i.date), i.value?.toFixed(2).replace('.', ',')].filter(Boolean).join(' · ')).join(' | '),
        r.registered?.toFixed(2).replace('.', ','), r.reasons.join(' '),
      ].map(esc).join(';')),
    ]
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'diastavrosi-mitroou-pagion.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const relevant = report?.rows.filter(r => r.status !== 'NOT_REQUIRED') ?? []
  return (
    <section className="glass rounded-[22px] p-4" aria-labelledby="assets-title">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <LuBookCheck className="size-4 text-primary" aria-hidden />
        <h3 id="assets-title" className="text-[length:var(--fs-13)] font-bold">Μητρώο παγίων — διασταύρωση</h3>
        <div className="ml-auto flex items-center gap-2">
          {report && report.registers.length > 0 && (
            <Button type="button" size="sm" variant="outline" onClick={exportCsv}><LuDownload className="size-3.5" aria-hidden /> Εξαγωγή αναφοράς</Button>
          )}
          <input ref={inputRef} type="file" accept="application/pdf,image/*,.xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
          <Button type="button" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuUpload className="size-3.5" aria-hidden />}
            {report?.registers.length ? 'Νέο μητρώο' : 'Ανέβασμα μητρώου'}
          </Button>
        </div>
      </div>
      <p className="mb-3 text-[length:var(--fs-11-5)] text-muted-foreground">
        Κάθε δαπάνη εξοπλισμού διασταυρώνεται με το μητρώο παγίων (αρ. παραστατικού, ημερομηνία κτήσης, αξία, περιγραφή, S/N). Ανεβάστε το μητρώο του λογιστή (PDF ή Excel)· για πολλές χρήσεις ανεβάστε ένα ανά χρήση.
      </p>

      {failed && !report ? (
        <p className="text-[length:var(--fs-12)] text-destructive">Η φόρτωση της αναφοράς απέτυχε — ανανεώστε τη σελίδα.</p>
      ) : !report ? (
        <p className="flex items-center gap-2 text-[length:var(--fs-12)] text-muted-foreground"><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Φόρτωση…</p>
      ) : report.registers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[length:var(--fs-12)] text-muted-foreground">Δεν έχει ανέβει μητρώο παγίων για τον πελάτη.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[length:var(--fs-11-5)]">
            {report.registers.map(r => <span key={r.id} className="badge-pill muted" style={{ textTransform: 'none' }}>Χρήση {r.year ?? '—'} · {r.items} πάγια</span>)}
            <span className="mx-1 text-muted-foreground">|</span>
            {(Object.keys(STATUS) as AssetMatchStatus[]).filter(s => report.summary[s] > 0).map(s => (
              <span key={s} className={cn('badge-pill', STATUS[s].cls)}>{report.summary[s]} {STATUS[s].label.toLowerCase()}</span>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-[length:var(--fs-12)]">
              <thead className="bg-muted/50 text-left text-[length:var(--fs-10-5)] font-bold tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-2 py-2">Δαπάνη</th>
                  <th className="px-2 py-2">Παραστατικό</th>
                  <th className="w-28 px-2 py-2 text-right">Καθαρό</th>
                  <th className="px-2 py-2">Μητρώο παγίων</th>
                  <th className="w-36 px-2 py-2">Κατάσταση</th>
                </tr>
              </thead>
              <tbody>
                {relevant.map(r => (
                  <tr key={r.expenseId} className="border-t border-border align-top">
                    <td className="px-2 py-1.5"><div className="font-semibold">{r.description}</div><div className="text-[length:var(--fs-11)] text-muted-foreground">{r.categoryName ?? '—'}</div></td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{r.invoiceNumber ? `αρ. ${r.invoiceNumber}` : '—'}<div className="text-[length:var(--fs-11)] text-muted-foreground">{dt(r.invoiceDate)}</div></td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{EUR.format(r.net)}</td>
                    <td className="px-2 py-1.5">
                      {r.items.length ? (
                        <ul className="flex flex-col gap-0.5">
                          {r.items.map((i, k) => <li key={k}><b>{i.code ?? '—'}</b> {i.description} <span className="text-muted-foreground">· {dt(i.date)} · {i.value != null ? EUR.format(i.value) : '—'}</span></li>)}
                        </ul>
                      ) : <span className="text-muted-foreground">—</span>}
                      {r.reasons.length > 0 && <div className="mt-0.5 text-[length:var(--fs-11)] text-muted-foreground">{r.reasons.join(' ')}</div>}
                    </td>
                    <td className="px-2 py-1.5"><span className={cn('badge-pill', STATUS[r.status].cls)}>{STATUS[r.status].label}</span></td>
                  </tr>
                ))}
                {relevant.length === 0 && <tr><td colSpan={5} className="px-3 py-5 text-center text-muted-foreground">Καμία δαπάνη εξοπλισμού για διασταύρωση.</td></tr>}
              </tbody>
            </table>
          </div>
          {report.unmatchedItems.length > 0 && (
            <div>
              <button type="button" onClick={() => setShowExtra(v => !v)} aria-expanded={showExtra} className="inline-flex items-center gap-1 text-[length:var(--fs-11-5)] font-semibold text-muted-foreground hover:text-foreground">
                {report.unmatchedItems.length} πάγια της περιόδου του έργου χωρίς αντίστοιχη δαπάνη <LuChevronDown className={cn('size-3.5 transition-transform', showExtra && 'rotate-180')} aria-hidden />
              </button>
              {showExtra && (
                <ul className="mt-1.5 flex flex-col gap-0.5 rounded-xl border border-border px-3 py-2 text-[length:var(--fs-11-5)]">
                  {report.unmatchedItems.map((i, k) => <li key={k}><b>{i.code ?? '—'}</b> {i.description} <span className="text-muted-foreground">· {dt(i.date)} · {i.value != null ? EUR.format(i.value) : '—'}</span></li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
