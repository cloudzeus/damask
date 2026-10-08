import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getIntegration } from '@/lib/settings'

/** ElevenLabs text-to-speech (φωνή του Thanos). integration.elevenlabs { apiKey, voiceId, model }. */

export const DEFAULT_TTS_MODEL = 'eleven_multilingual_v2'
export type ElevenLabsConfig = { apiKey?: string; voiceId?: string; model?: string }

export async function isTtsConfigured(): Promise<boolean> {
  const c = await getIntegration<ElevenLabsConfig>('elevenlabs')
  return !!(c.apiKey?.trim() && c.voiceId?.trim())
}

export async function elevenlabsTts(text: string): Promise<Buffer> {
  const c = await getIntegration<ElevenLabsConfig>('elevenlabs')
  if (!c.apiKey?.trim() || !c.voiceId?.trim()) throw new Error('Δεν έχει ρυθμιστεί το ElevenLabs (Ρυθμίσεις → Διασυνδέσεις).')
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(c.voiceId.trim())}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': c.apiKey.trim(), 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: text.slice(0, 2500), model_id: c.model?.trim() || DEFAULT_TTS_MODEL }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`ElevenLabs HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ''}`)
  }
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
export async function elevenlabsTtsCached(text: string): Promise<Buffer> {
  const c = await getIntegration<ElevenLabsConfig>('elevenlabs')
  const hash = createHash('sha256').update(`${c.voiceId ?? ''}|${c.model || DEFAULT_TTS_MODEL}|${text}`).digest('hex')
  const hit = await prisma.thanosTtsCache.findUnique({ where: { hash }, select: { audio: true } }).catch(() => null)
  if (hit) {
    void prisma.thanosTtsCache.update({ where: { hash }, data: { hits: { increment: 1 }, lastHitAt: new Date() } }).catch(() => {})
    return Buffer.from(hit.audio)
  }
  const audio = await elevenlabsTts(text)
  if (text.length <= 2500) {
    await prisma.thanosTtsCache.create({ data: { hash, audio: new Uint8Array(audio), chars: text.length } }).catch(() => {})
  }
  return audio
}
