'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { LuWand, LuCheck, LuTriangleAlert, LuSave, LuArrowRight } from 'react-icons/lu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { PRODUCT_TARGET, autoMatchField } from '@/lib/import/targets'
import { saveImportMapping } from './actions'
import type { ImportConfig } from './types'

export type MappingTemplate = { id: string; name: string; columnMap: Record<string, string> }

export function StepMapping({
  config,
  onChange,
  templates,
}: {
  config: ImportConfig
  onChange: (patch: Partial<ImportConfig>) => void
  templates: MappingTemplate[]
}) {
  const [saveOpen, setSaveOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [pending, startTransition] = useTransition()

  const activeColumns = useMemo(
    () => config.columns.filter(c => !config.excludedColumns.includes(c.index)),
    [config.columns, config.excludedColumns],
  )

  useEffect(() => {
    if (config.mappings.length === 0 && activeColumns.length > 0) {
      onChange({
        mappings: activeColumns.map(col => ({ colIndex: col.index, fieldKey: autoMatchField(col.header, PRODUCT_TARGET.fields) })),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function autoMap() {
    onChange({
      mappings: activeColumns.map(col => ({ colIndex: col.index, fieldKey: autoMatchField(col.header, PRODUCT_TARGET.fields) })),
      validation: null,
      execution: null,
    })
  }

  function setMapping(colIndex: number, fieldKey: string) {
    onChange({
      mappings: config.mappings.map(m => (m.colIndex === colIndex ? { ...m, fieldKey } : m)),
      validation: null,
      execution: null,
    })
  }

  function applyTemplate(template: MappingTemplate) {
    const byHeader = new Map(Object.entries(template.columnMap).map(([header, fieldKey]) => [header.trim().toLowerCase(), fieldKey]))
    onChange({
      mappings: activeColumns.map(col => ({ colIndex: col.index, fieldKey: byHeader.get(col.header.trim().toLowerCase()) ?? '' })),
      loadedTemplateName: template.name,
      validation: null,
      execution: null,
    })
    toast.success(`Εφαρμόστηκε το mapping «${template.name}».`)
  }

  function handleSaveTemplate() {
    if (!templateName.trim()) return
    const columnMap: Record<string, string> = {}
    for (const m of config.mappings) {
      if (!m.fieldKey) continue
      const col = activeColumns.find(c => c.index === m.colIndex)
      if (col) columnMap[col.header] = m.fieldKey
    }
    startTransition(async () => {
      const res = await saveImportMapping({ name: templateName.trim(), columnMap })
      if (res.ok) {
        toast.success(res.message)
        setSaveOpen(false)
        setTemplateName('')
      } else {
        toast.error(res.message)
      }
    })
  }

  const stats = useMemo(() => {
    const mapped = config.mappings.filter(m => m.fieldKey).length
    const usedKeys = new Set(config.mappings.filter(m => m.fieldKey).map(m => m.fieldKey))
    const missingRequired = PRODUCT_TARGET.fields.filter(f => f.required && !usedKeys.has(f.key))
    return { mapped, total: config.mappings.length, missingRequired }
  }, [config.mappings])

  const pct = stats.total > 0 ? Math.round((stats.mapped / stats.total) * 100) : 0

  const usedCounts = new Map<string, number>()
  config.mappings.forEach(m => { if (m.fieldKey) usedCounts.set(m.fieldKey, (usedCounts.get(m.fieldKey) ?? 0) + 1) })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold">Αντιστοίχιση στηλών</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Πες στον οδηγό ποια στήλη Excel αντιστοιχεί σε ποιο πεδίο προϊόντος.</p>
        </div>
        <div className="flex items-center gap-2">
          {templates.length > 0 && (
            <Select onValueChange={id => { const t = templates.find(x => x.id === id); if (t) applyTemplate(t) }}>
              <SelectTrigger size="sm" aria-label="Φόρτωση αποθηκευμένου mapping">
                <SelectValue placeholder="Φόρτωση mapping…" />
              </SelectTrigger>
              <SelectContent>
                {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={autoMap}>
            <LuWand className="size-3.5" /> Αυτόματη αντιστοίχιση
          </Button>
          <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
            <Button type="button" variant="outline" size="sm" onClick={() => setSaveOpen(true)}>
              <LuSave className="size-3.5" /> Αποθήκευση ως…
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Αποθήκευση mapping</DialogTitle>
                <DialogDescription>Θα μπορείς να το ξαναφορτώσεις σε επόμενη εισαγωγή προϊόντων.</DialogDescription>
              </DialogHeader>
              <div className="field">
                <label htmlFor="import-mapping-name">Όνομα mapping</label>
                <div className="inwrap">
                  <LuSave aria-hidden />
                  <input
                    id="import-mapping-name"
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                    placeholder="π.χ. Τιμοκατάλογος προμηθευτή Α"
                    maxLength={100}
                    autoFocus
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline">Άκυρο</Button>} />
                <Button type="button" onClick={handleSaveTemplate} disabled={pending || !templateName.trim()}>
                  {pending ? 'Αποθήκευση…' : 'Αποθήκευση'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRODUCT_TARGET.fields.map(f => (
          <span
            key={f.key}
            className="badge-pill"
            style={{
              color: f.required ? 'var(--info)' : 'var(--muted-foreground)',
              background: f.required ? 'var(--info-soft)' : 'var(--muted)',
            }}
          >
            {f.label}{f.required && <span style={{ color: 'var(--destructive)' }}>*</span>}
          </span>
        ))}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[12px]">
          <span><b>{stats.mapped}</b> από {stats.total} στήλες αντιστοιχισμένες</span>
          <span style={{ color: pct === 100 ? 'var(--success)' : 'var(--muted-foreground)' }}>{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: pct === 100 ? 'var(--success)' : 'var(--info)' }} />
        </div>
      </div>

      {stats.missingRequired.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12px]" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
          <LuTriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Υποχρεωτικά πεδία χωρίς αντιστοίχιση: {stats.missingRequired.map(f => <strong key={f.key}>{f.label}</strong>).reduce<React.ReactNode[]>((acc, el, i) => (i === 0 ? [el] : [...acc, ', ', el]), [])}
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid gap-3 px-4 py-2 text-[10px] font-bold tracking-widest text-muted-foreground uppercase" style={{ gridTemplateColumns: '1fr 28px 1fr 24px', background: 'var(--muted)' }}>
          <span>Στήλη Excel</span><span /><span>Πεδίο προϊόντος</span><span />
        </div>
        {config.mappings.map((m, idx) => {
          const col = activeColumns.find(c => c.index === m.colIndex)
          if (!col) return null
          const isDuplicate = m.fieldKey && (usedCounts.get(m.fieldKey) ?? 0) > 1
          const isMapped = !!m.fieldKey
          const sample = (config.sheetRows[config.selectedSheet] ?? [])
            .filter(r => r.rowNum > config.headerRow)
            .map(r => r.cells[col.index])
            .filter((v): v is string => !!v)
            .slice(0, 2)

          return (
            <div
              key={m.colIndex}
              className="dotted-row-bottom grid items-center gap-3 px-4 py-3"
              style={{ gridTemplateColumns: '1fr 28px 1fr 24px', background: idx % 2 === 0 ? 'var(--card)' : 'var(--muted)' }}
            >
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-semibold">
                  <span className="mr-1.5 font-mono text-[10px] text-muted-foreground">{col.colLetter}</span>
                  {col.header}
                </p>
                {sample.length > 0 && <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">π.χ. {sample.join(' · ')}</p>}
              </div>
              <LuArrowRight className="mx-auto size-4" style={{ color: isMapped ? 'var(--info)' : 'var(--border)' }} />
              <Select value={m.fieldKey || '__skip__'} onValueChange={v => setMapping(m.colIndex, !v || v === '__skip__' ? '' : v)}>
                <SelectTrigger
                  size="sm"
                  className="w-full"
                  style={isDuplicate ? { borderColor: 'var(--warning)' } : undefined}
                  aria-label={`Πεδίο για στήλη ${col.header}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__skip__">— παράβλεψη —</SelectItem>
                  {PRODUCT_TARGET.fields.map(f => (
                    <SelectItem key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex justify-center">
                {isMapped ? (
                  <span className="flex size-4 items-center justify-center rounded-full" style={{ background: isDuplicate ? 'var(--warning-soft)' : 'var(--success-soft)' }}>
                    <LuCheck className="size-2.5" style={{ color: isDuplicate ? 'var(--warning)' : 'var(--success)' }} />
                  </span>
                ) : (
                  <span className="size-4 rounded-full bg-border" />
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Τα πεδία με <strong>*</strong> είναι υποχρεωτικά. Στήλες χωρίς αντιστοίχιση αγνοούνται στην εισαγωγή.
      </p>
    </div>
  )
}
