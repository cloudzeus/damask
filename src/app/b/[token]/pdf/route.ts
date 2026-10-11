import { prisma } from '@/lib/prisma'
import { bunnyDownload } from '@/lib/bunny-storage'
import { renderCertPdf } from '@/lib/supplier-cert/core'

/** PDF της βεβαίωσης για τον προμηθευτή (token-gated): υπογεγραμμένο αν υπάρχει, αλλιώς προεπισκόπηση. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new Response('Not found', { status: 404 })
  const c = await prisma.supplierCertificate.findUnique({ where: { token } })
  if (!c || (c.status !== 'SIGNED' && c.expiresAt.getTime() < Date.now())) return new Response('Not found', { status: 404 })
  const pdf = c.pdfKey ? await bunnyDownload(c.pdfKey) : await renderCertPdf(c)
  return new Response(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="vevaiosi-promithefti.pdf"`, 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
  })
}
