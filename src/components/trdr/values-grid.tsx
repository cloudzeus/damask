'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuTable2, LuLoaderCircle, LuScanText, LuDownload, LuUpload, LuTriangleAlert, LuCircleCheck, LuCheck } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { DocumentPreviewButton } from '@/components/ui/document-preview'
import { readTypeValues } from '@/lib/documents/value-capture'
import { uploadTrdrDossierDoc } from '@/lib/documents/actions'
import { cellKey, gridToCsv, type GridColumn } from '@/lib/documents/values-grid-core'
import type { ValuesGridView } from '@/lib/documents/values-grid'

/**
 * Πίνακας τιμών από πολλά δικαιολογητικά (λογική πλέγματος μισθοδοσίας): πεδία × περίοδοι, ομάδες ανά έτος με
 * ΣΥΝΟΛΟ ΕΤΟΥΣ για ποσά (π.χ. ετήσιος τζίρος από 12 Φ2), κενά με εικονίδιο+κείμενο, κλικ στην περίοδο = το έγγραφο,
 * ανέβασμα (και πακέτων πολλών περιόδων) και εξαγωγή CSV. Ετήσια έντυπα (Ε3/Ε1): στήλες = έτη με μεταβολή %.
 */

const MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιουν', 'Ιουλ', 'Αύγ', 'Σεπ', 'Οκτ', 'Νοέ', 'Δεκ']
const NUM = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 2 })
const PCT = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 1 })
const MAX_LIST = 6

function shortLabel(c: GridColumn, kind: ValuesGridView['kind']): string {
  if (kind === 'MONTHLY') return MONTHS[Number(c.key.slice(5, 7)) - 1] ?? c.label
  if (kind === 'QUARTERLY') return c.key.slice(5)
  return c.label
}
const listLabels = (keys: string[], g: ValuesGridView) => {
  const labels = keys.map(k => g.columns.find(c => c.key === k)?.label ?? k)
  return labels.length > MAX_LIST ? `${labels.slice(0, MAX_LIST).join(', ')} και ${labels.length - MAX_LIST} ακόμη` : labels.join(', ')
}

async function toBase64(f: File): Promise<string> {
  const buf = new Uint8Array(await f.arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(s)
}

export function ValuesGridTable({ trdrId, grid: g, canEdit, onChanged, title }: {
  trdrId: string
  grid: ValuesGridView
  canEdit: boolean
  onChanged: () => void
  title?: string
}) {
  const [busy, setBusy] = React.useState<string | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const series = g.kind !== 'YEARLY'
  const unit = g.kind === 'MONTHLY' ? 'μήνες' : g.kind === 'QUARTERLY' ? 'τρίμηνα' : 'έτη'
  const hasTotals = series && g.fields.some(f => f.summable)

  async function readAll() {
    if (!g.documentTypeId) return
    setBusy('Ανάγνωση τιμών…')
    try {
      const r = await readTypeValues(trdrId, g.documentTypeId)
      toast.success(`Διαβάστηκαν ${r.read} έγγραφα${r.failed ? ` · ${r.failed} χωρίς τιμές` : ''}.`)
      onChanged()
    } catch { toast.error('Η ανάγνωση απέτυχε.') } finally { setBusy(null) }
  }

  async function upload(files: File[]) {
    if (!g.documentTypeId || !files.length) return
    let ok = 0
    for (const [i, f] of files.entries()) {
      setBusy(`Ανέβασμα ${i + 1}/${files.length}: ${f.name}…`)
      try {
        await uploadTrdrDossierDoc(trdrId, {
          documentTypeId: g.documentTypeId, name: f.name.replace(/\.[^.]+$/, ''), base64: await toBase64(f),
          mimeType: f.type || 'application/pdf', ext: (/\.([a-z0-9]+)$/i.exec(f.name)?.[1] ?? 'pdf').toLowerCase(),
        })
        ok++
      } catch (err) { toast.error(`«${f.name}»: ${err instanceof Error ? err.message : 'απέτυχε'}`) }
    }
    setBusy(null)
    if (ok) {
      toast.success(`Ανέβηκαν ${ok} έγγραφα — οι τιμές διαβάστηκαν.`, { description: series ? 'Αν ένα PDF έχει πολλές περιόδους (π.χ. 12 Φ2), χωρίζεται αυτόματα σε λίγα λεπτά και θα ειδοποιηθείτε.' : undefined })
      onChanged()
    }
  }

  function exportCsv() {
    const blob = new Blob([gridToCsv(g)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(title ?? g.typeName ?? g.templateName).replace(/[\\/:*?"<>|]+/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const s = g.summary
  const complete = s.missing.length === 0 && s.empty.length === 0

  return (
    <div className="mt-3 rounded-xl border border-border bg-card">
      {/* Σύνοψη κάλυψης + ενέργειες */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[length:var(--fs-12-5)]">
            <LuTable2 className="size-4 shrink-0 text-primary" aria-hidden />
            <b>{title ?? 'Πίνακας τιμών'}</b>
            <span className="text-muted-foreground">
              <b className="tabular-nums text-foreground">{s.withValues}</b> από {s.total} {unit} με τιμές
              {s.from && s.to && s.from !== s.to ? ` · ${g.columns[0]?.label} – ${g.columns[g.columns.length - 1]?.label}` : ''}
            </span>
          </div>
          {complete ? (
            <p className="mt-1 flex items-center gap-1 text-[length:var(--fs-11-5)] text-[color:var(--success)]"><LuCircleCheck className="size-3.5" aria-hidden /> Πλήρες — καμία περίοδος δεν λείπει στο διάστημα.</p>
          ) : (
            <div className="mt-1 flex flex-col gap-0.5 text-[length:var(--fs-11-5)]">
              {s.missing.length > 0 && (
                <p className="flex items-start gap-1 text-[color:var(--warning)]"><LuTriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Λείπει έγγραφο: {listLabels(s.missing, g)}</p>
              )}
              {s.empty.length > 0 && (
                <p className="flex items-start gap-1 text-muted-foreground"><LuScanText className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Υπάρχει έγγραφο χωρίς τιμές: {listLabels(s.empty, g)}</p>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {canEdit && g.unread > 0 && g.documentTypeId && (
            <button type="button" onClick={() => void readAll()} disabled={!!busy} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 text-[length:var(--fs-12)] font-semibold hover:border-primary hover:text-primary disabled:opacity-60">
              <LuScanText className="size-3.5" aria-hidden /> Ανάγνωση τιμών ({g.unread})
            </button>
          )}
          {canEdit && g.documentTypeId && (
            <>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 text-[length:var(--fs-12)] font-semibold hover:border-primary hover:text-primary disabled:opacity-60" title={series ? 'Ένα ή πολλά αρχεία — και PDF με πολλές περιόδους (χωρίζεται αυτόματα)' : 'Ένα ή πολλά αρχεία'}>
                <LuUpload className="size-3.5" aria-hidden /> Ανέβασμα
              </button>
              <input ref={fileRef} type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; void upload(f) }} />
            </>
          )}
          <button type="button" onClick={exportCsv} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 text-[length:var(--fs-12)] font-semibold hover:border-primary hover:text-primary">
            <LuDownload className="size-3.5" aria-hidden /> CSV
          </button>
        </div>
      </div>
      {busy && <p className="flex items-center gap-2 border-b border-border px-3 py-2 text-[length:var(--fs-12)] text-muted-foreground" aria-live="polite"><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> {busy}</p>}

      {/* Πλέγμα: πεδία × περίοδοι (ομάδες ανά έτος + σύνολο έτους) */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-[length:var(--fs-11-5)] tabular-nums">
          <thead>
            {series && (
              <tr className="text-[length:var(--fs-11)] font-bold">
                <th className="sticky left-0 z-10 bg-card" />
                {g.years.map(y => (
                  <th key={y.year} colSpan={y.keys.length + (hasTotals ? 1 : 0)} className="border-l border-border px-2 pt-2 pb-1 text-left">
                    {y.year} <span className={cn('ml-1 font-semibold', y.have >= y.expected ? 'text-[color:var(--success)]' : 'text-[color:var(--warning)]')}>{y.have}/{y.expected}</span>
                  </th>
                ))}
              </tr>
            )}
            <tr className="text-[length:var(--fs-10-5)] font-bold text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card px-3 py-1.5 text-left">Πεδίο</th>
              {g.years.map(y => (
                <React.Fragment key={y.year}>
                  {y.keys.map((k, i) => {
                    const c = g.columns.find(x => x.key === k)!
                    const label = shortLabel(c, g.kind)
                    return (
                      <th key={k} className={cn('px-2 py-1.5 text-right font-bold', i === 0 && series && 'border-l border-border', c.missing && 'bg-[color:var(--warning)]/8 text-[color:var(--warning)]')}>
                        {c.doc ? (
                          <DocumentPreviewButton
                            url={`/partners/${trdrId}/dossier/${c.doc.id}`}
                            name={`${g.typeName ?? g.templateName} ${c.label}`}
                            mimeType={c.doc.mimeType}
                            trigger={<span className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary" title={`${c.label} — προβολή «${c.doc.name}»`}>{label}</span>}
                          />
                        ) : c.missing ? (
                          <span className="inline-flex items-center gap-0.5" title={`${c.label} — λείπει το έγγραφο`}><LuTriangleAlert className="size-3" aria-label="λείπει" />{label}</span>
                        ) : <span title={c.label}>{label}</span>}
                      </th>
                    )
                  })}
                  {hasTotals && <th className="bg-muted/50 px-2 py-1.5 text-right text-foreground">Σύνολο</th>}
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {g.fields.map(f => (
              <tr key={f.key} className="border-t border-border">
                <td className="sticky left-0 z-10 max-w-56 bg-card px-3 py-1.5 font-semibold" title={f.label}><span className="line-clamp-2">{f.label}</span></td>
                {g.years.map(y => (
                  <React.Fragment key={y.year}>
                    {y.keys.map((k, i) => {
                      const c = g.columns.find(x => x.key === k)!
                      const cell = g.cells[cellKey(f.key, k)]
                      const prev = !series && i === 0 ? g.cells[cellKey(f.key, String(y.year - 1))] : null
                      const delta = cell?.num != null && prev?.num ? (cell.num - prev.num) / Math.abs(prev.num) : null
                      return (
                        <td key={k} className={cn('px-2 py-1.5 text-right whitespace-nowrap', i === 0 && series && 'border-l border-border', c.missing && 'bg-[color:var(--warning)]/5', !cell && 'text-muted-foreground')}>
                          {cell ? (
                            <span className="inline-flex flex-col items-end">
                              <span className="inline-flex items-center gap-1">{cell.verified && <LuCheck className="size-3 text-[color:var(--success)]" aria-label="επαληθευμένο" />}{cell.text}</span>
                              {delta != null && f.valueType === 'CURRENCY' && Number.isFinite(delta) && (
                                <span className={cn('text-[length:var(--fs-10-5)]', delta >= 0 ? 'text-[color:var(--success)]' : 'text-[color:var(--danger)]')}>{delta >= 0 ? '+' : ''}{PCT.format(delta * 100)}%</span>
                              )}
                            </span>
                          ) : '—'}
                        </td>
                      )
                    })}
                    {hasTotals && (() => {
                      const t = f.summable ? g.totals[cellKey(f.key, String(y.year))] : undefined
                      const partial = y.have < y.expected
                      return (
                        <td className="bg-muted/50 px-2 py-1.5 text-right font-bold whitespace-nowrap" title={t != null ? `Άθροισμα ${y.have} ${unit}${partial ? ` — λείπουν ${y.expected - y.have}` : ''}` : f.summable ? undefined : 'Δεν αθροίζεται'}>
                          {t != null ? <>{NUM.format(t)}{partial && <LuTriangleAlert className="ml-1 inline size-3 text-[color:var(--warning)]" aria-label="μερικό σύνολο" />}</> : <span className="font-normal text-muted-foreground">—</span>}
                        </td>
                      )
                    })()}
                  </React.Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-3 py-1.5 text-[length:var(--fs-11)] text-muted-foreground">
        {series ? 'Κλικ στον μήνα/τρίμηνο = το έγγραφο. «Σύνολο» = άθροισμα των περιόδων του έτους' : 'Κλικ στο έτος = το έγγραφο. Κάτω από τα ποσά: μεταβολή από το προηγούμενο έτος'}
        {hasTotals && <> · <LuTriangleAlert className="inline size-3 text-[color:var(--warning)]" aria-hidden /> = μερικό (λείπουν περίοδοι)</>}.
      </p>
    </div>
  )
}
