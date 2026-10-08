'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Bot, KeyRound, Cpu, Mic, AudioLines, UserRound, Play, Square, Loader2, Check, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardHeader, TextField, SecretField, SelectField, maskSecretPreview } from '../fields'
import {
  saveOpenRouterSettings, testOpenRouterSettings, saveElevenLabsSettings, testElevenLabsSettings,
  listGreekVoicesAction, sampleVoiceAction,
  type OpenRouterValues, type ElevenLabsValues,
} from '../actions'
import type { CheckResult } from '@/lib/settings'
import type { GreekVoice } from '@/lib/voice/elevenlabs'
import { cn } from '@/lib/utils'

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
        <TextField id="or-chat" label="Μοντέλο συνομιλίας" icon={Cpu} value={c.values.chatModel} onChange={v => c.set('chatModel', v)} placeholder="(κενό = DeepSeek απευθείας)" help="Κενό = DeepSeek V4 Pro απευθείας με το κλειδί DeepSeek (αλλιώς μέσω OpenRouter). Ή όρισε μοντέλο OpenRouter, π.χ. «openrouter/auto»." error={c.errors.chatModel} />
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
        <TextField id="el-voice" label="Voice ID" icon={UserRound} value={c.values.voiceId} onChange={v => c.set('voiceId', v)} placeholder="Διάλεξε από τη λίστα παρακάτω" help="Συμπληρώνεται αυτόματα με «Επιλογή» στη λίστα φωνών." error={c.errors.voiceId} />
        <SelectField id="el-model" label="Μοντέλο φωνής" value={c.values.model || 'eleven_turbo_v2_5'} onChange={v => c.set('model', v)}
          options={MODELS} help="Το Turbo ξεκινά σε ~1″· το v3 είναι πιο εκφραστικό αλλά αργεί πολύ." />
      </div>
      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <SelectField id="el-speed" label="Ταχύτητα ομιλίας" value={c.values.speed || '1.15'} onChange={v => c.set('speed', v)}
          options={SPEEDS} help="Πόσο γρήγορα μιλά ο Thanos (ο τόνος της φωνής δεν αλλάζει)." />
      </div>
      <VoicePicker selected={c.values.voiceId} model={c.values.model || 'eleven_turbo_v2_5'} speed={Number(c.values.speed || '1.15')} onSelect={id => c.set('voiceId', id)} />
      <div className="flex items-center gap-2">
        <Button type="button" onClick={c.onSave} disabled={c.saving}>{c.saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
        <Button type="button" variant="outline" onClick={c.onTest} disabled={c.testing}>{c.testing ? 'Έλεγχος…' : 'Δοκιμή σύνδεσης'}</Button>
      </div>
    </div>
  )
}

const SPEEDS = [
  { value: '1', label: 'Κανονική (1×)' },
  { value: '1.1', label: 'Λίγο πιο γρήγορη (1,1×)' },
  { value: '1.15', label: 'Πιο γρήγορη (1,15×) — προεπιλογή' },
  { value: '1.25', label: 'Γρήγορη (1,25×)' },
  { value: '1.35', label: 'Πολύ γρήγορη (1,35×)' },
]

const MODELS = [
  { value: 'eleven_turbo_v2_5', label: 'Turbo v2.5 — γρήγορη & φυσική (προτείνεται, ~1″)' },
  { value: 'eleven_flash_v2_5', label: 'Flash v2.5 — πολύ γρήγορη' },
  { value: 'eleven_multilingual_v2', label: 'Multilingual v2 — σταθερή (πιο αργή)' },
  { value: 'eleven_v3', label: 'Eleven v3 — πιο εκφραστική (αργή: 9-17″)' },
]

async function playSrc(a: HTMLAudioElement, src: string, onEnd: () => void, rate = 1): Promise<boolean> {
  a.pause()
  a.src = src
  a.preservesPitch = true
  a.playbackRate = rate
  a.onended = onEnd
  try { await a.play(); return true } catch { return false }
}

const label = (v: GreekVoice) => [v.gender === 'female' ? 'γυναικεία' : v.gender === 'male' ? 'ανδρική' : null,
  v.age === 'young' ? 'νεανική' : v.age === 'old' ? 'ώριμη' : v.age ? 'μέση ηλικία' : null, v.accent && v.accent !== 'standard' ? v.accent : null].filter(Boolean).join(' · ')

/** Επιλογέας ελληνικής φωνής: λίστα από ElevenLabs + ακρόαση δείγματος (ίδιο κείμενο για όλες) + «Επιλογή». */
function VoicePicker({ selected, model, speed, onSelect }: { selected: string; model: string; speed: number; onSelect: (id: string) => void }) {
  const [voices, setVoices] = useState<GreekVoice[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'female' | 'male'>('all')
  const [playing, setPlaying] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  async function load() {
    setLoading(true)
    const r = await listGreekVoicesAction()
    setLoading(false)
    if (!r.ok) { toast.error(r.message); return }
    setVoices(r.voices)
  }
  async function play(id: string) {
    if (playing === id) { audioRef.current?.pause(); setPlaying(null); return }
    setBusy(id)
    const r = await sampleVoiceAction(id, model)
    setBusy(null)
    if (!r.ok) { toast.error(r.message); return }
    if (!audioRef.current) audioRef.current = new Audio()
    setPlaying(id)
    if (!(await playSrc(audioRef.current, `data:audio/mpeg;base64,${r.audio}`, () => setPlaying(null), speed))) setPlaying(null)
  }

  if (!voices) {
    return (
      <div className="mb-3 rounded-xl border border-dashed border-border p-3">
        <p className="mb-2 text-[length:var(--fs-13)] text-muted-foreground">Ακούστε και διαλέξτε ελληνική φωνή για τον Thanos (λογαριασμός + βιβλιοθήκη ElevenLabs). Κάθε δείγμα χρεώνεται μία φορά.</p>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}Βρες ελληνικές φωνές
        </Button>
      </div>
    )
  }
  const shown = voices.filter(v => filter === 'all' || v.gender === filter)
  return (
    <div className="mb-3 rounded-xl border border-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-[length:var(--fs-13)] font-semibold">Ελληνικές φωνές ({shown.length})</span>
        <div className="flex-1" />
        {(['all', 'female', 'male'] as const).map(f => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className={cn('rounded-full px-3 py-1 text-[length:var(--fs-12-5)]', filter === f ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
            {f === 'all' ? 'Όλες' : f === 'female' ? 'Γυναικείες' : 'Ανδρικές'}
          </button>
        ))}
      </div>
      <ul className="max-h-96 divide-y divide-border overflow-y-auto">
        {shown.map(v => {
          const isSel = v.id === selected
          return (
            <li key={v.id} className={cn('flex items-center gap-3 px-3 py-2.5', isSel && 'bg-primary/5')}>
              <button type="button" onClick={() => void play(v.id)} aria-label={playing === v.id ? `Διακοπή ${v.name}` : `Ακρόαση ${v.name}`}
                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border hover:bg-muted">
                {busy === v.id ? <Loader2 className="size-4 animate-spin" /> : playing === v.id ? <Square className="size-3.5" /> : <Play className="size-4" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[length:var(--fs-13-5)] font-medium">{v.name}{v.mine && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[length:var(--fs-11)] text-muted-foreground">στον λογαριασμό</span>}</div>
                <div className="truncate text-[length:var(--fs-12)] text-muted-foreground">{[label(v), v.description].filter(Boolean).join(' — ')}</div>
              </div>
              <Button type="button" size="sm" variant={isSel ? 'default' : 'outline'} onClick={() => onSelect(v.id)}>
                {isSel ? <><Check className="size-3.5" />Επιλεγμένη</> : 'Επιλογή'}
              </Button>
            </li>
          )
        })}
      </ul>
      <p className="border-t border-border px-3 py-2 text-[length:var(--fs-12)] text-muted-foreground">Μετά την «Επιλογή» πατήστε «Αποθήκευση».</p>
    </div>
  )
}
