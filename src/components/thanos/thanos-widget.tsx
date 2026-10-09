'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Check, Loader2, Mic, Send, Square, ThumbsDown, ThumbsUp, Trash2, Volume2, VolumeX, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { thanosStatus, thanosTranscribe, executeThanosAction, cancelThanosAction, rateThanosTurn } from '@/lib/thanos/actions'
import type { ThanosActionCard, ThanosEvent, ThanosReply } from '@/lib/thanos/agent'
import type { PageContext } from '@/lib/thanos/context'
import { SentenceFeeder, plain } from '@/lib/voice/stream-sentences'

/**
 * Πλωτό κουμπί + panel του Thanos (app & portal). Page-aware από το URL.
 * Μικρόφωνο → WAV (16 kHz mono) → OpenRouter STT· ηχείο → ElevenLabs (/api/thanos/tts).
 * Οι ενέργειες εμφανίζονται ως κάρτες με προεπισκόπηση και «Αποστολή» — τίποτα δεν στέλνεται αυτόματα.
 */

type Msg = { role: 'user' | 'assistant'; content: string; speech?: string; actions?: ThanosActionCard[]; error?: boolean; turnId?: string | null; rating?: 1 | -1 }
type Status = Awaited<ReturnType<typeof thanosStatus>>

const STORE = 'thanos:chat'
const VOICE = 'thanos:voice'
const VOICE_LIMIT = 'thanos:voice-limit'
const WELCOMED = 'thanos:welcomed'
const CONVERSATION = 'thanos:conversation'
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

/** Παίζει ένα κομμάτι και περιμένει να τελειώσει: 'ended' | 'stopped' (διακοπή/άλλο κομμάτι) | 'blocked' (browser). */
function playToEnd(a: HTMLAudioElement, url: string, rate: number): Promise<'ended' | 'stopped' | 'blocked'> {
  return new Promise(resolve => {
    a.pause()
    a.src = url
    a.preservesPitch = true
    a.playbackRate = rate
    // Το «σταμάτησε» μετρά μόνο αφού ξεκίνησε ΑΥΤΟ το κομμάτι (το pause() του προηγούμενου φτάνει ασύγχρονα).
    let started = false
    a.onplaying = () => { started = true }
    a.onended = () => { URL.revokeObjectURL(url); resolve('ended') }
    a.onpause = () => { if (started && !a.ended) resolve('stopped') }
    a.play().catch(() => resolve('blocked'))
  })
}

/** Πρώτη πρόταση (≥40 χαρ.) χωριστά, το υπόλοιπο σε ένα κομμάτι — για γρήγορη έναρξη φωνής. */
function splitForSpeech(text: string): string[] {
  const t = text.replace(/\s+/g, ' ').trim()
  const re = /[.!;;](\s|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    const cut = m.index + 1
    if (cut >= 40) return cut < t.length - 15 ? [t.slice(0, cut).trim(), t.slice(cut).trim()] : [t]
  }
  return [t]
}


type TtsResult = Blob | 'limit' | null
async function fetchTts(text: string): Promise<TtsResult> {
  try {
    const r = await fetch('/api/thanos/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
    if (r.status === 429) return 'limit'
    return r.ok ? await r.blob() : null
  } catch {
    return null
  }
}

/**
 * Ουρά φωνής: κάθε κομμάτι ζητείται ΑΜΕΣΩΣ (παράλληλα) και παίζει με τη σειρά, χωρίς κενά.
 * Τροφοδοτείται είτε από τη ροή (πρόταση-πρόταση όσο γράφεται) είτε από ολόκληρο κείμενο.
 */
class SpeechQueue {
  private seq = 0
  private loopSeq = -1
  private items: Promise<TtsResult>[] = []
  private pushed = 0
  constructor(
    private audio: () => HTMLAudioElement,
    private rate: () => number,
    private on: { limit: () => void; blocked: () => void; idle: () => void },
  ) {}
  push(text: string) {
    const t = text.trim()
    if (!t) return
    this.items.push(fetchTts(t))
    this.pushed++
    if (this.loopSeq !== this.seq) void this.run(this.seq)
  }
  /** Κράτα μόνο τα πρώτα n κομμάτια συνολικά (π.χ. σε ενέργειες: μόνο η εισαγωγική πρόταση). */
  limitTo(n: number) {
    const consumed = this.pushed - this.items.length
    this.items = this.items.slice(0, Math.max(0, n - consumed))
    this.pushed = consumed + this.items.length
  }
  cancel() {
    this.seq++
    this.items = []
    this.pushed = 0
    this.audio().pause()
  }
  get active() { return this.loopSeq === this.seq }
  private async run(id: number) {
    this.loopSeq = id
    while (this.items.length && id === this.seq) {
      const r = await this.items.shift()!
      if (id !== this.seq) break
      if (r === 'limit') { this.cancel(); this.on.limit(); break }
      if (!r) continue
      const res = await playToEnd(this.audio(), URL.createObjectURL(r), this.rate())
      if (res === 'blocked') { this.cancel(); this.on.blocked(); break }
      if (res === 'stopped') break
    }
    if (this.loopSeq === id) { this.loopSeq = -1; if (id === this.seq) this.on.idle() }
  }
}

export function ThanosWidget({ firstName }: { firstName?: string }) {
  const pathname = usePathname() ?? '/'
  const page = useMemo(() => pageFromPath(pathname), [pathname])
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  /** Ροή: τι κάνει τώρα ο Thanos + το κείμενο που γράφεται. */
  const [liveStatus, setLiveStatus] = useState<string | null>(null)
  const [liveText, setLiveText] = useState('')
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [voice, setVoice] = useState(false)
  const [voiceLimited, setVoiceLimited] = useState(false)
  const recRef = useRef<MediaRecorder | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const queueRef = useRef<SpeechQueue | null>(null)
  const rateRef = useRef(1.15)
  const [speaking, setSpeaking] = useState<string | null>(null)
  const [audioBlocked, setAudioBlocked] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const hydrated = useRef(false)

  useEffect(() => { if (hydrated.current) write('session', STORE, msgs.slice(-40)) }, [msgs])
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [msgs, busy, liveText, liveStatus])
  useEffect(() => { if (open) inputRef.current?.focus() }, [open])
  useEffect(() => { rateRef.current = status?.speed ?? 1.15 }, [status?.speed])

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

  /** Ημερήσιο όριο φωνής (πελάτες): κλείνει η φωνή μέχρι αύριο, οι απαντήσεις συνεχίζουν σε κείμενο. */
  function onVoiceLimit() {
    setVoice(false)
    write('local', VOICE, false)
    write('local', VOICE_LIMIT, new Date().toDateString())
    setVoiceLimited(true)
    setSpeaking(null)
    setMsgs(m => [...m, { role: 'assistant', content: 'Ολοκληρώθηκαν τα 2 λεπτά φωνητικής συνομιλίας για σήμερα — από εδώ και πέρα θα σας απαντώ γραπτώς. Η φωνή θα είναι ξανά διαθέσιμη αύριο.' }])
  }

  function getQueue(): SpeechQueue {
    if (!queueRef.current) {
      queueRef.current = new SpeechQueue(
        () => audioRef.current ?? (audioRef.current = new Audio()),
        () => rateRef.current,
        { limit: onVoiceLimit, blocked: () => { setSpeaking(null); setAudioBlocked(true) }, idle: () => setSpeaking(null) },
      )
    }
    return queueRef.current
  }

  /** Ολόκληρο κείμενο → φωνή (πρώτη πρόταση αμέσως, το υπόλοιπο παράλληλα). */
  const speak = useCallback((text: string, force = false, ttsReady?: boolean) => {
    if ((!voice && !force) || !(ttsReady ?? status?.tts)) return
    const q = getQueue()
    q.cancel()
    setSpeaking(text)
    splitForSpeech(plain(text)).forEach(chunk => q.push(chunk))
  }, [voice, status?.tts]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Πελάτες: καλωσόρισμα μία φορά ανά συνεδρία (κείμενο + φωνή, αν είναι διαθέσιμη). */
  function onStatus(s: Status) {
    setStatus(s)
    if (s.mode !== 'CUSTOMER' || !s.welcome || !s.chat) return
    if (read('session', WELCOMED, false) || read<Msg[]>('session', STORE, []).length) return
    write('session', WELCOMED, true)
    setMsgs([{ role: 'assistant', content: s.welcome }])
    const limitedToday = read<string | null>('local', VOICE_LIMIT, null) === new Date().toDateString()
    if (!limitedToday && read('local', VOICE, true)) speak(s.welcome, true, s.tts)
  }

  useEffect(() => { if (open && !status) void thanosStatus().then(onStatus) }, [open, status]) // eslint-disable-line react-hooks/exhaustive-deps

  function stopSpeaking() {
    queueRef.current?.cancel()
    setSpeaking(null)
  }

  const send = useCallback(async (text: string) => {
    const message = text.trim()
    if (!message || busy) return
    const history = msgs.filter(m => !m.error).map(m => ({ role: m.role, content: m.content }))
    setMsgs(m => [...m, { role: 'user', content: message }])
    setInput('')
    setBusy(true)
    let conversationId = read<string | null>('session', CONVERSATION, null)
    if (!conversationId || msgs.length === 0) { conversationId = crypto.randomUUID(); write('session', CONVERSATION, conversationId) }
    setLiveStatus('Σκέφτομαι…')
    setLiveText('')
    // Φωνή ΟΣΟ γράφεται: κάθε ολοκληρωμένη πρόταση πάει αμέσως στην ουρά φωνής.
    const q = voice && status?.tts && !voiceLimited ? getQueue() : null
    q?.cancel()
    let feeder = new SentenceFeeder()
    let spoke = false
    const STREAM_KEY = '\u0000stream'
    let final: ThanosReply | null = null
    let error: string | null = null
    try {
      // Ροή NDJSON: status → (delta…) → done. Το κείμενο γράφεται καθώς παράγεται.
      const res = await fetch('/api/thanos/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ history, message, page, conversationId }) })
      if (!res.ok || !res.body) throw new Error(res.status === 401 ? 'Δεν είστε συνδεδεμένοι.' : 'Ο Thanos δεν απάντησε — δοκιμάστε ξανά.')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          const e = JSON.parse(line) as ThanosEvent
          if (e.type === 'status') { setLiveStatus(e.text); setLiveText('') }
          else if (e.type === 'delta') {
            setLiveText(t => t + e.text)
            if (q) for (const sentence of feeder.feed(e.text)) { q.push(sentence); if (!spoke) { spoke = true; setSpeaking(STREAM_KEY) } }
          } else if (e.type === 'reset') {
            setLiveText('')
            if (q && spoke) { q.cancel(); spoke = false }
            feeder = new SentenceFeeder()
          }
          else if (e.type === 'done') final = e.data
          else if (e.type === 'error') error = e.error
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
    setBusy(false)
    setLiveText('')
    setLiveStatus(null)
    if (!final) { setMsgs(m => [...m, { role: 'assistant', content: error ?? 'Ο Thanos δεν απάντησε — δοκιμάστε ξανά.', error: true }]); return }
    const reply: ThanosReply = final
    setMsgs(m => [...m, { role: 'assistant', content: reply.reply, speech: reply.speech, actions: reply.actions, turnId: reply.turnId }])
    if (!q) return
    if (!spoke) { speak(reply.speech); return } // π.χ. απάντηση από cache (χωρίς ροή)
    if (reply.actions.length) q.limitTo(1) // ενέργεια: μόνο η εισαγωγική πρόταση
    else {
      feeder.flush().forEach(sentence => q.push(sentence))
      if (feeder.listItems > 3) q.push('Η πλήρης λίστα είναι γραμμένη στη συνομιλία.')
    }
    if (q.active) setSpeaking(reply.speech ?? reply.reply)
  }, [busy, msgs, page, speak, voice, status?.tts, voiceLimited]) // eslint-disable-line react-hooks/exhaustive-deps

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
                    onClick={() => { unlockAudio(); setAudioBlocked(false); if (speaking === (m.speech ?? m.content)) stopSpeaking(); else speak(m.speech ?? m.content, true) }}
                    aria-label={speaking === (m.speech ?? m.content) ? 'Διακοπή ακρόασης' : 'Ακρόαση απάντησης'} title={speaking === (m.speech ?? m.content) ? 'Διακοπή' : 'Ακρόαση'}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                    {speaking === (m.speech ?? m.content) ? <Square className="size-3.5" /> : <Volume2 className="size-4" />}
                  </button>
                )}
                </div>
                {m.role === 'assistant' && m.turnId && !m.error && (
                  <Feedback turnId={m.turnId} rating={m.rating} onRated={r => setMsgs(ms => ms.map((x, j) => (j === i ? { ...x, rating: r } : x)))} />
                )}
                {m.actions?.map(a => <ActionCard key={a.id} card={a} onChange={patch => updateCard(a.id, patch)} />)}
              </div>
            ))}
            {audioBlocked && (
              <p className="text-[length:var(--fs-12)] text-muted-foreground">Ο browser μπλόκαρε την αυτόματη αναπαραγωγή — πατήστε το ηχείο δίπλα στην απάντηση.</p>
            )}
            {busy && liveText && (
              <div className="flex items-end gap-2">
                <Avatar className="size-7 shrink-0" />
                <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-[length:var(--fs-15)] font-medium leading-relaxed">
                  <RichText text={liveText} /><span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-foreground/60 motion-reduce:animate-none" aria-hidden />
                </div>
              </div>
            )}
            {((busy && !liveText) || transcribing) && (
              <div className="flex items-center gap-2 text-[length:var(--fs-13)] text-muted-foreground" role="status">
                <Avatar className="size-7 shrink-0" />
                <span className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5">
                  <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                  <span className="animate-pulse motion-reduce:animate-none">{transcribing ? 'Ακούω…' : liveStatus ?? 'Σκέφτομαι…'}</span>
                </span>
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

/** 👍 / 👎 — ο Thanos μαθαίνει από αυτά (👎 με σχόλιο = διόρθωση). */
function Feedback({ turnId, rating, onRated }: { turnId: string; rating?: 1 | -1; onRated: (r: 1 | -1) => void }) {
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  async function rate(r: 1 | -1, withNote?: string) {
    setPending(true)
    const res = await rateThanosTurn(turnId, r, withNote)
    setPending(false)
    if (res.ok) { onRated(r); setAsking(false) }
  }
  if (rating) {
    return <p className="pl-9 text-[length:var(--fs-12)] text-muted-foreground">{rating === 1 ? 'Ευχαριστώ — το κρατάω!' : 'Ευχαριστώ — θα το διορθώσω.'}</p>
  }
  if (asking) {
    return (
      <form className="flex w-full items-center gap-2 pl-9" onSubmit={e => { e.preventDefault(); void rate(-1, note) }}>
        <input autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder="Τι ήταν λάθος; Ποιο είναι το σωστό; (προαιρετικό)"
          aria-label="Διόρθωση απάντησης" className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-[length:var(--fs-13)] outline-none focus:border-primary" />
        <button type="submit" disabled={pending} className="h-9 rounded-full bg-primary px-3 text-[length:var(--fs-12-5)] font-semibold text-primary-foreground disabled:opacity-50">Αποστολή</button>
      </form>
    )
  }
  return (
    <div className="flex items-center gap-1 pl-9">
      <button type="button" disabled={pending} onClick={() => void rate(1)} aria-label="Καλή απάντηση" title="Καλή απάντηση"
        className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><ThumbsUp className="size-3.5" /></button>
      <button type="button" disabled={pending} onClick={() => setAsking(true)} aria-label="Κακή απάντηση" title="Κακή απάντηση — διόρθωσέ με"
        className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><ThumbsDown className="size-3.5" /></button>
    </div>
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
