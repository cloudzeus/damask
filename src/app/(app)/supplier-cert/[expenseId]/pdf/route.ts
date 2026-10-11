import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyDownload } from '@/lib/bunny-storage'
import { renderCertPdf } from '@/lib/supplier-cert/core'

/** Προεπισκόπηση / λήψη της βεβαίωσης προμηθευτή μιας δαπάνης (γραφείο). */
export async function GET(_req: Request, { params }: { params: Promise<{ expenseId: string }> }) {
  try { await requirePermission('programs.manage') } catch { return new Response('Forbidden', { status: 403 }) }
  const { expenseId } = await params
  const c = await prisma.supplierCertificate.findUnique({ where: { expenseId } })
  if (!c) return new Response('Not found', { status: 404 })
  const pdf = c.status === 'SIGNED' && c.pdfKey ? await bunnyDownload(c.pdfKey) : await renderCertPdf(c)
  return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="vevaiosi-promithefti.pdf"', 'Cache-Control': 'private, no-store' } })
}
