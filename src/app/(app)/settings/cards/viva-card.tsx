'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { LuFlaskConical, LuRocket, LuLandmark, LuTriangleAlert } from 'react-icons/lu'
// CardHeader/TextField/SecretField (../fields) απαιτούν συγκεκριμένα `LucideIcon` (ForwardRefExoticComponent) —
// το IconType του react-icons δεν ταιριάζει δομικά. Τα εικονίδια που περνάνε ως `icon=` prop μένουν lucide-react
// (ίδιο με ΚΑΘΕ άλλη κάρτα εδώ)· τα υπόλοιπα (badges/alert) είναι react-icons/lu σύμφωνα με την πολιτική νέου κώδικα.
import { CreditCard, Fingerprint, KeyRound, Hash, ShieldCheck, Store } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { CardHeader, TextField, SecretField, maskSecretPreview } from '../fields'
import { saveVivaSettings, testVivaSettings, type VivaEnvValues, type VivaSettingsValues } from '../actions'
import type { VivaEnvironment } from '@/lib/viva'
import type { CheckResult } from '@/lib/settings'

export type VivaEnvCardData = {
  values: Omit<VivaEnvValues, 'clientSecret' | 'apiKey'>
  maskedClientSecret: string | null
  maskedApiKey: string | null
  configured: boolean
  lastCheck: CheckResult | null
}

/**
 * Ρυθμίσεις Viva Payments — ΔΙΑΦΟΡΕΤΙΚΟ σχήμα από τις υπόλοιπες κάρτες: ένα
 * environment switch + ΔΥΟ πλήρη σετ credentials (demo/production) αντί για
 * ένα flat σετ πεδίων. Η εναλλαγή είναι «με ένα κλικ» — δεν αγγίζει τα ίδια
 * τα credentials, μόνο ποιο σετ είναι ενεργό (χρησιμοποιείται από /payments +
 * τη «Δοκιμή σύνδεσης» παρακάτω).
 */
export function VivaCard({
  initialEnvironment, bankInstructionsInitial, demo, production,
}: {
  initialEnvironment: VivaEnvironment
  bankInstructionsInitial: string
  demo: VivaEnvCardData
  production: VivaEnvCardData
}) {
  const [environment, setEnvironment] = useState<VivaEnvironment>(initialEnvironment)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [bankInstructions, setBankInstructions] = useState(bankInstructionsInitial)

  const [demoValues, setDemoValues] = useState<VivaEnvValues>({ ...demo.values, clientSecret: '', apiKey: '' })
  const [prodValues, setProdValues] = useState<VivaEnvValues>({ ...production.values, clientSecret: '', apiKey: '' })
  const [demoMaskedSecret, setDemoMaskedSecret] = useState(demo.maskedClientSecret)
  const [demoMaskedApiKey, setDemoMaskedApiKey] = useState(demo.maskedApiKey)
  const [prodMaskedSecret, setProdMaskedSecret] = useState(production.maskedClientSecret)
  const [prodMaskedApiKey, setProdMaskedApiKey] = useState(production.maskedApiKey)
  const [demoConfigured, setDemoConfigured] = useState(demo.configured)
  const [prodConfigured, setProdConfigured] = useState(production.configured)
  const [demoLastCheck, setDemoLastCheck] = useState(demo.lastCheck)
  const [prodLastCheck, setProdLastCheck] = useState(production.lastCheck)

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()

  function clearError(key: string) {
    setFieldErrors(errors => {
      if (!(key in errors)) return errors
      const next = { ...errors }
      delete next[key]
      return next
    })
  }
  function setDemoField<K extends keyof VivaEnvValues>(key: K, value: VivaEnvValues[K]) {
    setDemoValues(prev => ({ ...prev, [key]: value }))
    clearError(`demo.${key}`)
  }
  function setProdField<K extends keyof VivaEnvValues>(key: K, value: VivaEnvValues[K]) {
    setProdValues(prev => ({ ...prev, [key]: value }))
    clearError(`production.${key}`)
  }

  function handleToggleEnvironment(checked: boolean) {
    if (checked) setConfirmOpen(true) // demo → production: ζητά επιβεβαίωση πριν αλλάξει πραγματικά
    else setEnvironment('demo')
  }
  function confirmSwitchToProduction() {
    setEnvironment('production')
    setConfirmOpen(false)
  }

  function handleSave() {
    startSave(async () => {
      const payload: VivaSettingsValues = { environment, bankInstructions, demo: demoValues, production: prodValues }
      const res = await saveVivaSettings(payload)
      if (!res.ok) {
        toast.error(res.message)
        setFieldErrors(res.fieldErrors ?? {})
        return
      }
      toast.success(res.message)
      setFieldErrors({})

      const hadDemoSecret = demoValues.clientSecret.trim() !== ''
      const hadDemoApiKey = demoValues.apiKey.trim() !== ''
      const hadProdSecret = prodValues.clientSecret.trim() !== ''
      const hadProdApiKey = prodValues.apiKey.trim() !== ''

      setDemoConfigured(Boolean(demoValues.clientId.trim() && (hadDemoSecret || demoMaskedSecret) && demoValues.sourceCode.trim()))
      setProdConfigured(Boolean(prodValues.clientId.trim() && (hadProdSecret || prodMaskedSecret) && prodValues.sourceCode.trim()))

      if (hadDemoSecret) { setDemoMaskedSecret(maskSecretPreview(demoValues.clientSecret)); setDemoField('clientSecret', '') }
      if (hadDemoApiKey) { setDemoMaskedApiKey(maskSecretPreview(demoValues.apiKey)); setDemoField('apiKey', '') }
      if (hadProdSecret) { setProdMaskedSecret(maskSecretPreview(prodValues.clientSecret)); setProdField('clientSecret', '') }
      if (hadProdApiKey) { setProdMaskedApiKey(maskSecretPreview(prodValues.apiKey)); setProdField('apiKey', '') }
    })
  }

  function handleTest() {
    startTest(async () => {
      const values = environment === 'production' ? prodValues : demoValues
      const result = await testVivaSettings(environment, values)
      if (environment === 'production') setProdLastCheck(result)
      else setDemoLastCheck(result)
      if (result.ok) toast.success(result.message)
      else toast.warning(result.message)
    })
  }

  const activeConfigured = environment === 'production' ? prodConfigured : demoConfigured
  const activeLastCheck = environment === 'production' ? prodLastCheck : demoLastCheck

  return (
    <div className="glass p-4 xl:col-span-2">
      <CardHeader
        icon={CreditCard}
        title="Viva Payments"
        description="Πληρωμές πελατών με κάρτα ή τραπεζική κατάθεση — μοναδικοί κωδικοί πληρωμής + webhook παρακολούθησης πληρωμών."
        configured={activeConfigured}
        lastCheck={activeLastCheck}
      />

      <div
        className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border p-3.5"
        style={{ borderColor: 'var(--border)', background: environment === 'production' ? 'var(--success-soft)' : 'var(--info-soft)' }}
      >
        <Switch
          aria-label="Ενεργό περιβάλλον Viva — Demo ή Παραγωγή"
          checked={environment === 'production'}
          onCheckedChange={handleToggleEnvironment}
          disabled={saving || testing}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold">Ενεργό περιβάλλον</div>
          <p className="text-[11.5px] text-muted-foreground">
            Καθορίζει ποιο σετ στοιχείων χρησιμοποιεί η σελίδα «Πληρωμές» και η «Δοκιμή σύνδεσης» παρακάτω.
          </p>
        </div>
        <span className={cn('badge-pill', environment === 'production' ? 'ok' : 'info')}>
          {environment === 'production' ? <LuRocket className="size-3" aria-hidden /> : <LuFlaskConical className="size-3" aria-hidden />}
          {environment === 'production' ? 'Παραγωγή' : 'Demo'}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border p-3.5" style={{ borderColor: 'var(--border)' }}>
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span className="badge-pill info"><LuFlaskConical className="size-3" aria-hidden /> Demo</span>
            <span className="text-[11px] text-muted-foreground">demo-accounts / demo-api.vivapayments.com</span>
          </div>
          <TextField id="viva-demo-clientId" label="Client ID" icon={Fingerprint} value={demoValues.clientId} onChange={v => setDemoField('clientId', v)} error={fieldErrors['demo.clientId']} />
          <SecretField id="viva-demo-clientSecret" label="Client Secret" icon={KeyRound} value={demoValues.clientSecret} onChange={v => setDemoField('clientSecret', v)} maskedHint={demoMaskedSecret} error={fieldErrors['demo.clientSecret']} />
          <TextField id="viva-demo-sourceCode" label="Source Code" icon={Hash} value={demoValues.sourceCode} onChange={v => setDemoField('sourceCode', v)} error={fieldErrors['demo.sourceCode']} />
          <TextField
            id="viva-demo-webhookKey" label="Webhook Verification Key" icon={ShieldCheck}
            value={demoValues.webhookVerificationKey} onChange={v => setDemoField('webhookVerificationKey', v)}
            error={fieldErrors['demo.webhookVerificationKey']} help="Από Viva portal → API Access → Webhooks (verification key)."
          />
          <TextField id="viva-demo-merchantId" label="Merchant ID (προαιρετικό)" icon={Store} value={demoValues.merchantId} onChange={v => setDemoField('merchantId', v)} error={fieldErrors['demo.merchantId']} />
          <SecretField id="viva-demo-apiKey" label="API Key (προαιρετικό)" icon={KeyRound} value={demoValues.apiKey} onChange={v => setDemoField('apiKey', v)} maskedHint={demoMaskedApiKey} error={fieldErrors['demo.apiKey']} />
        </div>

        <div className="rounded-2xl border p-3.5" style={{ borderColor: 'var(--border)' }}>
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span className="badge-pill ok"><LuRocket className="size-3" aria-hidden /> Παραγωγή</span>
            <span className="text-[11px] text-muted-foreground">accounts / api.vivapayments.com</span>
          </div>
          <TextField id="viva-prod-clientId" label="Client ID" icon={Fingerprint} value={prodValues.clientId} onChange={v => setProdField('clientId', v)} error={fieldErrors['production.clientId']} />
          <SecretField id="viva-prod-clientSecret" label="Client Secret" icon={KeyRound} value={prodValues.clientSecret} onChange={v => setProdField('clientSecret', v)} maskedHint={prodMaskedSecret} error={fieldErrors['production.clientSecret']} />
          <TextField id="viva-prod-sourceCode" label="Source Code" icon={Hash} value={prodValues.sourceCode} onChange={v => setProdField('sourceCode', v)} error={fieldErrors['production.sourceCode']} />
          <TextField
            id="viva-prod-webhookKey" label="Webhook Verification Key" icon={ShieldCheck}
            value={prodValues.webhookVerificationKey} onChange={v => setProdField('webhookVerificationKey', v)}
            error={fieldErrors['production.webhookVerificationKey']} help="Από Viva portal → API Access → Webhooks (verification key)."
          />
          <TextField id="viva-prod-merchantId" label="Merchant ID (προαιρετικό)" icon={Store} value={prodValues.merchantId} onChange={v => setProdField('merchantId', v)} error={fieldErrors['production.merchantId']} />
          <SecretField id="viva-prod-apiKey" label="API Key (προαιρετικό)" icon={KeyRound} value={prodValues.apiKey} onChange={v => setProdField('apiKey', v)} maskedHint={prodMaskedApiKey} error={fieldErrors['production.apiKey']} />
        </div>
      </div>

      <div className="field mt-3.5 mb-0">
        <label htmlFor="viva-bank-instructions" className="flex items-center gap-1.5">
          <LuLandmark className="size-3.5" aria-hidden /> Οδηγίες τραπεζικής κατάθεσης
        </label>
        <textarea
          id="viva-bank-instructions"
          className="cms-textarea"
          rows={2}
          value={bankInstructions}
          onChange={e => setBankInstructions(e.target.value)}
          placeholder="π.χ. Κατάθεση στον λογαριασμό GR16 0110 1250 0000 0125 4900 257 — αναγράψτε τον κωδικό πληρωμής ως αιτιολογία."
        />
        {fieldErrors.bankInstructions && <div className="error">{fieldErrors.bankInstructions}</div>}
        <div className="help">Εμφανίζεται στον χρήστη μετά τη δημιουργία πληρωμής, στη σελίδα «Πληρωμές».</div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
        <Button type="button" variant="outline" onClick={handleTest} disabled={testing}>
          {testing ? 'Έλεγχος…' : `Δοκιμή σύνδεσης (${environment === 'production' ? 'Παραγωγή' : 'Demo'})`}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <LuTriangleAlert className="size-4" style={{ color: 'var(--warning)' }} aria-hidden /> Εναλλαγή σε Παραγωγή;
            </AlertDialogTitle>
            <AlertDialogDescription>
              Από εδώ και πέρα η σελίδα «Πληρωμές» θα δημιουργεί ΠΡΑΓΜΑΤΙΚΕΣ χρεώσεις μέσω Viva, όχι δοκιμαστικές.
              Βεβαιώσου ότι τα στοιχεία Παραγωγής είναι σωστά πριν πατήσεις «Αποθήκευση».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSwitchToProduction}>Ναι, μετάβαση σε Παραγωγή</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
