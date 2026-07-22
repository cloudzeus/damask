'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuTriangleAlert, LuSave, LuPlus, LuX } from 'react-icons/lu'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { OcrCostPanel } from '@/components/ingestion/ocr-cost-panel'
import { coerceFinancialValue, type FinancialValueTypeStr } from '@/lib/tax/greek-format'
import { saveFinancialValues } from '@/lib/tax/actions'
import type { GridEntry, SeriesEntryPoint } from '@/lib/tax/value-prep'
import type { OcrCostView } from '@/lib/ingestion/ocr-cost'

export type GridRow = {
  fieldKey: string
  label: string
  raw: string | null
  value: number | null
  valueType: string
  kind: string
  confidence: number | null
  /** Μόνο για kind==='SERIES' — σημεία {year,value} από το scanForm OCR (ή προσθήκες/διορθώσεις του χρήστη). */
  series?: SeriesEntryPoint[]
}

const VALUE_TYPE_LABELS: Record<string, string> = {
  CURRENCY: 'Ποσό (€)',
  NUMBER: 'Αριθμός',
  PERCENT: 'Ποσοστό',
  INTEGER: 'Ακέραιος',
  DATE: 'Ημερομηνία',
  BOOLEAN: 'Ναι/Όχι',
}
const KIND_LABELS: Record<string, string> = {
  SINGLE: 'Μονό',
  SERIES: 'Σειρά',
  TABLE: 'Πίνακας',
}

/** Κάτω από αυτό το κατώφλι (0-1) η γραμμή παίρνει κοραλί hint — «χαμηλή εμπιστοσύνη OCR, έλεγξε το». */
const LOW_CONFIDENCE = 0.6

/**
 * Πίνακας διόρθωσης μετά από scanForm: μία γραμμή ανά field, ο χρήστης
 * επιβεβαιώνει/διορθώνει το ακατέργαστο κείμενο (raw) — η αριθμητική τιμή
 * (value) επαναϋπολογίζεται ΤΟΠΙΚΑ σε κάθε πληκτρολόγηση μέσω
 * coerceFinancialValue (ίδια pure συνάρτηση με τον server, ώστε ο χρήστης να
 * βλέπει ΑΚΡΙΒΩΣ τι θα αποθηκευτεί πριν πατήσει «Αποθήκευση»).
 */
export function CorrectionGrid({
  grid, cost, trdrId, templateId, year, recordId, onSaved,
}: {
  grid: GridRow[]
  cost: OcrCostView
  trdrId: string
  templateId: string
  year: number
  recordId: string
  onSaved?: () => void
}) {
  const [rows, setRows] = React.useState<GridRow[]>(grid)
  const [saving, setSaving] = React.useState(false)

  function updateRaw(fieldKey: string, raw: string) {
    setRows(prev => prev.map(r => (r.fieldKey === fieldKey
      ? { ...r, raw, value: coerceFinancialValue(raw, r.valueType as FinancialValueTypeStr) }
      : r)))
  }

  function updateSeriesPoint(fieldKey: string, idx: number, patch: Partial<SeriesEntryPoint>) {
    setRows(prev => prev.map(r => (r.fieldKey === fieldKey
      ? { ...r, series: (r.series ?? []).map((p, i) => (i === idx ? { ...p, ...patch } : p)) }
      : r)))
  }

  function addSeriesPoint(fieldKey: string) {
    setRows(prev => prev.map(r => (r.fieldKey === fieldKey
      ? { ...r, series: [...(r.series ?? []), { year: null, value: null }] }
      : r)))
  }

  function removeSeriesPoint(fieldKey: string, idx: number) {
    setRows(prev => prev.map(r => (r.fieldKey === fieldKey
      ? { ...r, series: (r.series ?? []).filter((_, i) => i !== idx) }
      : r)))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const entries: GridEntry[] = rows.map(r => ({
        fieldKey: r.fieldKey,
        kind: r.kind as 'SINGLE' | 'SERIES' | 'TABLE',
        valueType: r.valueType as FinancialValueTypeStr,
        raw: r.raw,
        series: r.series,
        confidence: r.confidence,
      }))
      const { saved } = await saveFinancialValues({ trdrId, templateId, year, recordId, entries })
      toast.success(`Αποθηκεύτηκαν ${saved.toLocaleString('el-GR')} τιμές για το ${year}.`)
      onSaved?.()
    } catch {
      toast.error('Η αποθήκευση απέτυχε.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <OcrCostPanel cost={cost} />

      <div className="glass max-h-[min(50vh,420px)] overflow-y-auto rounded-[16px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Πεδίο</TableHead>
              <TableHead>Τιμή</TableHead>
              <TableHead>Νόμισμα-Τύπος</TableHead>
              <TableHead className="text-right">Εμπιστοσύνη</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => {
              const low = row.confidence != null && row.confidence < LOW_CONFIDENCE
              return (
                <TableRow key={row.fieldKey} style={low ? { background: 'var(--coral-soft)' } : undefined}>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{row.label}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{row.fieldKey}</div>
                  </TableCell>
                  <TableCell className="min-w-[220px]">
                    {row.kind === 'SERIES' ? (
                      <div className="flex flex-col gap-1">
                        {(row.series ?? []).map((p, idx) => (
                          <div key={idx} className="flex items-center gap-1">
                            <Input
                              value={p.year ?? ''}
                              onChange={e => {
                                const v = e.target.value.trim()
                                const n = v === '' ? null : Number(v)
                                updateSeriesPoint(row.fieldKey, idx, { year: n != null && Number.isFinite(n) ? n : null })
                              }}
                              placeholder="Έτος"
                              inputMode="numeric"
                              className="w-16 shrink-0"
                            />
                            <Input
                              value={p.value ?? ''}
                              onChange={e => updateSeriesPoint(row.fieldKey, idx, { value: e.target.value })}
                              placeholder="Τιμή"
                            />
                            <button
                              type="button"
                              onClick={() => removeSeriesPoint(row.fieldKey, idx)}
                              aria-label="Αφαίρεση σημείου σειράς"
                              className="icon-pill size-6 shrink-0"
                            >
                              <LuX className="size-3" aria-hidden />
                            </button>
                          </div>
                        ))}
                        {(row.series ?? []).length === 0 && (
                          <div className="text-[11px] text-muted-foreground">Δεν βρέθηκαν σημεία σειράς.</div>
                        )}
                        <button
                          type="button"
                          onClick={() => addSeriesPoint(row.fieldKey)}
                          className="inline-flex w-fit items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          <LuPlus className="size-3" aria-hidden /> Προσθήκη έτους
                        </button>
                      </div>
                    ) : (
                      <>
                        <Input
                          value={row.raw ?? ''}
                          onChange={e => updateRaw(row.fieldKey, e.target.value)}
                          style={low ? { borderColor: 'var(--coral)' } : undefined}
                        />
                        {row.value != null && row.valueType !== 'DATE' && (
                          <div className="mt-0.5 text-[11px] text-muted-foreground">→ {row.value.toLocaleString('el-GR')}</div>
                        )}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <span className="badge-pill muted">{VALUE_TYPE_LABELS[row.valueType] ?? row.valueType}</span>{' '}
                    <span className="text-[11px] text-muted-foreground">{KIND_LABELS[row.kind] ?? row.kind}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    {row.confidence != null ? (
                      <span className={low ? 'inline-flex items-center gap-1 text-coral' : 'text-muted-foreground'}>
                        {low && <LuTriangleAlert className="size-3" aria-hidden />}
                        {Math.round(row.confidence * 100)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="whitespace-normal py-6 text-center text-muted-foreground">
                  Δεν βρέθηκαν πεδία προς επιβεβαίωση.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} disabled={saving || rows.length === 0}>
          <LuSave className="size-3.5" aria-hidden /> {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </Button>
      </div>
    </div>
  )
}
