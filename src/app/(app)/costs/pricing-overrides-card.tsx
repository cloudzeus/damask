'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Trash2, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { savePricingOverride, deletePricingOverride } from './actions'
import type { PricingOverrides } from '@/lib/ai/pricing'

const EMPTY_FORM = { model: '', inputPerMTokens: '', outputPerMTokens: '' }

/**
 * SUPER_ADMIN μόνο — «Overrides τιμολόγησης μοντέλων» (setting
 * ai.pricingOverrides, βλ. src/lib/ai/pricing.ts resolvePricing): επιτρέπει
 * να διορθωθούν οι $/1M τιμές ενός μοντέλου χωρίς deploy (π.χ. ο πάροχος
 * άλλαξε τιμή, ή ένα νέο μοντέλο δεν υπάρχει ακόμα στο ενσωματωμένο PRICING).
 */
export function PricingOverridesCard({ initial }: { initial: PricingOverrides }) {
  const [overrides, setOverrides] = useState<PricingOverrides>(initial)
  const [form, setForm] = useState(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, startSave] = useTransition()
  const [deletingModel, setDeletingModel] = useState<string | null>(null)
  const [deleting, startDelete] = useTransition()

  function handleAdd() {
    startSave(async () => {
      const res = await savePricingOverride(form)
      if (!res.ok) {
        toast.error(res.message)
        setFieldErrors(res.fieldErrors ?? {})
        return
      }
      toast.success(res.message)
      setFieldErrors({})
      setOverrides(prev => ({
        ...prev,
        [form.model.trim()]: {
          inputPerMTokens: Number(form.inputPerMTokens),
          outputPerMTokens: Number(form.outputPerMTokens),
        },
      }))
      setForm(EMPTY_FORM)
    })
  }

  function handleDelete(model: string) {
    setDeletingModel(model)
    startDelete(async () => {
      const res = await deletePricingOverride(model)
      if (!res.ok) {
        toast.error(res.message)
        setDeletingModel(null)
        return
      }
      setOverrides(prev => {
        const next = { ...prev }
        delete next[model]
        return next
      })
      setDeletingModel(null)
    })
  }

  const entries = Object.entries(overrides)

  return (
    <div className="glass p-4">
      <div className="mb-3.5 flex items-start gap-3">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-[12px]"
          style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
        >
          <Tag className="size-4" strokeWidth={1.8} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14.5px] font-bold">Overrides τιμολόγησης μοντέλων</h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Διορθώνει $/1M tokens για ένα μοντέλο χωρίς deploy — υπερισχύει του ενσωματωμένου pricing table.
          </p>
        </div>
      </div>

      {entries.length > 0 && (
        <div className="table-wrap mb-3">
          <table className="data-table">
            <thead>
              <tr>
                <th>Μοντέλο</th>
                <th className="num">Input $/1M</th>
                <th className="num">Output $/1M</th>
                <th className="ctr" style={{ width: 40 }}>⋯</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([model, entry]) => (
                <tr key={model} className="dotted-row-bottom">
                  <td className="font-mono text-[12px]">{model}</td>
                  <td className="num tabular-nums">${entry.inputPerMTokens}</td>
                  <td className="num tabular-nums">${entry.outputPerMTokens}</td>
                  <td className="ctr">
                    <Button
                      type="button" variant="ghost" size="icon"
                      aria-label={`Αφαίρεση override για ${model}`}
                      onClick={() => handleDelete(model)}
                      disabled={deleting && deletingModel === model}
                    >
                      <Trash2 className="size-3.5" strokeWidth={1.8} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-3">
        <div className="field">
          <label htmlFor="pricing-override-model">Μοντέλο</label>
          <div className="inwrap">
            <input
              id="pricing-override-model"
              value={form.model}
              onChange={e => setForm(prev => ({ ...prev, model: e.target.value }))}
              placeholder="π.χ. claude-sonnet-5"
            />
          </div>
          {fieldErrors.model && <div className="error">{fieldErrors.model}</div>}
        </div>
        <div className="field">
          <label htmlFor="pricing-override-input">Input $/1M tokens</label>
          <div className="inwrap">
            <input
              id="pricing-override-input"
              type="number" step="0.01" min="0"
              value={form.inputPerMTokens}
              onChange={e => setForm(prev => ({ ...prev, inputPerMTokens: e.target.value }))}
            />
          </div>
          {fieldErrors.inputPerMTokens && <div className="error">{fieldErrors.inputPerMTokens}</div>}
        </div>
        <div className="field">
          <label htmlFor="pricing-override-output">Output $/1M tokens</label>
          <div className="inwrap">
            <input
              id="pricing-override-output"
              type="number" step="0.01" min="0"
              value={form.outputPerMTokens}
              onChange={e => setForm(prev => ({ ...prev, outputPerMTokens: e.target.value }))}
            />
          </div>
          {fieldErrors.outputPerMTokens && <div className="error">{fieldErrors.outputPerMTokens}</div>}
        </div>
      </div>

      <div className="mt-1 flex items-center gap-2">
        <Button type="button" onClick={handleAdd} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Προσθήκη / Ενημέρωση'}</Button>
      </div>
    </div>
  )
}
