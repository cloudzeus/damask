'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Bot, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardHeader, TextField, SecretField, maskSecretPreview } from '../fields'
import { saveClaudeSettings, testClaudeSettings, type ClaudeValues } from '../actions'
import type { CheckResult } from '@/lib/settings'

export function ClaudeCard({
  initial, maskedApiKey, configured: initialConfigured, lastCheck: initialLastCheck,
}: {
  initial: Omit<ClaudeValues, 'apiKey'>
  maskedApiKey: string | null
  configured: boolean
  lastCheck: CheckResult | null
}) {
  const [values, setValues] = useState<ClaudeValues>({ ...initial, apiKey: '' })
  const [maskedHint, setMaskedHint] = useState(maskedApiKey)
  const [configured, setConfigured] = useState(initialConfigured)
  const [lastCheck, setLastCheck] = useState(initialLastCheck)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()

  function set<K extends keyof ClaudeValues>(key: K, value: ClaudeValues[K]) {
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
      const res = await saveClaudeSettings(values)
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
      const result = await testClaudeSettings(values)
      setLastCheck(result)
      if (result.ok) toast.success(result.message)
      else toast.warning(result.message)
    })
  }

  return (
    <div className="glass p-4">
      <CardHeader
        icon={Bot}
        title="Claude API"
        description="Anthropic Messages API — δοκιμή απευθείας σύνδεσης."
        configured={configured}
        lastCheck={lastCheck}
      />
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <SecretField id="claude-apikey" label="API Key" icon={KeyRound} value={values.apiKey} onChange={v => set('apiKey', v)} maskedHint={maskedHint} error={fieldErrors.apiKey} />
        <TextField id="claude-model" label="Μοντέλο" icon={Bot} value={values.model} onChange={v => set('model', v)} error={fieldErrors.model} placeholder="claude-fable-5" />
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
        <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>{testing ? 'Έλεγχος…' : 'Δοκιμή σύνδεσης'}</Button>
      </div>
    </div>
  )
}
