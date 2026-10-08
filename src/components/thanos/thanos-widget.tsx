'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Check, Loader2, Mic, Send, Square, Trash2, Volume2, VolumeX, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { thanosChat, thanosStatus, thanosTranscribe, executeThanosAction, cancelThanosAction } from '@/lib/thanos/actions'
import type { ThanosActionCard } from '@/lib/thanos/agent'
import type { PageContext } from '@/lib/thanos/context'

/**
 * Πλωτό κουμπί + panel του Thanos (app & portal). Page-aware από το URL.
 * Μικρόφωνο → WAV (16 kHz mono) → OpenRouter STT· ηχείο → ElevenLabs (/api/thanos/tts).
 * Οι ενέργειες εμφανίζονται ως κάρτες με προεπισκόπηση και «Αποστολή» — τίποτα δεν στέλνεται αυτόματα.
 */

type Msg = { role: 'user' | 'assistant'; content: string; actions?: ThanosActionCard[]; error?: boolean }
type Status = Awaited<ReturnType<typeof thanosStatus>>

const STORE = 'thanos:chat'
const VOICE = 'thanos:voice'
const VOICE_LIMIT = 'thanos:voice-limit'
const WELCOMED = 'thanos:welcomed'
/** 0 δείγματα — αρκεί για να «ξεκλειδώσει» ο ήχος μέσα σε κλικ του χρήστη. */
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA='

function pageFromPath(path: string): PageContext {
  const app = path.match(/^\/programs\/([^/]+)\/applications\/([^/]+)/)
  if (app) return { path, programId: app[1], applicationId: app[2] }
  const prog = path.match(/^\/programs\/([^/]+)/)
  if (prog && prog[1] !== 'new') return { path, programId: prog[1] }
  const trdr = path.match(/^\/partners\/([^/]+)/)
  if (trdr && trdr[1] !== 'new') return { path, trdrId: trdr[1] }
  return { path }
}

const read = <T,>(storage: 'local' | 'session', key: string, fallback: T): T => {
  try { const v = (storage === 'local' ? localStorage : sessionStorage).getItem(key); return v ? JSON.parse(v) as T : fallback } catch { return fallback }
}
const write = (storage: 'local' | 'session', key: string, value: unknown) => {
  try { (storage === 'local' ? localStorage : sessionStorage).setItem(key, JSON.stringify(value)) } catch { /* private mode */ }
}

/** Blob ηχογράφησης → WAV 16 kHz mono (base64) — δουλεύει με webm/mp4 όλων των browsers. */
async function toWavBase64(blob: Blob): Promise<string> {
  const ctx = new AudioContext()
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    const rate = 16_000
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate)
    const src = offline.createBufferSource()
    src.buffer = decoded
    src.connect(offline.destination)
    src.start()
    const pcm = (await offline.startRendering()).getChannelData(0)
    const buf = new ArrayBuffer(44 + pcm.length * 2)
    const v = new DataView(buf)
    const s = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)) }
    s(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); s(8, 'WAVE'); s(12, 'fmt ')
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true)
    v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, pcm.length * 2, true)
    for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true)
    const bytes = new Uint8Array(buf)
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(bin)
  } finally {
    void ctx.close()
  }
}

function Avatar({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/thanos/avatar.webp" alt="" aria-hidden width={96} height={96} className={cn('rounded-full bg-muted object-cover', className)} />
}

/** Κείμενο απάντησης με **έντονα** και εσωτερικούς συνδέσμους [κείμενο](/διαδρομή) — μόνο σχετικές διαδρομές της εφαρμογής. */
function RichText({ text }: { text: string }) {
  const parts = text.replace(/^#{1,4}\s+/gm, '').split(/(\[[^\]]+\]\(\/[^)\s]*\)|\*\*[^*]+\*\*)/g)
  return <>{parts.map((part, i) => {
    const link = part.match(/^\[([^\]]+)\]\((\/[^)\s]*)\)$/)
    if (link) return <Link key={i} href={link[2]} className="font-semibold text-primary underline underline-offset-2">{link[1]}</Link>
    const bold = part.match(/^\*\*([^*]+)\*\*$/)
    if (bold) return <strong key={i} className="font-bold">{bold[1]}</strong>
    return <span key={i}>{part}</span>
  })}</>
}

/** Παίζει url στο (μόνιμο) audio στοιχείο· false αν ο browser το μπλόκαρε. */
async function playUrl(a: HTMLAudioElement, url: string, onEnd?: () => void, rate = 1): Promise<boolean> {
  a.pause()
  a.src = url
  a.preservesPitch = true
  a.playbackRate = rate
  a.onended = () => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); onEnd?.() }
  try { await a.play(); return true } catch { return false }
}

const plain = (t: string) => t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,4}\s+/gm, '')

export function ThanosWidget({ firstName }: { firstName?: string }) {
  const pathname = usePathname() ?? '/'
  const page = useMemo(() => pageFromPath(pathname), [pathname])
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [voice, setVoice] = useState(false)
  const [voiceLimited, setVoiceLimited] = useState(false)
  const recRef = useRef<MediaRecorder | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const speakSeq = useRef(0)
  const [speaking, setSpeaking] = useState<string | null>(null)
  const [audioBlocked, setAudioBlocked] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const hydrated = useRef(false)

  useEffect(() => { if (hydrated.current) write('session', STORE, msgs.slice(-40)) }, [msgs])
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [msgs, busy])
  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  // Η συζήτηση (ανά tab) και η προτίμηση φωνής φορτώνονται με το πρώτο άνοιγμα.
  function openPanel() {
    if (!hydrated.current) {
      hydrated.current = true
      setMsgs(read('session', STORE, []))
      const limitedToday = read<string | null>('local', VOICE_LIMIT, null) === new Date().toDateString()
      setVoiceLimited(limitedToday)
      setVoice(!limitedToday && read('local', VOICE, true))
    }
    unlockAudio()
    setOpen(true)
  }

  /**
   * Ένα ΜΟΝΙΜΟ <audio>, «ξεκλειδωμένο» σε κλικ του χρήστη (Safari/Chrome μπλοκάρουν play() που γίνεται
   * μετά από αναμονή δικτύου). Μετά, κάθε απάντηση παίζει στο ίδιο στοιχείο χωρίς να μπλοκάρεται.
   */
  function unlockAudio() {
    if (audioRef.current) return
    audioRef.current = new Audio()
    void playUrl(audioRef.current, SILENT_WAV)
  }

  const speak = useCallback(async (text: string, force = false, ttsReady?: boolean) => {
    if ((!voice && !force) || !(ttsReady ?? status?.tts)) return
    const id = ++speakSeq.current
    setSpeaking(text)
    try {
      const res = await fetch('/api/thanos/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: plain(text) }) })
      if (res.status === 429) {
        // Ημερήσιο όριο φωνής (πελάτες): κλείνει η φωνή μέχρι αύριο, οι απαντήσεις συνεχίζουν σε κείμενο.
        setVoice(false)
        write('local', VOICE, false)
        write('local', VOICE_LIMIT, new Date().toDateString())
        setVoiceLimited(true)
        setSpeaking(null)
        setMsgs(m => [...m, { role: 'assistant', content: 'Ολοκληρώθηκαν τα 2 λεπτά φωνητικής συνομιλίας για σήμερα — από εδώ και πέρα θα σας απαντώ γραπτώς. Η φωνή θα είναι ξανά διαθέσιμη αύριο.' }])
        return
      }
      if (!res.ok || id !== speakSeq.current) { if (id === speakSeq.current) setSpeaking(null); return }
      const url = URL.createObjectURL(await res.blob())
      if (!audioRef.current) audioRef.current = new Audio()
      const played = await playUrl(audioRef.current, url, () => setSpeaking(s => (s === text ? null : s)), status?.speed ?? 1.15)
      if (!played) { setSpeaking(null); setAudioBlocked(true) }
    } catch {
      setSpeaking(null)
    }
  }, [voice, status?.tts, status?.speed])

  /** Πελάτες: καλωσόρισμα μία φορά ανά συνεδρία (κείμενο + φωνή, αν είναι διαθέσιμη). */
  function onStatus(s: Status) {
    setStatus(s)
    if (s.mode !== 'CUSTOMER' || !s.welcome || !s.chat) return
    if (read('session', WELCOMED, false) || read<Msg[]>('session', STORE, []).length) return
    write('session', WELCOMED, true)
    setMsgs([{ role: 'assistant', content: s.welcome }])
    const limitedToday = read<string | null>('local', VOICE_LIMIT, null) === new Date().toDateString()
    if (!limitedToday && read('local', VOICE, true)) void speak(s.welcome, true, s.tts)
  }

  useEffect(() => { if (open && !status) void thanosStatus().then(onStatus) }, [open, status]) // eslint-disable-line react-hooks/exhaustive-deps

  function stopSpeaking() {
    speakSeq.current++
    audioRef.current?.pause()
    setSpeaking(null)
  }

  const send = useCallback(async (text: string) => {
    const message = text.trim()
    if (!message || busy) return
    const history = msgs.filter(m => !m.error).map(m => ({ role: m.role, content: m.content }))
    setMsgs(m => [...m, { role: 'user', content: message }])
    setInput('')
    setBusy(true)
    const res = await thanosChat({ history, message, page }).catch(e => ({ ok: false as const, error: String(e) }))
    setBusy(false)
    if (!res.ok) { setMsgs(m => [...m, { role: 'assistant', content: res.error, error: true }]); return }
    setMsgs(m => [...m, { role: 'assistant', content: res.data.reply, actions: res.data.actions }])
    void speak(res.data.reply)
  }, [busy, msgs, page, speak])

  async function toggleMic() {
    if (recording) { recRef.current?.stop(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      const chunks: Blob[] = []
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setRecording(false)
        if (!chunks.length) return
        setTranscribing(true)
        try {
          const wav = await toWavBase64(new Blob(chunks, { type: rec.mimeType }))
          const r = await thanosTranscribe(wav, 'wav')
          if (r.ok) await send(r.data)
          else setMsgs(m => [...m, { role: 'assistant', content: r.error, error: true }])
        } catch {
          setMsgs(m => [...m, { role: 'assistant', content: 'Δεν μπόρεσα να διαβάσω την ηχογράφηση.', error: true }])
        } finally {
          setTranscribing(false)
        }
      }
      recRef.current = rec
      rec.start()
      setRecording(true)
    } catch {
      setMsgs(m => [...m, { role: 'assistant', content: 'Δεν δόθηκε πρόσβαση στο μικρόφωνο.', error: true }])
    }
  }

  function toggleVoice() {
    unlockAudio()
    setAudioBlocked(false)
    const next = !voice
    setVoice(next)
    write('local', VOICE, next)
    if (!next) stopSpeaking()
  }

  const updateCard = (id: string, patch: CardPatch) =>
    setMsgs(ms => ms.map(m => m.actions ? { ...m, actions: m.actions.map(a => a.id === id ? { ...a, ...patch } as ThanosActionCard : a) } : m))

  const ready = status?.chat
  const suggestions = status?.mode === 'CUSTOMER'
    ? ['Τι δικαιολογητικά λείπουν στα έργα μου;', 'Είναι επιλέξιμη η αγορά laptop;', 'Στείλε στον λογιστή μου link για τα έγγραφα που λείπουν']
    : page.applicationId
      ? ['Τι λείπει σε αυτό το έργο;', 'Ζήτα από τον πελάτη τα δικαιολογητικά που λείπουν']
      : page.programId
        ? ['Ποιοι πελάτες έχουν ελλείψεις σε αυτό το πρόγραμμα;', 'Ποιες δαπάνες είναι επιλέξιμες;']
        : page.trdrId
          ? ['Δώσε μου την εικόνα αυτού του πελάτη', 'Σε ποια ενεργά προγράμματα ταιριάζει;']
          : ['Ποια προγράμματα είναι ανοιχτά;', 'Είναι επιλέξιμο ένα φωτοβολταϊκό στο STEP;']

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={openPanel}
          aria-label="Άνοιγμα Thanos"
          className="fixed bottom-5 right-5 z-50 flex h-14 items-center gap-2 rounded-full bg-primary pl-1.5 pr-5 text-primary-foreground shadow-lg transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary print:hidden"
        >
          <Avatar className="size-11 ring-2 ring-primary-foreground/80" />
          <span className="text-[length:var(--fs-14)] font-semibold">Thanos</span>
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label="Thanos — ψηφιακός σύμβουλος"
          className="fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col overflow-hidden rounded-t-2xl border border-border bg-card text-card-foreground shadow-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[min(640px,calc(100dvh-40px))] sm:w-[400px] sm:rounded-2xl print:hidden"
        >
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Avatar className="size-10" />
            <div className="min-w-0 flex-1">
              <div className="text-[length:var(--fs-14)] font-semibold leading-tight">Thanos</div>
              <div className="truncate text-[length:var(--fs-11-5)] text-muted-foreground">
                {status?.mode === 'CUSTOMER' ? 'Ο σύμβουλός σας για προγράμματα & δαπάνες' : 'Οδηγοί, ελλείψεις πελατών, αιτήματα'}
              </div>
            </div>
            {status?.tts && !voiceLimited && (
              <button type="button" onClick={toggleVoice} aria-pressed={voice} aria-label={voice ? 'Απενεργοποίηση φωνής' : 'Ενεργοποίηση φωνής'} title={voice ? 'Φωνή: ανοιχτή' : 'Φωνή: κλειστή'}
                className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                {voice ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              </button>
            )}
            {msgs.length > 0 && (
              <button type="button" onClick={() => setMsgs([])} aria-label="Νέα συζήτηση" title="Νέα συζήτηση"
                className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <Trash2 className="size-4" />
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Κλείσιμο"
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="size-4" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {status && !ready && (
              <p className="rounded-xl bg-muted px-3 py-2.5 text-[length:var(--fs-13)] text-muted-foreground">
                {status.mode === 'STAFF'
                  ? 'Ο Thanos δεν έχει ρυθμιστεί ακόμα: πρόσθεσε το API key του OpenRouter στις Ρυθμίσεις → Διασυνδέσεις.'
                  : 'Ο ψηφιακός σύμβουλος δεν είναι διαθέσιμος αυτή τη στιγμή.'}
              </p>
            )}
            {msgs.length === 0 && ready && (
              <div className="space-y-3">
                <p className="text-[length:var(--fs-15)] font-medium">
                  Γεια σας{firstName ? ` ${firstName}` : ''}! Είμαι ο Thanos. {status?.mode === 'CUSTOMER'
                    ? 'Ρωτήστε με για τα προγράμματά σας, για δαπάνες που σκέφτεστε ή ζητήστε μου να στείλω στον λογιστή σας σύνδεσμο για δικαιολογητικά.'
                    : 'Ρώτα με για οδηγούς προγραμμάτων, επιλεξιμότητα δαπανών, ελλείψεις πελατών ή ζήτα μου να ετοιμάσω αιτήματα δικαιολογητικών.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map(s => (
                    <button key={s} type="button" onClick={() => { unlockAudio(); void send(s) }}
                      className="rounded-full border border-border px-3 py-1.5 text-left text-[length:var(--fs-13-5)] font-medium hover:border-primary hover:text-primary">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={cn('flex flex-col gap-2', m.role === 'user' ? 'items-end' : 'items-start')}>
                <div className={cn('flex max-w-full items-end gap-2', m.role === 'user' && 'justify-end')}>
                {m.role === 'assistant' && <Avatar className="size-7 shrink-0" />}
                <div className={cn(
                  'max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[length:var(--fs-15)] font-medium leading-relaxed',
                  m.role === 'user' ? 'rounded-br-md bg-primary text-primary-foreground' : m.error ? 'rounded-bl-md bg-destructive/10 text-destructive' : 'rounded-bl-md bg-muted',
                )}>
                  <RichText text={m.content} />
                </div>
                {m.role === 'assistant' && !m.error && status?.tts && !voiceLimited && (
                  <button type="button"
                    onClick={() => { unlockAudio(); setAudioBlocked(false); if (speaking === m.content) stopSpeaking(); else void speak(m.content, true) }}
                    aria-label={speaking === m.content ? 'Διακοπή ακρόασης' : 'Ακρόαση απάντησης'} title={speaking === m.content ? 'Διακοπή' : 'Ακρόαση'}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                    {speaking === m.content ? <Square className="size-3.5" /> : <Volume2 className="size-4" />}
                  </button>
                )}
                </div>
                {m.actions?.map(a => <ActionCard key={a.id} card={a} onChange={patch => updateCard(a.id, patch)} />)}
              </div>
            ))}
            {audioBlocked && (
              <p className="text-[length:var(--fs-12)] text-muted-foreground">Ο browser μπλόκαρε την αυτόματη αναπαραγωγή — πατήστε το ηχείο δίπλα στην απάντηση.</p>
            )}
            {(busy || transcribing) && (
              <div className="flex items-center gap-2 text-[length:var(--fs-12-5)] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />{transcribing ? 'Ακούω…' : 'Σκέφτομαι…'}
              </div>
            )}
          </div>

          <form
            className="flex items-end gap-2 border-t border-border p-3"
            onSubmit={e => { e.preventDefault(); unlockAudio(); void send(input) }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              disabled={!ready}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); unlockAudio(); void send(input) } }}
              placeholder={recording ? 'Ηχογράφηση… πατήστε ■ για τέλος' : 'Γράψτε μια ερώτηση…'}
              aria-label="Μήνυμα προς Thanos"
              className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-[length:var(--fs-15)] outline-none focus:border-primary"
            />
            <button type="button" onClick={() => { unlockAudio(); void toggleMic() }} disabled={!ready || busy || transcribing}
              aria-label={recording ? 'Τέλος ηχογράφησης' : 'Φωνητική ερώτηση'}
              className={cn('flex size-11 shrink-0 items-center justify-center rounded-full border border-border disabled:opacity-40',
                recording ? 'animate-pulse border-destructive bg-destructive text-white' : 'hover:bg-muted')}>
              {recording ? <Square className="size-4" /> : <Mic className="size-4" />}
            </button>
            <button type="submit" disabled={!ready || busy || !input.trim()} aria-label="Αποστολή μηνύματος"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
              <Send className="size-4" />
            </button>
          </form>
        </section>
      )}
    </>
  )
}

type CardPatch = { status: string }
type EmailCard = Extract<ThanosActionCard, { kind: 'DOC_REQUEST' | 'ACCOUNTANT_LINK' }>
type OpCard = Extract<ThanosActionCard, { kind: 'OPERATION' }>

function ActionCard({ card, onChange }: { card: ThanosActionCard; onChange: (patch: CardPatch) => void }) {
  return card.kind === 'OPERATION' ? <OperationCard card={card} onChange={onChange} /> : <EmailActionCard card={card} onChange={onChange} />
}

/** Ενέργεια για λογαριασμό του χρήστη: περίληψη + «Εκτέλεση» (καλεί το κανονικό action της εφαρμογής). */
function OperationCard({ card, onChange }: { card: OpCard; onChange: (patch: CardPatch) => void }) {
  const p = card.payload
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const done = card.status !== 'PENDING'
  async function run(execute: boolean) {
    setPending(true); setError(null)
    const r = execute ? await executeThanosAction(card.id) : await cancelThanosAction(card.id)
    setPending(false)
    if (!r.ok) { setError(r.error); return }
    if (execute) setResult((r.data as { message?: string } | null)?.message ?? 'Έγινε.')
    onChange({ status: execute ? 'SENT' : 'CANCELLED' })
  }
  return (
    <div className="w-full rounded-xl border border-border bg-background p-3 text-[length:var(--fs-13-5)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold">{p.title}</span>
        <span className={cn('rounded-full px-2 py-0.5 text-[length:var(--fs-11)]',
          card.status === 'SENT' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
            : card.status === 'PENDING' ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300' : 'bg-muted text-muted-foreground')}>
          {card.status === 'SENT' ? 'Έγινε' : card.status === 'PENDING' ? 'Χρειάζεται επιβεβαίωση' : card.status === 'CANCELLED' ? 'Ακυρώθηκε' : 'Σφάλμα'}
        </span>
      </div>
      <ul className="mb-2 space-y-1">{p.details.map((d, i) => <li key={i} className={i === 0 ? 'text-muted-foreground' : ''}>{d}</li>)}</ul>
      {error && <p className="mb-2 text-destructive" role="alert">{error}</p>}
      {!done && (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => void run(false)} disabled={pending} className="h-9 rounded-full px-3 hover:bg-muted disabled:opacity-50">Ακύρωση</button>
          <button type="button" onClick={() => void run(true)} disabled={pending}
            className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-3.5" />}Εκτέλεση
          </button>
        </div>
      )}
      {card.status === 'SENT' && <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300"><Check className="size-4" />{result ?? 'Έγινε.'}</p>}
    </div>
  )
}

function EmailActionCard({ card, onChange }: { card: EmailCard; onChange: (patch: CardPatch) => void }) {
  const p = card.payload
  const [to, setTo] = useState(p.to)
  const [message, setMessage] = useState(p.message)
  const [items, setItems] = useState<Record<string, boolean>>(() => Object.fromEntries(p.items.map(i => [i, true])))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const done = card.status !== 'PENDING'

  async function submit() {
    setPending(true); setError(null)
    const r = await executeThanosAction(card.id, { to, message, items: p.items.filter(i => items[i]) })
    setPending(false)
    if (r.ok) onChange({ status: 'SENT' })
    else setError(r.error)
  }
  async function cancel() {
    setPending(true)
    const r = await cancelThanosAction(card.id)
    setPending(false)
    if (r.ok) onChange({ status: 'CANCELLED' })
    else setError(r.error)
  }

  return (
    <div className="w-full rounded-xl border border-border bg-background p-3 text-[length:var(--fs-13-5)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold">{card.kind === 'ACCOUNTANT_LINK' ? 'Σύνδεσμος προς λογιστή' : 'Αίτημα δικαιολογητικών'}</span>
        <span className={cn('rounded-full px-2 py-0.5 text-[length:var(--fs-11)]',
          card.status === 'SENT' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
            : card.status === 'PENDING' ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300' : 'bg-muted text-muted-foreground')}>
          {card.status === 'SENT' ? 'Στάλθηκε' : card.status === 'PENDING' ? 'Προεπισκόπηση — δεν στάλθηκε' : card.status === 'CANCELLED' ? 'Ακυρώθηκε' : 'Σφάλμα'}
        </span>
      </div>
      <div className="mb-2 text-muted-foreground">{p.trdrName}{p.programTitle ? ` · ${p.programTitle}` : ''}</div>
      <label className="mb-2 block">
        <span className="mb-1 block text-muted-foreground">Προς</span>
        <input type="email" value={to} disabled={done} onChange={e => setTo(e.target.value)}
          className="h-9 w-full rounded-lg border border-input bg-card px-2.5 outline-none focus:border-primary disabled:opacity-70" />
      </label>
      <div className="mb-1 text-muted-foreground">Θέμα: <span className="text-foreground">{p.subject}</span></div>
      <fieldset className="mb-2">
        <legend className="mb-1 text-muted-foreground">Έγγραφα</legend>
        <ul className="space-y-1">
          {p.items.map(i => (
            <li key={i}>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={!!items[i]} disabled={done} onChange={e => setItems(s => ({ ...s, [i]: e.target.checked }))} className="mt-0.5 size-4 accent-[var(--primary)]" />
                <span>{i}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <label className="mb-2 block">
        <span className="mb-1 block text-muted-foreground">Μήνυμα</span>
        <textarea rows={3} value={message} disabled={done} onChange={e => setMessage(e.target.value)}
          className="w-full resize-y rounded-lg border border-input bg-card px-2.5 py-2 outline-none focus:border-primary disabled:opacity-70" />
      </label>
      <p className="mb-2 text-muted-foreground">Θα σταλεί email με ασφαλή σύνδεσμο ανεβάσματος (ισχύει {p.expiresInDays} ημέρες).</p>
      {error && <p className="mb-2 text-destructive" role="alert">{error}</p>}
      {!done && (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => void cancel()} disabled={pending} className="h-9 rounded-full px-3 hover:bg-muted disabled:opacity-50">Ακύρωση</button>
          <button type="button" onClick={() => void submit()} disabled={pending || !Object.values(items).some(Boolean)}
            className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-3.5" />}Αποστολή
          </button>
        </div>
      )}
      {card.status === 'SENT' && <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300"><Check className="size-4" />Το email στάλθηκε — θα ενημερωθείτε όταν ανέβουν τα αρχεία.</p>}
    </div>
  )
}
