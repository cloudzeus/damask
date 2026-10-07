'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { HardDrive, Link2, User, KeyRound, FolderTree } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { CardHeader, TextField, SecretField, maskSecretPreview } from '../fields'
import { saveSynologySettings, testSynologySettings, type SynologyValues } from '../actions'
import type { CheckResult } from '@/lib/settings'

/**
 * Synology NAS — προορισμός backup των αρχείων (src/lib/nas/*). Ο server φτάνει στο NAS
 * μέσω Tailscale (π.χ. http://100.x.y.z:5000). «Δοκιμή σύνδεσης»: login, φάκελος backup,
 * δοκιμαστικό αρχείο, ελεύθερος χώρος.
 */
export function SynologyCard({
  initial, maskedPassword, configured: initialConfigured, lastCheck: initialLastCheck,
}: {
  initial: Omit<SynologyValues, 'password'>
  maskedPassword: string | null
  configured: boolean
  lastCheck: CheckResult | null
}) {
  const [values, setValues] = useState<SynologyValues>({ ...initial, password: '' })
  const [maskedHint, setMaskedHint] = useState(maskedPassword)
  const [configured, setConfigured] = useState(initialConfigured)
  const [lastCheck, setLastCheck] = useState(initialLastCheck)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()

  const set = <K extends keyof SynologyValues>(k: K, v: SynologyValues[K]) => {
    setValues(prev => ({ ...prev, [k]: v }))
    setFieldErrors(e => { if (!(k in e)) return e; const n = { ...e }; delete n[k]; return n })
  }

  function handleSave() {
    startSave(async () => {
      const res = await saveSynologySettings(values)
      if (!res.ok) { toast.error(res.message); setFieldErrors(res.fieldErrors ?? {}); return }
      toast.success(res.message)
      if (values.password) { setMaskedHint(maskSecretPreview(values.password)); set('password', '') }
      setConfigured(Boolean(values.baseUrl && values.username && (values.password || maskedHint)))
    })
  }

  function handleTest() {
    startTest(async () => {
      const r = await testSynologySettings(values)
      setLastCheck(r)
      if (r.ok) toast.success(r.message)
      else toast.warning(r.message)
    })
  }

  return (
    <div className="glass p-4">
      <CardHeader
        icon={HardDrive}
        title="Synology NAS (backup αρχείων)"
        description="Νυχτερινό incremental backup όλων των αρχείων (πελάτες, δικαιολογητικά, Media, backups βάσης) στο NAS μέσω Tailscale — File Station API."
        configured={configured}
        lastCheck={lastCheck}
      />
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <TextField id="syn-url" label="Διεύθυνση NAS" icon={Link2} value={values.baseUrl} onChange={v => set('baseUrl', v)} placeholder="http://100.127.38.86:5000" error={fieldErrors.baseUrl} help="Tailscale IP + θύρα DSM (5000 http / 5001 https)." />
        <TextField id="syn-root" label="Φάκελος backup" icon={FolderTree} value={values.rootPath} onChange={v => set('rootPath', v)} placeholder="/WWA-Backup" error={fieldErrors.rootPath} help="Κοινόχρηστος φάκελος (και υποφάκελος) στο NAS." />
        <TextField id="syn-user" label="Χρήστης DSM" icon={User} value={values.username} onChange={v => set('username', v)} error={fieldErrors.username} help="Προτείνεται ξεχωριστός χρήστης μόνο για backup, χωρίς 2FA." />
        <SecretField id="syn-pass" label="Κωδικός" icon={KeyRound} value={values.password} onChange={v => set('password', v)} maskedHint={maskedHint} error={fieldErrors.password} />
      </div>
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 text-[length:var(--fs-12-5)] font-semibold">
          <Switch checked={values.enabled === '1'} onCheckedChange={v => set('enabled', v ? '1' : '0')} /> Ενεργό νυχτερινό backup
        </label>
        <label className="flex items-center gap-2 text-[length:var(--fs-12-5)] font-semibold">
          <Switch checked={values.allowSelfSigned === '1'} onCheckedChange={v => set('allowSelfSigned', v ? '1' : '0')} /> Αποδοχή self-signed πιστοποιητικού (https)
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
        <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>{testing ? 'Έλεγχος…' : 'Δοκιμή σύνδεσης'}</Button>
      </div>
    </div>
  )
}
