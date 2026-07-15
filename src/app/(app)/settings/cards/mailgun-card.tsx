'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Mail, KeyRound, Globe2, AtSign, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardHeader, TextField, SecretField, SelectField, maskSecretPreview } from '../fields'
import { saveMailgunSettings, testMailgunSettings, type MailgunValues } from '../actions'
import type { CheckResult } from '@/lib/settings'

const REGION_OPTIONS = [
  { value: 'US', label: 'US (api.mailgun.net)' },
  { value: 'EU', label: 'EU (api.eu.mailgun.net)' },
]

export function MailgunCard({
  initial, maskedApiKey, configured: initialConfigured, lastCheck: initialLastCheck,
}: {
  initial: Omit<MailgunValues, 'apiKey'>
  maskedApiKey: string | null
  configured: boolean
  lastCheck: CheckResult | null
}) {
  const [values, setValues] = useState<MailgunValues>({ ...initial, apiKey: '' })
  const [maskedHint, setMaskedHint] = useState(maskedApiKey)
  const [configured, setConfigured] = useState(initialConfigured)
  const [lastCheck, setLastCheck] = useState(initialLastCheck)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()

  function set<K extends keyof MailgunValues>(key: K, value: MailgunValues[K]) {
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
      const res = await saveMailgunSettings(values)
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
      setConfigured(Boolean((hadNewKey || maskedHint) && values.domain.trim()))
    })
  }

  function handleTest() {
    startTest(async () => {
      const result = await testMailgunSettings(values)
      setLastCheck(result)
      if (result.ok) toast.success(result.message)
      else toast.warning(result.message)
    })
  }

  return (
    <div className="glass p-4">
      <CardHeader
        icon={Mail}
        title="Mailgun"
        description="Αποστολή email (επαναφορά κωδικού, ειδοποιήσεις) μέσω Mailgun REST."
        configured={configured}
        lastCheck={lastCheck}
      />
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <SecretField id="mailgun-apikey" label="API Key" icon={KeyRound} value={values.apiKey} onChange={v => set('apiKey', v)} maskedHint={maskedHint} error={fieldErrors.apiKey} />
        <TextField id="mailgun-domain" label="Domain" icon={Globe2} value={values.domain} onChange={v => set('domain', v)} error={fieldErrors.domain} placeholder="mg.example.com" />
        <SelectField id="mailgun-region" label="Περιοχή" value={values.region} onChange={v => set('region', v)} options={REGION_OPTIONS} />
        <TextField id="mailgun-from-email" label="Αποστολέας (email)" icon={AtSign} type="email" value={values.fromEmail} onChange={v => set('fromEmail', v)} error={fieldErrors.fromEmail} placeholder="noreply@damask.gr" />
        <TextField id="mailgun-from-name" label="Αποστολέας (όνομα)" icon={Tag} value={values.fromName} onChange={v => set('fromName', v)} error={fieldErrors.fromName} placeholder="DAMASK" />
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
        <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>{testing ? 'Έλεγχος…' : 'Δοκιμή σύνδεσης'}</Button>
      </div>
    </div>
  )
}
