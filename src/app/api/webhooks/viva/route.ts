import { z } from 'zod'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { verifyWebhookGet, processVivaWebhookEvent, type VivaWebhookEvent } from '@/lib/viva'

/**
 * Viva Payments webhook — δημόσιο endpoint (βλ. src/proxy.ts PUBLIC_PREFIXES:
 * '/api/webhooks/'), καμία session cookie δεν φτάνει εδώ.
 *
 * GET  → verification handshake. Η Viva καλεί GET όταν καταχωρείς το URL στο
 *        portal και περιμένει {Key: <verification key>} για να το εγκρίνει.
 * POST → πραγματικά events (EventTypeId 1796/1797, βλ. lib/viva.ts). ΠΑΝΤΑ
 *        απαντάει 200 — ακόμα κι όταν το σώμα δεν είναι έγκυρο ή το
 *        OrderCode είναι άγνωστο — ώστε η Viva να μη ξαναδοκιμάζει επ' άπειρον
 *        ένα event που δεν πρόκειται ποτέ να «διορθωθεί». Τα προβλήματα
 *        καταγράφονται μόνο σε server log.
 */
export const runtime = 'nodejs'

export async function GET() {
  const result = await verifyWebhookGet()
  if (!result) {
    return NextResponse.json(
      { error: 'Το Viva webhook δεν έχει ρυθμιστεί ακόμα (λείπει το verification key για το ενεργό environment).' },
      { status: 404 },
    )
  }
  return NextResponse.json(result)
}

const eventSchema = z.object({
  EventTypeId: z.number(),
  EventData: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(request: Request) {
  const json = await request.json().catch(() => null)
  const parsed = eventSchema.safeParse(json)

  if (!parsed.success) {
    console.warn('[viva-webhook] μη έγκυρο σώμα event:', parsed.error.message)
    return NextResponse.json({ ok: true, handled: false }, { status: 200 })
  }

  try {
    const result = await processVivaWebhookEvent(parsed.data as VivaWebhookEvent)
    if (!result.handled) {
      console.warn(`[viva-webhook] μη διαχειρίσιμο event (${result.reason}, orderCode=${result.orderCode ?? '—'})`)
    } else {
      revalidatePath('/payments')
    }
    return NextResponse.json({ ok: true, handled: result.handled }, { status: 200 })
  } catch (err) {
    // Ποτέ 5xx προς τη Viva ακόμα κι όταν κάτι απρόβλεπτο σκάσει (π.χ. προσωρινό
    // πρόβλημα DB) — log μόνο. Trade-off σκόπιμο: η Viva ΔΕΝ ξαναδοκιμάζει ένα
    // event μετά από 200, οπότε ένα πραγματικά transient σφάλμα εδώ δεν έχει
    // αυτόματο retry από τη Viva πλευρά· αν αποδειχθεί πρόβλημα σε production
    // (π.χ. downtime στη DB τη στιγμή του event), χρειάζεται δικό μας alerting
    // πάνω σε αυτό το log ή μια εσωτερική ουρά επανάληψης.
    console.error('[viva-webhook] σφάλμα κατά την επεξεργασία event:', err)
    return NextResponse.json({ ok: false, handled: false }, { status: 200 })
  }
}
