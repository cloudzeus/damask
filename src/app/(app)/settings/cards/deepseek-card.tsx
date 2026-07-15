'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Languages, KeyRound, Globe2, Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardHeader, TextField, SecretField, maskSecretPreview } from '../fields'
import { saveDeepseekSettings, testDeepseekSettings, type DeepseekValues } from '../actions'
import type { CheckResult } from '@/lib/settings'

export function DeepseekCard({
  initial, maskedApiKey, configured: initialConfigured, lastCheck: initialLastCheck,
}: {
  initial: Omit<DeepseekValues, 'apiKey'>
  maskedApiKey: string | null
  configured: boolean
  lastCheck: CheckResult | null
}) {
  const [values, setValues] = useState<DeepseekValues>({ ...initial, apiKey: '' })
  const [maskedHint, setMaskedHint] = useState(maskedApiKey)
  const [configured, setConfigured] = useState(initialConfigured)
  const [lastCheck, setLastCheck] = useState(initialLastCheck)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()

  function set<K extends keyof DeepseekValues>(key: K, value: DeepseekValues[K]) {
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
      const res = await saveDeepseekSettings(values)
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
      const result = await testDeepseekSettings(values)
      setLastCheck(result)
      if (result.ok) toast.success(result.message)
      else toast.warning(result.message)
    })
  }

  return (
    <div className="glass p-4">
      <CardHeader
        icon={Languages}
        title="DeepSeek"
        description="Μεταφράσεις & περιγραφές προϊόντων μέσω DeepSeek chat completions."
        configured={configured}
        lastCheck={lastCheck}
      />
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <SecretField id="deepseek-apikey" label="API Key" icon={KeyRound} value={values.apiKey} onChange={v => set('apiKey', v)} maskedHint={maskedHint} error={fieldErrors.apiKey} />
        <TextField id="deepseek-model" label="Μοντέλο" icon={Bot} value={values.model} onChange={v => set('model', v)} error={fieldErrors.model} placeholder="deepseek-chat" />
        <TextField id="deepseek-apiurl" label="API URL" icon={Globe2} value={values.apiUrl} onChange={v => set('apiUrl', v)} error={fieldErrors.apiUrl} placeholder="https://api.deepseek.com/v1/chat/completions" />
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
        <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>{testing ? 'Έλεγχος…' : 'Δοκιμή σύνδεσης'}</Button>
      </div>
    </div>
  )
}
