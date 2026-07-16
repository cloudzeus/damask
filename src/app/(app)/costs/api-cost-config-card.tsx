'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveApiCostConfig, type ApiCostConfigFormValues } from './actions'
import type { ResolvedApiCostConfig } from '@/lib/api-costs'

type RowState = { basePrice: string; freeQuota: string; markupPercent: string }

/** Συμπαγές input styling μέσα σε table cell — ΟΧΙ το pill-shaped `.inwrap input` (44px, φτιαγμένο για φόρμες), ίδιο πνεύμα με το "compact 14px" UI preference. */
const COMPACT_INPUT_CLASS =
  'w-full rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-right text-[12.5px] tabular-nums outline-none transition-shadow focus-visible:border-[var(--info)] focus-visible:shadow-[0_0_0_3px_var(--info-soft)]'

function toRowState(cfg: ResolvedApiCostConfig): RowState {
  return { basePrice: String(cfg.basePrice), freeQuota: String(cfg.freeQuota), markupPercent: String(cfg.markupPercent) }
}

/**
 * «Ρυθμίσεις API κόστους» — SUPER_ADMIN μόνο (η σελίδα /costs δεν την περνάει
 * καν στο DOM για ADMIN, ίδιο idiom με MarkupCard/PricingOverridesCard). Μία
 * γραμμή ανά γνωστή υπηρεσία (ΟΧΙ add/remove — το σύνολο υπηρεσιών είναι
 * fixed v1 list, βλ. DEFAULT_API_COSTS), κάθε γραμμή αποθηκεύεται ανεξάρτητα
 * (saveApiCostConfig merges στο "api.costConfig" setting ανά service, δεν
 * αγγίζει τις υπόλοιπες).
 */
export function ApiCostConfigCard({ initial }: { initial: Record<string, ResolvedApiCostConfig> }) {
  const services = Object.values(initial).sort((a, b) => a.displayName.localeCompare(b.displayName))
  const [rows, setRows] = useState<Record<string, RowState>>(
    () => Object.fromEntries(services.map(s => [s.service, toRowState(s)])),
  )
  const [fieldErrors, setFieldErrors] = useState<Record<string, Record<string, string>>>({})
  const [savingService, setSavingService] = useState<string | null>(null)
  const [saving, startSave] = useTransition()

  function setField(service: string, key: keyof RowState, value: string) {
    setRows(prev => ({ ...prev, [service]: { ...prev[service], [key]: value } }))
    setFieldErrors(prev => {
      if (!prev[service]?.[key]) return prev
      const next = { ...prev, [service]: { ...prev[service] } }
      delete next[service][key]
      return next
    })
  }

  function handleSave(service: string) {
    setSavingService(service)
    startSave(async () => {
      const values: ApiCostConfigFormValues = { service, ...rows[service] }
      const res = await saveApiCostConfig(values)
      if (!res.ok) {
        toast.error(res.message)
        setFieldErrors(prev => ({ ...prev, [service]: res.fieldErrors ?? {} }))
        setSavingService(null)
        return
      }
      toast.success(res.message)
      setFieldErrors(prev => ({ ...prev, [service]: {} }))
      setSavingService(null)
    })
  }

  return (
    <div className="glass p-4">
      <div className="mb-3.5 flex items-start gap-3">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-[12px]"
          style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
        >
          <Settings2 className="size-4" strokeWidth={1.8} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14.5px] font-bold">Ρυθμίσεις API κόστους</h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Τιμή/μονάδα (EUR), δωρεάν μονάδες/μήνα, markup % — ανά υπηρεσία. Άδειο σημαίνει τιμή 0.
          </p>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Υπηρεσία</th>
              <th className="num">Τιμή/μονάδα (€)</th>
              <th className="num">Free quota / μήνα</th>
              <th className="num">Markup %</th>
              <th className="ctr" style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {services.map(s => {
              const row = rows[s.service]
              const errors = fieldErrors[s.service] ?? {}
              return (
                <tr key={s.service} className="dotted-row-bottom">
                  <td>
                    <div className="font-semibold">{s.displayName}</div>
                    <div className="text-[11px] text-muted-foreground">{s.unitLabel}</div>
                  </td>
                  <td className="num">
                    <input
                      type="number" step="0.0001" min="0"
                      value={row.basePrice}
                      onChange={e => setField(s.service, 'basePrice', e.target.value)}
                      className={COMPACT_INPUT_CLASS}
                      aria-label={`Τιμή/μονάδα ${s.displayName}`}
                    />
                    {errors.basePrice && <div className="error">{errors.basePrice}</div>}
                  </td>
                  <td className="num">
                    <input
                      type="number" step="1" min="0"
                      value={row.freeQuota}
                      onChange={e => setField(s.service, 'freeQuota', e.target.value)}
                      className={COMPACT_INPUT_CLASS}
                      aria-label={`Free quota ${s.displayName}`}
                    />
                    {errors.freeQuota && <div className="error">{errors.freeQuota}</div>}
                  </td>
                  <td className="num">
                    <input
                      type="number" step="0.1"
                      value={row.markupPercent}
                      onChange={e => setField(s.service, 'markupPercent', e.target.value)}
                      className={COMPACT_INPUT_CLASS}
                      aria-label={`Markup % ${s.displayName}`}
                    />
                    {errors.markupPercent && <div className="error">{errors.markupPercent}</div>}
                  </td>
                  <td className="ctr">
                    <Button
                      type="button" size="sm" variant="outline"
                      onClick={() => handleSave(s.service)}
                      disabled={saving && savingService === s.service}
                    >
                      {saving && savingService === s.service ? '…' : 'Αποθήκευση'}
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
