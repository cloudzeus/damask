'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Bot, KeyRound, Cpu, Mic, AudioLines, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardHeader, TextField, SecretField, maskSecretPreview } from '../fields'
import {
  saveOpenRouterSettings, testOpenRouterSettings, saveElevenLabsSettings, testElevenLabsSettings,
  type OpenRouterValues, type ElevenLabsValues,
} from '../actions'
import type { CheckResult } from '@/lib/settings'

type CardProps<V> = { initial: Omit<V, 'apiKey'>; maskedApiKey: string | null; configured: boolean; lastCheck: CheckResult | null }

/** Κοινό σκελετό: state, αποθήκευση, δοκιμή. */
function useIntegrationCard<V extends { apiKey: string }>(p: CardProps<V>, save: (v: V) => Promise<{ ok: boolean; message: string; fieldErrors?: Record<string, string> }>, test: (v: V) => Promise<CheckResult>) {
  const [values, setValues] = useState<V>({ ...(p.initial as V), apiKey: '' })
  const [masked, setMasked] = useState(p.maskedApiKey)
  const [configured, setConfigured] = useState(p.configured)
  const [lastCheck, setLastCheck] = useState(p.lastCheck)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()
  const set = <K extends keyof V>(k: K, v: V[K]) => setValues(prev => ({ ...prev, [k]: v }))
  const onSave = () => startSave(async () => {
    const r = await save(values)
    if (!r.ok) { toast.error(r.message); setErrors(r.fieldErrors ?? {}); return }
    toast.success(r.message); setErrors({})
    if (values.apiKey.trim()) { setMasked(maskSecretPreview(values.apiKey)); set('apiKey', '' as V['apiKey']) }
    setConfigured(Boolean(values.apiKey.trim() || masked))
  })
  const onTest = () => startTest(async () => {
    const r = await test(values); setLastCheck(r)
    if (r.ok) toast.success(r.message); else toast.warning(r.message)
  })
  return { values, set, masked, configured, lastCheck, errors, saving, testing, onSave, onTest }
}

export function OpenRouterCard(p: CardProps<OpenRouterValues>) {
  const c = useIntegrationCard(p, saveOpenRouterSettings, testOpenRouterSettings)
  return (
    <div className="glass p-4">
      <CardHeader icon={Bot} title="OpenRouter — Thanos" description="Το «μυαλό» του Thanos (συνομιλία & ενέργειες) και η αναγνώριση φωνής (speech-to-text)." configured={c.configured} lastCheck={c.lastCheck} />
      <SecretField id="or-key" label="API key" icon={KeyRound} value={c.values.apiKey} onChange={v => c.set('apiKey', v)} maskedHint={c.masked} error={c.errors.apiKey} />
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <TextField id="or-chat" label="Μοντέλο συνομιλίας" icon={Cpu} value={c.values.chatModel} onChange={v => c.set('chatModel', v)} placeholder="openrouter/auto" help="Κενό ή «openrouter/auto» = το OpenRouter διαλέγει το καλύτερο μοντέλο." error={c.errors.chatModel} />
        <TextField id="or-stt" label="Μοντέλο φωνής → κειμένου" icon={Mic} value={c.values.sttModel} onChange={v => c.set('sttModel', v)} placeholder="google/gemini-2.5-flash" help="Μοντέλο με είσοδο ήχου (π.χ. google/gemini-2.5-flash)." error={c.errors.sttModel} />
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" onClick={c.onSave} disabled={c.saving}>{c.saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
        <Button type="button" variant="outline" onClick={c.onTest} disabled={c.testing}>{c.testing ? 'Έλεγχος…' : 'Δοκιμή σύνδεσης'}</Button>
      </div>
    </div>
  )
}

export function ElevenLabsCard(p: CardProps<ElevenLabsValues>) {
  const c = useIntegrationCard(p, saveElevenLabsSettings, testElevenLabsSettings)
  return (
    <div className="glass p-4">
      <CardHeader icon={AudioLines} title="ElevenLabs — φωνή Thanos" description="Ο Thanos διαβάζει φωναχτά τις απαντήσεις του (text-to-speech)." configured={c.configured} lastCheck={c.lastCheck} />
      <SecretField id="el-key" label="API key" icon={KeyRound} value={c.values.apiKey} onChange={v => c.set('apiKey', v)} maskedHint={c.masked} error={c.errors.apiKey} />
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <TextField id="el-voice" label="Voice ID" icon={UserRound} value={c.values.voiceId} onChange={v => c.set('voiceId', v)} placeholder="π.χ. 21m00Tcm4TlvDq8ikWAM" help="Από το ElevenLabs → Voices → ID της φωνής." error={c.errors.voiceId} />
        <TextField id="el-model" label="Μοντέλο" icon={Cpu} value={c.values.model} onChange={v => c.set('model', v)} placeholder="eleven_multilingual_v2" help="Πολυγλωσσικό μοντέλο για ελληνικά." error={c.errors.model} />
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" onClick={c.onSave} disabled={c.saving}>{c.saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
        <Button type="button" variant="outline" onClick={c.onTest} disabled={c.testing}>{c.testing ? 'Έλεγχος…' : 'Δοκιμή σύνδεσης'}</Button>
      </div>
    </div>
  )
}
