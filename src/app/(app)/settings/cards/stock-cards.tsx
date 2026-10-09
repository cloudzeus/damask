'use client'

import { KeyRound, Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardHeader, SecretField } from '../fields'
import { savePexelsSettings, testPexelsSettings, savePixabaySettings, testPixabaySettings, type StockKeyValues } from '../actions'
import { useIntegrationCard, type CardProps } from './thanos-cards'

/** Κλειδιά δωρεάν stock φωτογραφιών (Pexels / Pixabay) — για τη μαζική εισαγωγή στο Media Gallery. */
function StockCard({ id, title, description, save, test, ...p }: CardProps<StockKeyValues> & {
  id: string; title: string; description: string
  save: typeof savePexelsSettings; test: typeof testPexelsSettings
}) {
  const c = useIntegrationCard(p, save, test)
  return (
    <div className="glass p-4">
      <CardHeader icon={Camera} title={title} description={description} configured={c.configured} lastCheck={c.lastCheck} />
      <SecretField id={id} label="API key" icon={KeyRound} value={c.values.apiKey} onChange={v => c.set('apiKey', v)} maskedHint={c.masked} error={c.errors.apiKey} />
      <div className="flex items-center gap-2">
        <Button type="button" onClick={c.onSave} disabled={c.saving}>{c.saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
        <Button type="button" variant="outline" onClick={c.onTest} disabled={c.testing}>{c.testing ? 'Έλεγχος…' : 'Δοκιμή σύνδεσης'}</Button>
      </div>
    </div>
  )
}

export function PexelsCard(p: CardProps<StockKeyValues>) {
  return <StockCard {...p} id="pexels-key" title="Pexels — δωρεάν φωτογραφίες" description="Δωρεάν άδεια εμπορικής χρήσης. Κλειδί: pexels.com/api (δωρεάν εγγραφή)." save={savePexelsSettings} test={testPexelsSettings} />
}
export function PixabayCard(p: CardProps<StockKeyValues>) {
  return <StockCard {...p} id="pixabay-key" title="Pixabay — δωρεάν φωτογραφίες" description="Δωρεάν άδεια εμπορικής χρήσης. Κλειδί: pixabay.com/api/docs (δωρεάν εγγραφή)." save={savePixabaySettings} test={testPixabaySettings} />
}
