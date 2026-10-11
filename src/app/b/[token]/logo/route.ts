import { prisma } from '@/lib/prisma'
import { bunnyDownload } from '@/lib/bunny-storage'

/** Λογότυπο του προμηθευτή για την προεπισκόπηση στη σελίδα υπογραφής (token-gated). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new Response('Not found', { status: 404 })
  const c = await prisma.supplierCertificate.findUnique({ where: { token }, select: { supplierTrdrId: true } })
  const t = c?.supplierTrdrId ? await prisma.trdr.findUnique({ where: { id: c.supplierTrdrId }, select: { supplierLogoKey: true } }) : null
  if (!t?.supplierLogoKey) return new Response('Not found', { status: 404 })
  const ext = t.supplierLogoKey.split('.').pop()
  const buf = await bunnyDownload(t.supplierLogoKey)
  return new Response(new Uint8Array(buf), { headers: { 'Content-Type': ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg', 'Cache-Control': 'private, no-store' } })
}
