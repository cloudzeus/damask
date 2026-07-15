'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Target, Hash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardHeader, TextField } from '../fields'
import { saveFacebookSettings, type FacebookValues } from '../actions'

export function FacebookCard({
  initial, configured: initialConfigured,
}: {
  initial: FacebookValues
  configured: boolean
}) {
  const [values, setValues] = useState<FacebookValues>(initial)
  const [configured, setConfigured] = useState(initialConfigured)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, startSave] = useTransition()

  function set<K extends keyof FacebookValues>(key: K, value: FacebookValues[K]) {
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
      const res = await saveFacebookSettings(values)
      if (!res.ok) {
        toast.error(res.message)
        setFieldErrors(res.fieldErrors ?? {})
        return
      }
      toast.success(res.message)
      setFieldErrors({})
      setConfigured(Boolean(values.pixelId.trim()))
    })
  }

  return (
    <div className="glass p-4">
      <CardHeader
        icon={Target}
        title="Facebook"
        description="Facebook Pixel — ενεργοποιείται αυτόματα στο δημόσιο site όταν οριστεί."
        configured={configured}
        lastCheck={null}
      />
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <TextField id="facebook-pixel" label="Pixel ID" icon={Target} value={values.pixelId} onChange={v => set('pixelId', v)} error={fieldErrors.pixelId} placeholder="123456789012345" />
        <TextField id="facebook-appid" label="App ID (προαιρετικό)" icon={Hash} value={values.appId} onChange={v => set('appId', v)} error={fieldErrors.appId} />
      </div>
      <div className="mt-1">
        <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
      </div>
    </div>
  )
}
