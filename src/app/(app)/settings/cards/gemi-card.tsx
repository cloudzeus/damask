'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Building2, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardHeader, SecretField, maskSecretPreview } from '../fields'
import { saveGemiSettings, testGemiSettings, type GemiValues } from '../actions'
import type { CheckResult } from '@/lib/settings'

/**
 * ΓΕΜΗ (opendata-api.businessportal.gr) — καταναλώνεται από src/lib/trdr/gemi.ts
 * (Συγχρονισμός ΓΕΜΗ στους συναλλασσόμενους, /partners). Ίδιο idiom με τις
 * υπόλοιπες apiKey-only κάρτες (DeepSeek/Claude) — «Δοκιμή σύνδεσης» καλεί
 * gemiMetadata.legalTypes() με το (πιθανώς μη αποθηκευμένο ακόμα) κλειδί.
 */
export function GemiCard({
  maskedApiKey, configured: initialConfigured, lastCheck: initialLastCheck,
}: {
  maskedApiKey: string | null
  configured: boolean
  lastCheck: CheckResult | null
}) {
  const [values, setValues] = useState<GemiValues>({ apiKey: '' })
  const [maskedHint, setMaskedHint] = useState(maskedApiKey)
  const [configured, setConfigured] = useState(initialConfigured)
  const [lastCheck, setLastCheck] = useState(initialLastCheck)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()

  function set<K extends keyof GemiValues>(key: K, value: GemiValues[K]) {
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
      const res = await saveGemiSettings(values)
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
      const result = await testGemiSettings(values)
      setLastCheck(result)
      if (result.ok) toast.success(result.message)
      else toast.warning(result.message)
    })
  }

  return (
    <div className="glass p-4">
      <CardHeader
        icon={Building2}
        title="ΓΕΜΗ"
        description="Στοιχεία επιχειρήσεων & έγγραφα από το Open Data API (opendata.businessportal.gr) στους συναλλασσόμενους."
        configured={configured}
        lastCheck={lastCheck}
      />
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <SecretField id="gemi-apikey" label="API Key" icon={KeyRound} value={values.apiKey} onChange={v => set('apiKey', v)} maskedHint={maskedHint} error={fieldErrors.apiKey} />
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
        <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>{testing ? 'Έλεγχος…' : 'Δοκιμή σύνδεσης'}</Button>
      </div>
    </div>
  )
}
