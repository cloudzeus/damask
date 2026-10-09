import { prisma } from '@/lib/prisma'
import { bunnyGetObjectResponse } from '@/lib/bunny-storage'
import { resolvePortalContact } from '@/lib/pm/portal-session'

/** Λήψη δικαιολογητικού της επιχείρησης από το portal — μόνο για επαφές του ίδιου πελάτη (ή staff σε προεπισκόπηση). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const preview = new URL(req.url).searchParams.get('preview') ?? undefined
  const contact = await resolvePortalContact(preview)
  if (!contact) return new Response('Δεν έχετε πρόσβαση.', { status: 403 })
  const doc = await prisma.trdrDossierDocument.findUnique({ where: { id }, select: { trdrId: true, name: true, storageKey: true, mimeType: true } })
  if (!doc || doc.trdrId !== contact.trdrId) return new Response('Δεν βρέθηκε.', { status: 404 })
  const upstream = await bunnyGetObjectResponse(doc.storageKey)
  if (!upstream.ok || !upstream.body) return new Response('Το αρχείο δεν είναι διαθέσιμο.', { status: 502 })
  return new Response(upstream.body, {
    headers: {
      'Content-Type': doc.mimeType || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
