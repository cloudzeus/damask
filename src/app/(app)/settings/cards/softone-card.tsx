'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Server, User, KeyRound, Fingerprint, Building2, GitBranch, Layers3, Hash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardHeader, TextField, SecretField, maskSecretPreview } from '../fields'
import { saveSoftoneSettings, testSoftoneSettings, type SoftoneValues } from '../actions'
import type { CheckResult } from '@/lib/settings'

export function SoftoneCard({
  initial, maskedPassword, configured: initialConfigured, lastCheck: initialLastCheck,
}: {
  initial: Omit<SoftoneValues, 'password'>
  maskedPassword: string | null
  configured: boolean
  lastCheck: CheckResult | null
}) {
  const [values, setValues] = useState<SoftoneValues>({ ...initial, password: '' })
  const [maskedHint, setMaskedHint] = useState(maskedPassword)
  const [configured, setConfigured] = useState(initialConfigured)
  const [lastCheck, setLastCheck] = useState(initialLastCheck)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()

  function set<K extends keyof SoftoneValues>(key: K, value: SoftoneValues[K]) {
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
      const res = await saveSoftoneSettings(values)
      if (!res.ok) {
        toast.error(res.message)
        setFieldErrors(res.fieldErrors ?? {})
        return
      }
      toast.success(res.message)
      setFieldErrors({})
      const hadNewPassword = values.password.trim() !== ''
      if (hadNewPassword) {
        setMaskedHint(maskSecretPreview(values.password))
        set('password', '')
      }
      setConfigured(Boolean(values.serial.trim() && values.username.trim() && (hadNewPassword || maskedHint) && values.appId.trim()))
    })
  }

  function handleTest() {
    startTest(async () => {
      const result = await testSoftoneSettings(values)
      setLastCheck(result)
      if (result.ok) toast.success(result.message)
      else toast.warning(result.message)
    })
  }

  return (
    <div className="glass p-4">
      <CardHeader
        icon={Server}
        title="SoftOne ERP"
        description="Σύνδεση με το SoftOne oncloud για συγχρονισμό δεδομένων (login → authenticate)."
        configured={configured}
        lastCheck={lastCheck}
      />
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <TextField id="softone-serial" label="Serial" icon={Server} value={values.serial} onChange={v => set('serial', v)} error={fieldErrors.serial} placeholder="π.χ. 12345" />
        <TextField id="softone-username" label="Username" icon={User} value={values.username} onChange={v => set('username', v)} error={fieldErrors.username} />
        <SecretField id="softone-password" label="Password" icon={KeyRound} value={values.password} onChange={v => set('password', v)} maskedHint={maskedHint} error={fieldErrors.password} />
        <TextField id="softone-appid" label="App ID" icon={Fingerprint} value={values.appId} onChange={v => set('appId', v)} error={fieldErrors.appId} />
        <TextField id="softone-company" label="Company" icon={Building2} value={values.company} onChange={v => set('company', v)} error={fieldErrors.company} />
        <TextField id="softone-branch" label="Branch" icon={GitBranch} value={values.branch} onChange={v => set('branch', v)} error={fieldErrors.branch} />
        <TextField id="softone-module" label="Module" icon={Layers3} value={values.module} onChange={v => set('module', v)} error={fieldErrors.module} />
        <TextField id="softone-refid" label="Ref ID" icon={Hash} value={values.refid} onChange={v => set('refid', v)} error={fieldErrors.refid} />
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
        <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>{testing ? 'Έλεγχος…' : 'Δοκιμή σύνδεσης'}</Button>
      </div>
    </div>
  )
}
