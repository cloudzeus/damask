'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Percent } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveAiMarkup, type AiMarkupFormValues } from './actions'
import type { AiMarkupSettings } from '@/lib/ai/markup'

const PROVIDER_FIELDS: { key: keyof Omit<AiMarkupFormValues, 'usdToEur'>; label: string }[] = [
  { key: 'deepseek', label: 'DeepSeek' },
  { key: 'gemini', label: 'Gemini' },
  { key: 'claude', label: 'Claude' },
  { key: 'other', label: 'Άλλο' },
]

function toFormValues(markup: AiMarkupSettings): AiMarkupFormValues {
  return {
    deepseek: String(markup.deepseek),
    gemini: String(markup.gemini),
    claude: String(markup.claude),
    other: String(markup.other),
    usdToEur: markup.usdToEur != null ? String(markup.usdToEur) : '',
  }
}

/**
 * SUPER_ADMIN μόνο (η σελίδα /costs δεν την περνάει καν στο DOM για ADMIN —
 * βλ. costs-view.tsx). Η ίδια η action (saveAiMarkup) ελέγχει ΚΑΙ αυτή
 * session.user.role === 'SUPER_ADMIN' ως δεύτερη γραμμή άμυνας.
 */
export function MarkupCard({ initial }: { initial: AiMarkupSettings }) {
  const [values, setValues] = useState<AiMarkupFormValues>(toFormValues(initial))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, startSave] = useTransition()

  function set<K extends keyof AiMarkupFormValues>(key: K, value: AiMarkupFormValues[K]) {
    setValues(prev => ({ ...prev, [key]: value }))
    setFieldErrors(errors => {
      if (!(key in errors)) return errors
      const next = { ...errors }
      delete next[key]
      return next
    })
  }

  function handleSave() {
    startSave(async () => {
      const res = await saveAiMarkup(values)
      if (!res.ok) {
        toast.error(res.message)
        setFieldErrors(res.fieldErrors ?? {})
        return
      }
      toast.success(res.message)
      setFieldErrors({})
    })
  }

  return (
    <div className="glass p-4">
      <div className="mb-3.5 flex items-start gap-3">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-[12px]"
          style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
        >
          <Percent className="size-4" strokeWidth={1.8} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14.5px] font-bold">Markup ανά υπηρεσία</h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Ποσοστό επιπλέον χρέωσης πάνω στο base USD cost — μόνο ο SUPER_ADMIN το βλέπει/αλλάζει. Ο ADMIN βλέπει μόνο το τελικό κόστος.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2 lg:grid-cols-4">
        {PROVIDER_FIELDS.map(f => (
          <div className="field" key={f.key}>
            <label htmlFor={`markup-${f.key}`}>{f.label} markup %</label>
            <div className="inwrap">
              <Percent aria-hidden />
              <input
                id={`markup-${f.key}`}
                type="number"
                step="0.1"
                value={values[f.key]}
                onChange={e => set(f.key, e.target.value)}
              />
            </div>
            {fieldErrors[f.key] && <div className="error">{fieldErrors[f.key]}</div>}
          </div>
        ))}
      </div>

      <div className="field">
        <label htmlFor="markup-usdToEur">USD→EUR override (προαιρετικό)</label>
        <div className="inwrap">
          <input
            id="markup-usdToEur"
            type="number"
            step="0.0001"
            placeholder="αυτόματο (Frankfurter)"
            value={values.usdToEur}
            onChange={e => set('usdToEur', e.target.value)}
          />
        </div>
        <div className="help">Άφησέ το κενό για αυτόματη ισοτιμία (Frankfurter) — χρησιμοποιείται ΜΟΝΟ όταν το API δεν απαντά.</div>
        {fieldErrors.usdToEur && <div className="error">{fieldErrors.usdToEur}</div>}
      </div>

      <div className="mt-1 flex items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
      </div>
    </div>
  )
}
