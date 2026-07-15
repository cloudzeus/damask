'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Sparkles, KeyRound, Wand2, GitBranch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardHeader, TextField, SecretField, SelectField, maskSecretPreview } from '../fields'
import { saveGeminiSettings, testGeminiSettings, type GeminiValues } from '../actions'
import type { CheckResult } from '@/lib/settings'

const MODEL_PRESETS = [
  { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro' },
  { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash (προεπιλογή)' },
  { value: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite' },
]
const CUSTOM_MODEL = '__custom__'
const isPresetModel = (v: string) => MODEL_PRESETS.some(p => p.value === v)

export function GeminiCard({
  initial, maskedApiKey, configured: initialConfigured, lastCheck: initialLastCheck,
}: {
  initial: Omit<GeminiValues, 'apiKey'>
  maskedApiKey: string | null
  configured: boolean
  lastCheck: CheckResult | null
}) {
  const [values, setValues] = useState<GeminiValues>({ ...initial, apiKey: '' })
  const [customModel, setCustomModel] = useState(values.model.trim() !== '' && !isPresetModel(values.model))
  const [maskedHint, setMaskedHint] = useState(maskedApiKey)
  const [configured, setConfigured] = useState(initialConfigured)
  const [lastCheck, setLastCheck] = useState(initialLastCheck)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()

  function set<K extends keyof GeminiValues>(key: K, value: GeminiValues[K]) {
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
      const res = await saveGeminiSettings(values)
      if (!res.ok) {
        toast.error(res.message)
        setFieldErrors(res.fieldErrors ?? {})
        return
      }
      toast.success(res.message)
      setFieldErrors({})
      const hadNewKey = values.apiKey.trim() !== ''
      if (hadNewKey) {
        setMaskedHint(maskSecretPreview(values.apiKey))
        set('apiKey', '')
      }
      setConfigured(Boolean(hadNewKey || maskedHint))
    })
  }

  function handleTest() {
    startTest(async () => {
      const result = await testGeminiSettings(values)
      setLastCheck(result)
      if (result.ok) toast.success(result.message)
      else toast.warning(result.message)
    })
  }

  return (
    <div className="glass p-4">
      <CardHeader
        icon={Sparkles}
        title="Google Gemini"
        description="Ανάγνωση παραστατικών (OCR) από φωτογραφίες/PDF — τιμολόγια, αποδείξεις, δελτία αποστολής."
        configured={configured}
        lastCheck={lastCheck}
      />
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <SecretField
          id="gemini-apikey" label="API Key" icon={KeyRound}
          value={values.apiKey} onChange={v => set('apiKey', v)} maskedHint={maskedHint} error={fieldErrors.apiKey}
        />
        <div>
          <SelectField
            id="gemini-model"
            label="Μοντέλο"
            value={customModel ? CUSTOM_MODEL : values.model}
            onChange={v => {
              if (v === CUSTOM_MODEL) { setCustomModel(true); return }
              setCustomModel(false)
              set('model', v)
            }}
            options={[...MODEL_PRESETS, { value: CUSTOM_MODEL, label: 'Άλλο (προσαρμοσμένο)…' }]}
          />
          {customModel && (
            <div className="-mt-2.5">
              <TextField
                id="gemini-model-custom" label="Προσαρμοσμένο μοντέλο" icon={Wand2}
                value={values.model} onChange={v => set('model', v)} error={fieldErrors.model}
                placeholder="π.χ. gemini-3.0-preview"
              />
            </div>
          )}
        </div>
      </div>
      <TextField
        id="gemini-fallback"
        label="Fallback μοντέλα σε υπερφόρτωση"
        icon={GitBranch}
        value={values.fallbackModels}
        onChange={v => set('fallbackModels', v)}
        error={fieldErrors.fallbackModels}
        placeholder="gemini-2.5-flash-lite"
        help="Χωρισμένα με κόμμα — δοκιμάζονται με τη σειρά όταν το κύριο μοντέλο απαντά «απασχολημένο» (HTTP 503)."
      />
      <div className="mt-1 flex items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
        <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>{testing ? 'Έλεγχος…' : 'Δοκιμή σύνδεσης'}</Button>
      </div>
    </div>
  )
}
