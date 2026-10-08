import { resolveThanosContext, type PageContext } from '@/lib/thanos/context'
import { runThanos, type ChatTurn, type ThanosEvent } from '@/lib/thanos/agent'

/**
 * Συνομιλία με τον Thanos σε ροή (NDJSON — ένα γεγονός ανά γραμμή):
 *  status (τι κάνει τώρα) · delta (κομμάτι κειμένου) · reset (άκυρο προσωρινό κείμενο) · done (τελική απάντηση) · error.
 * Ο ρόλος/scope βγαίνει ΠΑΝΤΑ από το session.
 */
export const maxDuration = 120

export async function POST(request: Request) {
  const ctx = await resolveThanosContext()
  if (!ctx) return new Response('unauthorized', { status: 401 })
  const body = await request.json().catch(() => null) as { history?: ChatTurn[]; message?: string; page?: PageContext; conversationId?: string } | null
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message) return new Response('empty', { status: 400 })
  const history = (Array.isArray(body?.history) ? body.history : [])
    .filter(h => (h?.role === 'user' || h?.role === 'assistant') && typeof h.content === 'string')

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ThanosEvent) => { try { controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`)) } catch { /* ο χρήστης έκλεισε */ } }
      send({ type: 'status', text: 'Σκέφτομαι…' })
      try {
        const data = await runThanos(ctx, history, message, body?.page, body?.conversationId, send)
        send({ type: 'done', data })
      } catch (err) {
        send({ type: 'error', error: err instanceof Error ? err.message : String(err) })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' },
  })
}
