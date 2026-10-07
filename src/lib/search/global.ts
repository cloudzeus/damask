'use server'

import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

/**
 * Καθολική αναζήτηση (⌘K) — βρίσκει πελάτες/προμηθευτές, προγράμματα, έργα και
 * leads με ΑΦΜ ή όνομα, και επιστρέφει έτοιμο σύνδεσμο για κατευθείαν μετάβαση.
 * Session-only gate· οι σελίδες-στόχοι έχουν τα δικά τους permissions.
 */

export type SearchResultKind = 'customer' | 'supplier' | 'program' | 'project' | 'lead' | 'document'
export type SearchResult = { id: string; kind: SearchResultKind; title: string; subtitle: string | null; href: string }

export async function searchEverything(qRaw: string): Promise<SearchResult[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  const q = qRaw.trim()
  if (q.length < 2) return []

  const perms = new Set(session.user.permissions ?? [])
  // Έγγραφα: έξυπνη αναζήτηση (σημασιολογική + κειμένου) — μόνο για όσους βλέπουν πελάτες.
  const docsPromise = perms.has('customer.view') && q.length >= 3
    ? import('@/lib/search/documents').then(m => m.searchDocuments(q, { limit: 6 })).catch(() => [])
    : Promise.resolve([])
  const [trdrs, programs, apps, leads] = await Promise.all([
    prisma.trdr.findMany({
      where: { OR: [{ NAME: { contains: q, mode: 'insensitive' } }, { AFM: { contains: q } }] },
      take: 6, orderBy: { NAME: 'asc' },
      select: { id: true, NAME: true, AFM: true, SODTYPE: true },
    }),
    prisma.program.findMany({
      where: { title: { contains: q, mode: 'insensitive' } },
      take: 5, orderBy: { createdAt: 'desc' },
      select: { id: true, title: true },
    }),
    prisma.programApplication.findMany({
      where: { OR: [{ trdr: { NAME: { contains: q, mode: 'insensitive' } } }, { trdr: { AFM: { contains: q } } }] },
      take: 5, orderBy: { updatedAt: 'desc' },
      select: { id: true, programId: true, trdr: { select: { NAME: true } }, program: { select: { title: true } } },
    }),
    prisma.lead.findMany({
      where: { OR: [{ companyName: { contains: q, mode: 'insensitive' } }, { afm: { contains: q } }, { email: { contains: q, mode: 'insensitive' } }] },
      take: 5, orderBy: { createdAt: 'desc' },
      select: { id: true, companyName: true, afm: true, email: true },
    }),
  ])

  const out: SearchResult[] = []
  for (const t of trdrs) {
    const supplier = t.SODTYPE === 12
    out.push({ id: t.id, kind: supplier ? 'supplier' : 'customer', title: t.NAME, subtitle: t.AFM ? `ΑΦΜ ${t.AFM}` : null, href: `/partners/${t.id}` })
  }
  for (const a of apps) {
    out.push({ id: a.id, kind: 'project', title: a.trdr.NAME, subtitle: a.program.title, href: `/programs/${a.programId}/applications/${a.id}` })
  }
  for (const p of programs) {
    out.push({ id: p.id, kind: 'program', title: p.title, subtitle: null, href: `/programs/${p.id}` })
  }
  for (const l of leads) {
    out.push({ id: l.id, kind: 'lead', title: l.companyName || l.email, subtitle: l.afm ? `ΑΦΜ ${l.afm}` : l.email, href: '/leads' })
  }
  const docs = (await docsPromise).filter(d => perms.has('files.manage') || (d.category !== 'db-backup' && d.category !== 'template'))
  for (const d of docs) {
    out.push({
      id: d.key, kind: 'document', title: d.title,
      subtitle: [d.trdrName, d.snippet].filter(Boolean).join(' · ').slice(0, 140) || null,
      href: `/api/files/download?key=${encodeURIComponent(d.key)}&disp=inline`,
    })
  }
  return out
}
