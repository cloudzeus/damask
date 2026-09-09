'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuPlus, LuX, LuFlaskConical, LuScanLine, LuTrash2 } from 'react-icons/lu'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { testField, scanRow } from '@/lib/tax/actions'
import { cropRegion } from '@/lib/tax/crop'
import {
  slugFieldKey, regionKeyOf,
  type TemplateField, type FinancialValueTypeStr, type TaxFieldKindStr,
} from '@/lib/tax/template'
import type { RasterizedPage } from '@/lib/ocr/rasterize'

const VALUE_TYPE_LABELS: Record<FinancialValueTypeStr, string> = {
  CURRENCY: 'Ποσό (€)',
  NUMBER: 'Αριθμός',
  PERCENT: 'Ποσοστό',
  INTEGER: 'Ακέραιος',
  DATE: 'Ημερομηνία',
  BOOLEAN: 'Ναι/Όχι',
}
const KIND_LABELS: Record<TaxFieldKindStr, string> = {
  SINGLE: 'Μονό πεδίο',
  SERIES: 'Σειρά ετών',
  TABLE: 'Πίνακας',
}
const VALUE_TYPE_KEYS = Object.keys(VALUE_TYPE_LABELS) as FinancialValueTypeStr[]
const KIND_KEYS = Object.keys(KIND_LABELS) as TaxFieldKindStr[]

interface FieldListProps {
  fields: TemplateField[]
  selectedFieldKey: string | null
  pages: RasterizedPage[]
  templateId: string
  onSelect: (key: string) => void
  onChange: (fields: TemplateField[]) => void
}

/**
 * Λίστα καρτών πεδίων του template: μία κάρτα ανά field, κλικ πάνω της την
 * κάνει ενεργή ώστε η επόμενη σχεδιασμένη περιοχή στον RegionEditor (γονικό
 * template-editor.tsx) να της ανατεθεί. Κάθε κάρτα αναφέρεται με το ίδιο
 * κλειδί (`regionKeyOf`) που δείχνει το highlight στον καμβά.
 */
export function FieldList({ fields, selectedFieldKey, pages, templateId, onSelect, onChange }: FieldListProps) {
  function updateAt(index: number, patch: Partial<TemplateField>) {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  }
  function removeAt(index: number) {
    onChange(fields.filter((_, i) => i !== index))
  }
  function addField() {
    const blank: TemplateField = {
      fieldKey: '',
      label: '',
      section: null,
      valueType: 'CURRENCY',
      kind: 'SINGLE',
      config: null,
      regionHint: null,
      aiHint: null,
      required: false,
      order: fields.length,
    }
    const nextIndex = fields.length
    onChange([...fields, blank])
    onSelect(regionKeyOf(blank, nextIndex))
  }

  return (
    <div className="flex flex-col gap-2.5" data-template-id={templateId}>
      {fields.map((field, index) => {
        const key = regionKeyOf(field, index)
        return (
          <FieldCard
            key={field.id ?? `new-${index}`}
            field={field}
            index={index}
            active={key === selectedFieldKey}
            pages={pages}
            onSelect={() => onSelect(key)}
            onUpdate={patch => updateAt(index, patch)}
            onRemove={() => removeAt(index)}
          />
        )
      })}

      {fields.length === 0 && (
        <div className="glass rounded-[16px] p-6 text-center text-[0.78125rem] text-muted-foreground">
          Δεν υπάρχουν ακόμη πεδία — πρόσθεσε το πρώτο.
        </div>
      )}

      <Button type="button" variant="outline" onClick={addField} className="self-start">
        <LuPlus className="size-3.5" aria-hidden /> Πεδίο
      </Button>
    </div>
  )
}

function FieldCard({
  field, index, active, pages, onSelect, onUpdate, onRemove,
}: {
  field: TemplateField
  index: number
  active: boolean
  pages: RasterizedPage[]
  onSelect: () => void
  onUpdate: (patch: Partial<TemplateField>) => void
  onRemove: () => void
}) {
  const [testing, setTesting] = React.useState(false)
  const [scanning, setScanning] = React.useState(false)
  const [result, setResult] = React.useState<{ raw: string | null; value: number | null; model: string; name?: string | null; code?: string | null } | null>(null)
  const [testError, setTestError] = React.useState<string | null>(null)

  const slugPreview = field.fieldKey.trim() || slugFieldKey(field.label) || `field_${index + 1}`
  const regionPage = field.regionHint ? pages[field.regionHint.page] : null
  const canTest = !!field.regionHint && !!regionPage && !testing && !scanning

  /** Auto-slug: όσο το κλειδί δεν έχει πειραχτεί χειροκίνητα, ακολουθεί την ετικέτα (λατινικά). */
  function changeLabel(newLabel: string) {
    const wasAuto = !field.fieldKey.trim() || field.fieldKey === slugFieldKey(field.label)
    onUpdate(wasAuto ? { label: newLabel, fieldKey: slugFieldKey(newLabel) } : { label: newLabel })
  }

  async function handleScanRow() {
    if (!field.regionHint || !regionPage) return
    setScanning(true)
    setTestError(null)
    setResult(null)
    try {
      const cropped = await cropRegion(regionPage.base64, regionPage.mimeType, field.regionHint.bbox)
      const r = await scanRow({ image: { base64: cropped.base64, mimeType: cropped.mimeType }, valueType: field.valueType })
      const patch: Partial<TemplateField> = {}
      if (r.name) { patch.label = r.name; patch.fieldKey = slugFieldKey(r.name) }
      if (r.code) patch.section = r.code
      if (Object.keys(patch).length > 0) onUpdate(patch)
      setResult({ raw: r.raw, value: r.value, model: r.model, name: r.name, code: r.code })
      if (!r.name && !r.code && r.raw == null) toast.warning('Δεν αναγνωρίστηκε όνομα/κωδικός/τιμή — δοκίμασε πιο ακριβή επιλογή γραμμής.')
      else toast.success('Η γραμμή διαβάστηκε — έλεγξε τα στοιχεία.')
    } catch {
      setTestError('Η σάρωση γραμμής απέτυχε.')
      toast.error('Η σάρωση γραμμής απέτυχε.')
    } finally {
      setScanning(false)
    }
  }

  function clearRegion() {
    onUpdate({ regionHint: null })
    setResult(null)
    setTestError(null)
  }

  function updateColumn(colIndex: number, value: string) {
    const columns = [...(field.config?.columns ?? [])]
    columns[colIndex] = value
    onUpdate({ config: { columns } })
  }
  function addColumn() {
    onUpdate({ config: { columns: [...(field.config?.columns ?? []), ''] } })
  }
  function removeColumn(colIndex: number) {
    onUpdate({ config: { columns: (field.config?.columns ?? []).filter((_, i) => i !== colIndex) } })
  }

  async function handleTest() {
    if (!field.regionHint || !regionPage) return
    setTesting(true)
    setTestError(null)
    setResult(null)
    try {
      const cropped = await cropRegion(regionPage.base64, regionPage.mimeType, field.regionHint.bbox)
      // testField δεν έχει ξεχωριστό kind για TABLE — δοκιμάζουμε την περιοχή
      // ως SINGLE ώστε τουλάχιστον να επιβεβαιώνεται ότι η περιοχή διαβάζεται.
      const r = await testField({
        image: { base64: cropped.base64, mimeType: cropped.mimeType },
        label: field.label || slugPreview,
        valueType: field.valueType,
        kind: field.kind === 'SERIES' ? 'SERIES' : 'SINGLE',
        aiHint: field.aiHint,
      })
      setResult(r)
    } catch {
      setTestError('Η δοκιμή απέτυχε.')
      toast.error('Η δοκιμή πεδίου απέτυχε.')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div
      className={cn(
        'glass cursor-pointer rounded-[16px] p-3 transition-colors',
        active ? 'ring-2 ring-coral' : 'hover:ring-1 hover:ring-border',
      )}
      onClick={onSelect}
    >
      <div className="mb-2 flex items-start gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-[0.6875rem] font-semibold text-muted-foreground" htmlFor={`fl-label-${index}`}>
            Ετικέτα
          </label>
          <Input
            id={`fl-label-${index}`}
            value={field.label}
            placeholder="π.χ. Κύκλος εργασιών"
            onClick={e => e.stopPropagation()}
            onChange={e => changeLabel(e.target.value)}
          />
        </div>
        <button
          type="button"
          aria-label="Αφαίρεση πεδίου"
          className="icon-pill mt-5 size-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={e => { e.stopPropagation(); onRemove() }}
        >
          <LuX className="size-3.5" aria-hidden />
        </button>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[0.6875rem] font-semibold text-muted-foreground" htmlFor={`fl-key-${index}`}>
            Κλειδί
          </label>
          <Input
            id={`fl-key-${index}`}
            value={field.fieldKey}
            placeholder={slugPreview}
            className="font-mono text-[0.75rem]"
            onClick={e => e.stopPropagation()}
            onChange={e => onUpdate({ fieldKey: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-[0.6875rem] font-semibold text-muted-foreground" htmlFor={`fl-section-${index}`}>
            Ενότητα
          </label>
          <Input
            id={`fl-section-${index}`}
            value={field.section ?? ''}
            placeholder="π.χ. Πίνακας Ζ2"
            onClick={e => e.stopPropagation()}
            onChange={e => onUpdate({ section: e.target.value || null })}
          />
        </div>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2">
        <div onClick={e => e.stopPropagation()}>
          <label className="mb-1 block text-[0.6875rem] font-semibold text-muted-foreground">Τύπος τιμής</label>
          <Select value={field.valueType} onValueChange={v => onUpdate({ valueType: v as FinancialValueTypeStr })}>
            <SelectTrigger aria-label="Τύπος τιμής" className="h-8 w-full text-[0.78125rem]">
              <SelectValue>{(v: string) => VALUE_TYPE_LABELS[v as FinancialValueTypeStr]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {VALUE_TYPE_KEYS.map(v => <SelectItem key={v} value={v}>{VALUE_TYPE_LABELS[v]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div onClick={e => e.stopPropagation()}>
          <label className="mb-1 block text-[0.6875rem] font-semibold text-muted-foreground">Είδος</label>
          <Select
            value={field.kind}
            onValueChange={v => onUpdate({
              kind: v as TaxFieldKindStr,
              config: v === 'TABLE' ? { columns: field.config?.columns ?? [''] } : null,
            })}
          >
            <SelectTrigger aria-label="Είδος πεδίου" className="h-8 w-full text-[0.78125rem]">
              <SelectValue>{(v: string) => KIND_LABELS[v as TaxFieldKindStr]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {KIND_KEYS.map(v => <SelectItem key={v} value={v}>{KIND_LABELS[v]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {field.kind === 'TABLE' && (
        <div className="mb-2" onClick={e => e.stopPropagation()}>
          <label className="mb-1 block text-[0.6875rem] font-semibold text-muted-foreground">Στήλες πίνακα</label>
          <div className="flex flex-col gap-1.5">
            {(field.config?.columns ?? []).map((col, colIndex) => (
              <div key={colIndex} className="flex items-center gap-1.5">
                <Input
                  value={col}
                  placeholder={`Στήλη ${colIndex + 1}`}
                  onChange={e => updateColumn(colIndex, e.target.value)}
                />
                <button
                  type="button"
                  aria-label="Αφαίρεση στήλης"
                  className="icon-pill size-7 shrink-0"
                  onClick={() => removeColumn(colIndex)}
                >
                  <LuX className="size-3.5" aria-hidden />
                </button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addColumn} className="self-start">
              <LuPlus className="size-3" aria-hidden /> Στήλη
            </Button>
          </div>
        </div>
      )}

      <div className="mb-2">
        <label className="mb-1 block text-[0.6875rem] font-semibold text-muted-foreground" htmlFor={`fl-hint-${index}`}>
          Υπόδειξη OCR (προαιρετικό)
        </label>
        <Input
          id={`fl-hint-${index}`}
          value={field.aiHint ?? ''}
          placeholder="π.χ. αριθμός σε ευρώ, χωρίς δεκαδικά"
          onClick={e => e.stopPropagation()}
          onChange={e => onUpdate({ aiHint: e.target.value || null })}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-[0.75rem]" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={field.required} onChange={e => onUpdate({ required: e.target.checked })} />
          Υποχρεωτικό
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {field.regionHint && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive"
              disabled={testing || scanning}
              onClick={e => { e.stopPropagation(); clearRegion() }}
            >
              <LuTrash2 className="size-3.5" aria-hidden /> Περιοχή
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canTest}
            title="Διάβασε ολόκληρη τη γραμμή: όνομα + κωδικός + τιμή"
            onClick={e => { e.stopPropagation(); void handleScanRow() }}
          >
            <LuScanLine className="size-3.5" aria-hidden /> {scanning ? 'Σάρωση…' : 'Σάρωση γραμμής'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canTest}
            title="Διάβασε μόνο την τιμή της περιοχής"
            onClick={e => { e.stopPropagation(); void handleTest() }}
          >
            <LuFlaskConical className="size-3.5" aria-hidden /> {testing ? 'Δοκιμή…' : 'Τιμή'}
          </Button>
        </div>
      </div>

      {(result || testError) && (
        <div className="mt-2 rounded-lg border border-border bg-muted/40 p-2 text-[0.75rem]" onClick={e => e.stopPropagation()}>
          {testError ? (
            <span className="text-destructive">{testError}</span>
          ) : (
            <>
              {result?.name !== undefined && <div><b>Όνομα:</b> {result?.name ?? '—'}</div>}
              {result?.code !== undefined && <div><b>Κωδικός:</b> {result?.code ?? '—'}</div>}
              <div><b>Ακατέργαστο:</b> {result?.raw ?? '—'}</div>
              <div><b>Τιμή:</b> {result?.value ?? '—'}</div>
              <div className="text-muted-foreground">Μοντέλο: {result?.model}</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
