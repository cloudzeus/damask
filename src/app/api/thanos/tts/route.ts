import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { elevenlabsTtsCached } from '@/lib/voice/elevenlabs'
import { speakable } from '@/lib/voice/speakable'

/** Πελάτες (portal): έως 2 λεπτά φωνής την ημέρα — μετά οι απαντήσεις συνεχίζουν μόνο σε κείμενο. */
const CUSTOMER_DAILY_SECONDS = 120
/** mp3_44100_128 → 16.000 bytes ανά δευτερόλεπτο. */
const mp3Seconds = (bytes: number) => bytes / 16_000
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Athens' })

/** Φωνή του Thanos: POST { text } → audio/mpeg (ElevenLabs, με cache). 429 { limit } όταν εξαντληθεί το ημερήσιο όριο. */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return new Response('unauthorized', { status: 401 })
  const body = await request.json().catch(() => null) as { text?: unknown } | null
  const text = typeof body?.text === 'string' ? speakable(body.text.trim()) : ''
  if (!text) return new Response('empty', { status: 400 })

  const limited = Boolean((session.user as { portalHome?: boolean }).portalHome)
  const key = { userId: session.user.id, day: today() }
  if (limited) {
    const used = await prisma.thanosVoiceUsage.findUnique({ where: { userId_day: key }, select: { seconds: true } })
    if ((used?.seconds ?? 0) >= CUSTOMER_DAILY_SECONDS) return Response.json({ limit: true, seconds: CUSTOMER_DAILY_SECONDS }, { status: 429 })
  }
  try {
    const audio = await elevenlabsTtsCached(text)
    const secs = mp3Seconds(audio.length)
    await prisma.thanosVoiceUsage.upsert({ where: { userId_day: key }, create: { ...key, seconds: secs }, update: { seconds: { increment: secs } } }).catch(() => {})
    return new Response(new Uint8Array(audio), { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } })
  } catch (err) {
    return new Response(err instanceof Error ? err.message : 'tts error', { status: 502 })
  }
}
