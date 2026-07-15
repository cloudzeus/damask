'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { HardDrive, KeyRound, Globe2, Link2, Cloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardHeader, TextField, SecretField, maskSecretPreview } from '../fields'
import { saveBunnySettings, testBunnySettings, type BunnyValues } from '../actions'
import type { CheckResult } from '@/lib/settings'

export function BunnyCard({
  initial, maskedStoragePassword, configured: initialConfigured, lastCheck: initialLastCheck,
}: {
  initial: Omit<BunnyValues, 'storagePassword'>
  maskedStoragePassword: string | null
  configured: boolean
  lastCheck: CheckResult | null
}) {
  const [values, setValues] = useState<BunnyValues>({ ...initial, storagePassword: '' })
  const [maskedHint, setMaskedHint] = useState(maskedStoragePassword)
  const [configured, setConfigured] = useState(initialConfigured)
  const [lastCheck, setLastCheck] = useState(initialLastCheck)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()

  function set<K extends keyof BunnyValues>(key: K, value: BunnyValues[K]) {
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
      const res = await saveBunnySettings(values)
      if (!res.ok) {
        toast.error(res.message)
        setFieldErrors(res.fieldErrors ?? {})
        return
      }
      toast.success(res.message)
      setFieldErrors({})
      const hadNewPassword = values.storagePassword.trim() !== ''
      if (hadNewPassword) {
        setMaskedHint(maskSecretPreview(values.storagePassword))
        set('storagePassword', '')
      }
      setConfigured(Boolean(values.storageZone.trim() && (hadNewPassword || maskedHint) && values.storageApi.trim() && values.pullZoneUrl.trim()))
    })
  }

  function handleTest() {
    startTest(async () => {
      const result = await testBunnySettings(values)
      setLastCheck(result)
      if (result.ok) toast.success(result.message)
      else toast.warning(result.message)
    })
  }

  return (
    <div className="glass p-4">
      <CardHeader
        icon={Cloud}
        title="BunnyCDN"
        description="Storage + CDN για media assets (λογότυπα, φωτογραφίες προϊόντων)."
        configured={configured}
        lastCheck={lastCheck}
      />
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <TextField id="bunny-zone" label="Storage Zone" icon={HardDrive} value={values.storageZone} onChange={v => set('storageZone', v)} error={fieldErrors.storageZone} />
        <SecretField id="bunny-password" label="Storage Password (AccessKey)" icon={KeyRound} value={values.storagePassword} onChange={v => set('storagePassword', v)} maskedHint={maskedHint} error={fieldErrors.storagePassword} />
        <TextField id="bunny-api" label="Storage API" icon={Globe2} value={values.storageApi} onChange={v => set('storageApi', v)} error={fieldErrors.storageApi} placeholder="https://storage.bunnycdn.com" />
        <TextField id="bunny-s3" label="S3 Endpoint (προαιρετικό)" icon={Link2} value={values.s3Endpoint} onChange={v => set('s3Endpoint', v)} error={fieldErrors.s3Endpoint} placeholder="https://de-s3.storage.bunnycdn.com" />
        <TextField id="bunny-pullzone" label="Pull Zone URL" icon={Link2} value={values.pullZoneUrl} onChange={v => set('pullZoneUrl', v)} error={fieldErrors.pullZoneUrl} placeholder="https://damask-1.b-cdn.net" />
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
        <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>{testing ? 'Έλεγχος…' : 'Δοκιμή σύνδεσης'}</Button>
      </div>
    </div>
  )
}
