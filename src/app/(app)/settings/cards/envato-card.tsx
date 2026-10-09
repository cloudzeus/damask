'use client'

import { KeyRound, Images } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardHeader, SecretField } from '../fields'
import { saveEnvatoSettings, testEnvatoSettings, type EnvatoValues } from '../actions'
import { useIntegrationCard, type CardProps } from './thanos-cards'

/** Envato Elements: personal token (build.envato.com) — αποθήκευση + δοκιμή σύνδεσης. */
export function EnvatoCard(p: CardProps<EnvatoValues>) {
  const c = useIntegrationCard(p, saveEnvatoSettings, testEnvatoSettings)
  return (
    <div className="glass p-4">
      <CardHeader icon={Images} title="Envato Elements" description="Πρόσβαση στη βιβλιοθήκη Envato (φωτογραφίες, γραφικά, πρότυπα). Personal token από build.envato.com." configured={c.configured} lastCheck={c.lastCheck} />
      <SecretField id="envato-key" label="API key (personal token)" icon={KeyRound} value={c.values.apiKey} onChange={v => c.set('apiKey', v)} maskedHint={c.masked} error={c.errors.apiKey} />
      <div className="flex items-center gap-2">
        <Button type="button" onClick={c.onSave} disabled={c.saving}>{c.saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
        <Button type="button" variant="outline" onClick={c.onTest} disabled={c.testing}>{c.testing ? 'Έλεγχος…' : 'Δοκιμή σύνδεσης'}</Button>
      </div>
    </div>
  )
}
