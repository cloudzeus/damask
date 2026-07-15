'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Tags, BarChart3, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardHeader, TextField } from '../fields'
import { saveGoogleTagsSettings, type GoogleTagsValues } from '../actions'

export function GoogleTagsCard({
  initial, configured: initialConfigured,
}: {
  initial: GoogleTagsValues
  configured: boolean
}) {
  const [values, setValues] = useState<GoogleTagsValues>(initial)
  const [configured, setConfigured] = useState(initialConfigured)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, startSave] = useTransition()

  function set<K extends keyof GoogleTagsValues>(key: K, value: GoogleTagsValues[K]) {
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
      const res = await saveGoogleTagsSettings(values)
      if (!res.ok) {
        toast.error(res.message)
        setFieldErrors(res.fieldErrors ?? {})
        return
      }
      toast.success(res.message)
      setFieldErrors({})
      setConfigured(Boolean(values.gtagId.trim() || values.gtmId.trim()))
    })
  }

  return (
    <div className="glass p-4">
      <CardHeader
        icon={Tags}
        title="Google Tags"
        description="Google Analytics (gtag.js) / Tag Manager — ενεργοποιείται αυτόματα στο δημόσιο site όταν οριστεί."
        configured={configured}
        lastCheck={null}
      />
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <TextField id="gtags-gtag" label="Google Analytics ID" icon={BarChart3} value={values.gtagId} onChange={v => set('gtagId', v)} error={fieldErrors.gtagId} placeholder="G-XXXXXXXXXX" />
        <TextField id="gtags-gtm" label="Google Tag Manager ID" icon={Tags} value={values.gtmId} onChange={v => set('gtmId', v)} error={fieldErrors.gtmId} placeholder="GTM-XXXXXXX" />
        <TextField id="gtags-verification" label="Site Verification" icon={ShieldCheck} value={values.siteVerification} onChange={v => set('siteVerification', v)} error={fieldErrors.siteVerification} placeholder="κωδικός επαλήθευσης Google Search Console" />
      </div>
      <div className="mt-1">
        <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
      </div>
    </div>
  )
}
