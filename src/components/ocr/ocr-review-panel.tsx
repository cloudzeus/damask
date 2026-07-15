'use client'

import { useMemo, useRef, useState } from 'react'
import {
  LuTriangleAlert, LuCircleAlert, LuCheck, LuRotateCcw, LuPlus, LuTrash2, LuZoomIn,
  LuUser, LuBuilding2, LuHash, LuCalendar, LuCoins, LuBadgeCheck, LuSparkles,
} from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { coerceOcrNumber, OCR_DOC_TYPES, type ExtractedDocument, type OcrParty, type OcrLine, type OcrDocType } from '@/lib/ocr/schema'
import { validateExtractedDocument } from '@/lib/ocr/validate'
import type { MismatchFlag } from '@/lib/ocr/invoice-math'
import { pageDataUrl, type StagedPage } from './types'

const DOC_TYPE_LABEL: Record<OcrDocType, string> = {
  invoice: 'Τιμολόγιο',
  receipt: 'Απόδειξη',
  packing_list: 'Δελτίο αποστολής',
}

function fmtMoney(n: number | null): string {
  return n == null ? '—' : `${n.toFixed(2)}€`
}

/** Επεξεργάσιμο κελί αριθμού: κρατά το ΩΣ-ΠΛΗΚΤΡΟΛΟΓΗΘΗΚΕ κείμενο σε τοπικό state μέχρι το blur,
 * ώστε δεκαδικά με κόμμα ("29,1") να μην «κόβονται» από re-render σε κάθε πλήκτρο. `prevValue`
 * ΞΑΝΑ-συγχρονίζει το τοπικό κείμενο όταν το `value` prop αλλάξει από ΕΞΩ (π.χ. διαγραφή μιας
 * προηγούμενης γραμμής μετατοπίζει ποιά γραμμή αντιστοιχεί σε ποιο index) — επίσημο React idiom
 * «adjusting state during render» (https://react.dev/learn/you-might-not-need-an-effect), όχι
 * useEffect, ώστε να μην ξαναπυροδοτεί ενώ ο χρήστης πληκτρολογεί (το `value` του γονέα αλλάζει
 * ΜΟΝΟ σε explicit commit onBlur, ποτέ σε κάθε πλήκτρο). */
function NumericCell({
  value, onCommit, placeholder, ariaLabel,
}: {
  value: number | null
  onCommit: (n: number | null) => void
  placeholder?: string
  ariaLabel: string
}) {
  const [text, setText] = useState(value == null ? '' : String(value))
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setText(value == null ? '' : String(value))
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      className="cell-input"
      aria-label={ariaLabel}
      value={text}
      placeholder={placeholder}
      onChange={e => setText(e.target.value)}
      onFocus={() => setText(value == null ? '' : String(value))}
      onBlur={() => {
        const n = coerceOcrNumber(text)
        setText(n == null ? '' : String(n))
        onCommit(n)
      }}
      style={{
        width: '100%', height: 34, borderRadius: 9, border: '1px solid var(--border)',
        background: 'var(--card)', padding: '0 9px', fontSize: 13, textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
      }}
    />
  )
}

function TextCell({
  value, onChange, placeholder, ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  ariaLabel: string
}) {
  return (
    <input
      type="text"
      className="cell-input"
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', height: 34, borderRadius: 9, border: '1px solid var(--border)',
        background: 'var(--card)', padding: '0 9px', fontSize: 13,
      }}
    />
  )
}

function FieldLabel({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <label className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
      <Icon className="size-3" aria-hidden />
      {children}
    </label>
  )
}

function PartyFields({
  title, party, onChange, afmFlag, onRemove,
}: {
  title: string
  party: OcrParty
  onChange: (patch: Partial<OcrParty>) => void
  afmFlag?: MismatchFlag
  onRemove?: () => void
}) {
  return (
    <div className="rounded-2xl border border-border p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[12.5px] font-bold">{title}</span>
        {onRemove && (
          <button type="button" className="rowmenu-btn" onClick={onRemove} aria-label={`Αφαίρεση ${title.toLowerCase()}`}>
            <LuTrash2 className="size-3.5" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FieldLabel icon={LuBuilding2}>Επωνυμία</FieldLabel>
          <TextCell ariaLabel={`${title} — επωνυμία`} value={party.name ?? ''} onChange={v => onChange({ name: v || null })} placeholder="—" />
        </div>
        <div>
          <FieldLabel icon={LuHash}>ΑΦΜ</FieldLabel>
          <TextCell ariaLabel={`${title} — ΑΦΜ`} value={party.afm ?? ''} onChange={v => onChange({ afm: v || null })} placeholder="9 ψηφία" />
          {afmFlag && (
            <p className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: 'var(--warning)' }}>
              <LuTriangleAlert className="size-3 shrink-0" /> Μη έγκυρο ΑΦΜ
            </p>
          )}
        </div>
        <div>
          <FieldLabel icon={LuUser}>Διεύθυνση</FieldLabel>
          <TextCell ariaLabel={`${title} — διεύθυνση`} value={party.address ?? ''} onChange={v => onChange({ address: v || null })} placeholder="—" />
        </div>
      </div>
    </div>
  )
}

function MismatchList({ flags }: { flags: MismatchFlag[] }) {
  if (flags.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-[12px]" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
        <LuCheck className="size-3.5 shrink-0" />
        Δεν εντοπίστηκαν ασυμφωνίες.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      {flags.map(f => (
        <div
          key={f.code}
          className="flex items-start gap-2 rounded-xl px-3 py-2 text-[12px]"
          style={{
            background: f.severity === 'error' ? 'color-mix(in srgb, var(--destructive) 10%, transparent)' : 'var(--warning-soft)',
            color: f.severity === 'error' ? 'var(--destructive)' : 'var(--warning)',
          }}
        >
          {f.severity === 'error' ? <LuCircleAlert className="mt-0.5 size-3.5 shrink-0" /> : <LuTriangleAlert className="mt-0.5 size-3.5 shrink-0" />}
          <span>{f.message}</span>
        </div>
      ))}
    </div>
  )
}

export interface OcrReviewPanelProps {
  pages: StagedPage[]
  initialData: ExtractedDocument
  model: string
  usedFallback: boolean
  onConfirm: (data: ExtractedDocument) => void
  onRetry: () => void
}

export function OcrReviewPanel({ pages, initialData, model, usedFallback, onConfirm, onRetry }: OcrReviewPanelProps) {
  const [data, setData] = useState<ExtractedDocument>(initialData)
  const [zoomIndex, setZoomIndex] = useState<number | null>(null)

  // Σταθερά React keys ανά γραμμή (ΟΧΙ το array index — η διαγραφή μιας γραμμής θα μετατόπιζε τα
  // index όλων των επόμενων, κάνοντας το React να ΕΠΑΝΑΧΡΗΣΙΜΟΠΟΙΗΣΕΙ instances του NumericCell για
  // ΔΙΑΦΟΡΕΤΙΚΗ γραμμή δεδομένων — χωρίς σταθερό key αυτό είναι ορατό data-corruption bug). Το
  // αρχικό batch παίρνει key=index (καθαρό, χωρίς πρόσβαση σε ref κατά το render)· το ref ξεκινά
  // ΗΔΗ μετατοπισμένο πέρα από αυτό το εύρος ώστε οι ΕΠΟΜΕΝΕΣ γραμμές (addLine, μέσα σε event
  // handler — όχι κατά το render) να μην συγκρούονται με τα αρχικά keys.
  const nextLineKeyRef = useRef(initialData.lines.length)
  const [lineKeys, setLineKeys] = useState<number[]>(() => initialData.lines.map((_, i) => i))

  const flags = useMemo(() => validateExtractedDocument(data), [data])
  const flagByCode = useMemo(() => new Map(flags.map(f => [f.code, f])), [flags])

  function patch(p: Partial<ExtractedDocument>) {
    setData(prev => ({ ...prev, ...p }))
  }
  function patchLine(index: number, p: Partial<OcrLine>) {
    setData(prev => ({ ...prev, lines: prev.lines.map((l, i) => (i === index ? { ...l, ...p } : l)) }))
  }
  function addLine() {
    setData(prev => ({ ...prev, lines: [...prev.lines, { description: '', quantity: null, unitPrice: null, vatPct: null, total: null }] }))
    setLineKeys(prev => [...prev, nextLineKeyRef.current++])
  }
  function removeLine(index: number) {
    setData(prev => ({ ...prev, lines: prev.lines.filter((_, i) => i !== index) }))
    setLineKeys(prev => prev.filter((_, i) => i !== index))
  }

  const confidencePct = Math.round(data.confidence * 100)
  const confidenceOk = data.confidence >= 0.7

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr]">
      {/* ── Αριστερά: thumbnails σελίδων ─────────────────────────────── */}
      <div className="flex gap-2.5 overflow-x-auto lg:flex-col lg:overflow-visible">
        {pages.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setZoomIndex(i)}
            className="group relative aspect-[3/4] w-24 shrink-0 overflow-hidden rounded-xl border border-border bg-muted lg:w-full"
            aria-label={`Μεγέθυνση — ${p.label}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pageDataUrl(p)} alt={p.label} className="size-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/35 group-hover:opacity-100">
              <LuZoomIn className="size-5 text-white" />
            </span>
            <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-1 text-left text-[10px] text-white">
              {p.label}
            </span>
          </button>
        ))}
      </div>

      {/* ── Δεξιά: επεξεργάσιμα πεδία ─────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge-pill info">{DOC_TYPE_LABEL[data.docType]}</span>
          <span className={cn('badge-pill', confidenceOk ? 'ok' : 'warn')}>
            <LuBadgeCheck className="size-3" /> {confidencePct}% εμπιστοσύνη
          </span>
          <span className="text-[11.5px] text-muted-foreground">
            {usedFallback ? 'DeepSeek (χωρίς Gemini, μόνο κείμενο)' : `Gemini · ${model}`}
          </span>
          <div className="ml-auto">
            <Select value={data.docType} onValueChange={v => patch({ docType: v as OcrDocType })}>
              <SelectTrigger aria-label="Τύπος εγγράφου" className="h-8 rounded-full border-border bg-card px-3.5 text-[12.5px]">
                <SelectValue>{(v: string) => DOC_TYPE_LABEL[v as OcrDocType]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {OCR_DOC_TYPES.map(t => <SelectItem key={t} value={t}>{DOC_TYPE_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <MismatchList flags={flags} />

        <PartyFields title="Εκδότης" party={data.issuer} onChange={p => patch({ issuer: { ...data.issuer, ...p } })} afmFlag={flagByCode.get('issuer_afm_invalid')} />

        {data.counterparty ? (
          <PartyFields
            title="Παραλήπτης"
            party={data.counterparty}
            onChange={p => patch({ counterparty: { ...data.counterparty!, ...p } })}
            afmFlag={flagByCode.get('counterparty_afm_invalid')}
            onRemove={() => patch({ counterparty: null })}
          />
        ) : (
          <button
            type="button"
            onClick={() => patch({ counterparty: { name: null, afm: null, address: null } })}
            className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border py-2.5 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:border-(--info) hover:text-(--info)"
          >
            <LuPlus className="size-3.5" /> Προσθήκη παραλήπτη
          </button>
        )}

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div>
            <FieldLabel icon={LuHash}>Αριθμός εγγράφου</FieldLabel>
            <TextCell ariaLabel="Αριθμός εγγράφου" value={data.documentNumber ?? ''} onChange={v => patch({ documentNumber: v || null })} placeholder="—" />
          </div>
          <div>
            <FieldLabel icon={LuCalendar}>Ημερομηνία</FieldLabel>
            <TextCell ariaLabel="Ημερομηνία" value={data.date ?? ''} onChange={v => patch({ date: v || null })} placeholder="ΕΕΕΕ-ΜΜ-ΗΗ" />
          </div>
          <div className="col-span-2 sm:col-span-2">
            <FieldLabel icon={LuCoins}>Νόμισμα</FieldLabel>
            <TextCell ariaLabel="Νόμισμα" value={data.currency ?? ''} onChange={v => patch({ currency: v || null })} placeholder="EUR" />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="dotted-leader text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">Γραμμές</span>
          </div>
          <div className="table-wrap overflow-hidden rounded-xl border border-border">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Περιγραφή</th>
                  <th className="num">Ποσότητα</th>
                  <th className="num">Τιμή μον.</th>
                  <th className="num">ΦΠΑ%</th>
                  <th className="num">Σύνολο</th>
                  <th aria-label="Ενέργειες" />
                </tr>
              </thead>
              <tbody>
                {data.lines.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-[12.5px] text-muted-foreground">Δεν υπάρχουν γραμμές ακόμα.</td>
                  </tr>
                )}
                {data.lines.map((line, i) => (
                  <tr key={lineKeys[i] ?? i} className="dotted-row-bottom">
                    <td style={{ minWidth: 180, height: 46 }}>
                      <TextCell ariaLabel={`Γραμμή ${i + 1} — περιγραφή`} value={line.description} onChange={v => patchLine(i, { description: v })} placeholder="Περιγραφή είδους" />
                    </td>
                    <td className="num" style={{ width: 96 }}>
                      <NumericCell ariaLabel={`Γραμμή ${i + 1} — ποσότητα`} value={line.quantity} onCommit={n => patchLine(i, { quantity: n })} />
                    </td>
                    <td className="num" style={{ width: 108 }}>
                      <NumericCell ariaLabel={`Γραμμή ${i + 1} — τιμή μονάδας`} value={line.unitPrice} onCommit={n => patchLine(i, { unitPrice: n })} />
                    </td>
                    <td className="num" style={{ width: 84 }}>
                      <NumericCell ariaLabel={`Γραμμή ${i + 1} — ΦΠΑ ποσοστό`} value={line.vatPct} onCommit={n => patchLine(i, { vatPct: n })} />
                    </td>
                    <td className="num" style={{ width: 108 }}>
                      <NumericCell ariaLabel={`Γραμμή ${i + 1} — σύνολο`} value={line.total} onCommit={n => patchLine(i, { total: n })} />
                    </td>
                    <td className="ctr" style={{ width: 40 }}>
                      <button type="button" className="rowmenu-btn" onClick={() => removeLine(i)} aria-label={`Διαγραφή γραμμής ${i + 1}`}>
                        <LuTrash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={addLine}
            className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-(--info) hover:underline"
          >
            <LuPlus className="size-3.5" /> Προσθήκη γραμμής
          </button>
        </div>

        <div className="rounded-2xl border border-border p-3.5">
          <span className="mb-2.5 block text-[12.5px] font-bold">Σύνολα</span>
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <FieldLabel icon={LuCoins}>Καθαρή αξία</FieldLabel>
              <NumericCell ariaLabel="Καθαρή αξία" value={data.totals.net} onCommit={n => patch({ totals: { ...data.totals, net: n } })} />
            </div>
            <div>
              <FieldLabel icon={LuCoins}>ΦΠΑ</FieldLabel>
              <NumericCell ariaLabel="ΦΠΑ" value={data.totals.vat} onCommit={n => patch({ totals: { ...data.totals, vat: n } })} />
            </div>
            <div>
              <FieldLabel icon={LuCoins}>Σύνολο</FieldLabel>
              <NumericCell ariaLabel="Σύνολο" value={data.totals.gross} onCommit={n => patch({ totals: { ...data.totals, gross: n } })} />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Άθροισμα γραμμών: <b className="tabular-nums text-foreground">{fmtMoney(data.lines.reduce((s, l) => s + (l.total ?? ((l.quantity ?? 0) * (l.unitPrice ?? 0))), 0))}</b>
          </p>
        </div>

        {data.notes && (
          <div className="notice">
            <LuSparkles className="size-4 shrink-0" />
            <span>{data.notes}</span>
          </div>
        )}

        <div className="mt-1 flex items-center gap-2 border-t border-dashed border-border pt-4" style={{ borderColor: 'var(--dotted)' }}>
          <Button type="button" onClick={() => onConfirm(data)}>
            <LuCheck className="size-3.5" /> Επιβεβαίωση
          </Button>
          <Button type="button" variant="outline" onClick={onRetry}>
            <LuRotateCcw className="size-3.5" /> Ξανά
          </Button>
        </div>
      </div>

      <Dialog open={zoomIndex != null} onOpenChange={open => !open && setZoomIndex(null)}>
        <DialogContent className="glass sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{zoomIndex != null ? pages[zoomIndex]?.label : ''}</DialogTitle>
          </DialogHeader>
          {zoomIndex != null && pages[zoomIndex] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pageDataUrl(pages[zoomIndex])} alt={pages[zoomIndex].label} className="max-h-[75vh] w-full rounded-lg object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
