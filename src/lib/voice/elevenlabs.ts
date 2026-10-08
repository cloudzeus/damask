import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getIntegration } from '@/lib/settings'
import { logApiUsage } from '@/lib/api-usage'

/** ElevenLabs text-to-speech (φωνή του Thanos). integration.elevenlabs { apiKey, voiceId, model }. */

/** Turbo v2.5: ~1″ ανά απάντηση (το v3 θέλει 9-17″) — με επιβολή ελληνικών. */
export const DEFAULT_TTS_MODEL = 'eleven_turbo_v2_5'
/** Μοντέλα που δέχονται επιβολή γλώσσας (language_code) — έτσι τα ελληνικά δεν «διαβάζονται» με αγγλική λογική. */
const LANG_MODELS = new Set(['eleven_v3', 'eleven_turbo_v2_5', 'eleven_flash_v2_5'])

/** Ρυθμίσεις φωνής: φυσική, ζεστή απόδοση. Το v3 δέχεται μόνο stability 0 / 0.5 / 1. */
function voiceBody(model: string) {
  return {
    model_id: model,
    ...(LANG_MODELS.has(model) ? { language_code: 'el' } : {}),
    voice_settings: model === 'eleven_v3'
      ? { stability: 0.5 }
      : { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true, speed: 1 },
  }
}
export type ElevenLabsConfig = { apiKey?: string; voiceId?: string; model?: string; speed?: string }

/** Ταχύτητα αναπαραγωγής στον browser (με διατήρηση τόνου) — το v3 δεν σέβεται σταθερά το speed του API. */
export const DEFAULT_VOICE_SPEED = 1.15
export async function getVoiceSpeed(): Promise<number> {
  const c = await getIntegration<ElevenLabsConfig>('elevenlabs')
  const v = Number(c.speed)
  return Number.isFinite(v) && v >= 0.8 && v <= 1.5 ? v : DEFAULT_VOICE_SPEED
}

export async function isTtsConfigured(): Promise<boolean> {
  const c = await getIntegration<ElevenLabsConfig>('elevenlabs')
  return !!(c.apiKey?.trim() && c.voiceId?.trim())
}

export async function elevenlabsTts(text: string, override: { voiceId?: string; model?: string } = {}): Promise<Buffer> {
  const c = await getIntegration<ElevenLabsConfig>('elevenlabs')
  const voiceId = override.voiceId?.trim() || c.voiceId?.trim()
  const model = override.model?.trim() || c.model?.trim() || DEFAULT_TTS_MODEL
  if (!c.apiKey?.trim() || !voiceId) throw new Error('Δεν έχει ρυθμιστεί το ElevenLabs (Ρυθμίσεις → Διασυνδέσεις).')
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': c.apiKey.trim(), 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: text.slice(0, 2500), ...voiceBody(model) }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`ElevenLabs HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ''}`)
  }
  // Κόστος (/costs → ElevenLabs): χρεώνονται οι χαρακτήρες που στάλθηκαν — μόνο σε πραγματική κλήση, όχι από cache.
  void logApiUsage({ service: 'elevenlabs', operation: `tts:${model}`, units: Math.min(text.length, 2500), refType: 'thanos' })
  return Buffer.from(await res.arrayBuffer())
}

export async function testElevenLabs(config: ElevenLabsConfig): Promise<{ ok: boolean; message: string }> {
  if (!config.apiKey?.trim()) return { ok: false, message: 'Συμπλήρωσε το API key.' }
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/voices${config.voiceId?.trim() ? `/${encodeURIComponent(config.voiceId.trim())}` : ''}`, {
      headers: { 'xi-api-key': config.apiKey.trim() }, signal: AbortSignal.timeout(15_000),
    })
    if (res.status === 401) return { ok: false, message: 'Μη έγκυρο API key.' }
    if (res.status === 404 || res.status === 400) return { ok: false, message: 'Η φωνή (Voice ID) δεν βρέθηκε.' }
    if (!res.ok) return { ok: false, message: `Το ElevenLabs επέστρεψε HTTP ${res.status}.` }
    const j = await res.json().catch(() => null) as { name?: string } | null
    return { ok: true, message: `Επιτυχής σύνδεση με το ElevenLabs${j?.name ? ` — φωνή «${j.name}»` : ''}.` }
  } catch (err) {
    return { ok: false, message: `Αποτυχία σύνδεσης (${err instanceof Error ? err.message : String(err)}).` }
  }
}

/** Όπως elevenlabsTts, αλλά με cache στη βάση: ίδιο κείμενο/φωνή → αποθηκευμένο mp3 (χωρίς νέα χρέωση ElevenLabs). */
export async function elevenlabsTtsCached(text: string, override: { voiceId?: string; model?: string } = {}): Promise<Buffer> {
  const c = await getIntegration<ElevenLabsConfig>('elevenlabs')
  const voiceId = override.voiceId?.trim() || c.voiceId?.trim() || ''
  const model = override.model?.trim() || c.model?.trim() || DEFAULT_TTS_MODEL
  const hash = createHash('sha256').update(`v2|${voiceId}|${model}|${text}`).digest('hex')
  const hit = await prisma.thanosTtsCache.findUnique({ where: { hash }, select: { audio: true } }).catch(() => null)
  if (hit) {
    void prisma.thanosTtsCache.update({ where: { hash }, data: { hits: { increment: 1 }, lastHitAt: new Date() } }).catch(() => {})
    return Buffer.from(hit.audio)
  }
  const audio = await elevenlabsTts(text, { voiceId, model })
  if (text.length <= 2500) {
    await prisma.thanosTtsCache.create({ data: { hash, audio: new Uint8Array(audio), chars: text.length } }).catch(() => {})
  }
  return audio
}

export type GreekVoice = { id: string; name: string; gender: string | null; age: string | null; accent: string | null; description: string | null; mine: boolean; popularity: number }

/** Ελληνικές φωνές: όσες έχει ο λογαριασμός + η δημόσια βιβλιοθήκη ElevenLabs (ταξινόμηση κατά χρήση). */
export async function listGreekVoices(): Promise<GreekVoice[]> {
  const c = await getIntegration<ElevenLabsConfig>('elevenlabs')
  if (!c.apiKey?.trim()) throw new Error('Συμπλήρωσε και αποθήκευσε πρώτα το API key του ElevenLabs.')
  const h = { 'xi-api-key': c.apiKey.trim() }
  type Raw = { voice_id: string; name: string; gender?: string; age?: string; accent?: string; description?: string; descriptive?: string; use_case?: string; cloned_by_count?: number; labels?: Record<string, string> }
  const [shared, mine] = await Promise.all([
    fetch('https://api.elevenlabs.io/v1/shared-voices?language=el&page_size=60&sort=usage_character_count_1y', { headers: h, signal: AbortSignal.timeout(20_000) }).then(r => r.json()).catch(() => ({})) as Promise<{ voices?: Raw[] }>,
    fetch('https://api.elevenlabs.io/v2/voices?page_size=100', { headers: h, signal: AbortSignal.timeout(20_000) }).then(r => r.json()).catch(() => ({})) as Promise<{ voices?: Raw[] }>,
  ])
  const out = new Map<string, GreekVoice>()
  for (const v of mine.voices ?? []) {
    if (v.labels?.language !== 'el' && !/greek/i.test(v.labels?.accent ?? '')) continue
    out.set(v.voice_id, { id: v.voice_id, name: v.name, gender: v.labels?.gender ?? null, age: v.labels?.age ?? null, accent: v.labels?.accent ?? null, description: v.description ?? null, mine: true, popularity: Number.MAX_SAFE_INTEGER })
  }
  for (const v of shared.voices ?? []) {
    if (out.has(v.voice_id) || /whisper|cartoon|asmr/i.test(`${v.name} ${v.description ?? ''} ${v.use_case ?? ''}`)) continue
    out.set(v.voice_id, { id: v.voice_id, name: v.name, gender: v.gender ?? null, age: v.age ?? null, accent: v.accent ?? null, description: (v.description ?? '').slice(0, 160) || null, mine: false, popularity: v.cloned_by_count ?? 0 })
  }
  return [...out.values()].sort((a, b) => b.popularity - a.popularity)
}

/** Δείγμα φωνής με ΙΔΙΟ κείμενο για όλες (σύγκριση) — με cache, οπότε κάθε δείγμα χρεώνεται μία φορά. */
export const VOICE_SAMPLE_TEXT = 'Καλημέρα σας! Είμαι ο Thanos, ο ψηφιακός σας σύμβουλος. Για την επιχείρησή σας, την «Παπαδόπουλος Α.Ε.», χρειαζόμαστε ακόμα το Ε3 του 2024 — θέλετε να το ζητήσω από τον λογιστή σας;'
