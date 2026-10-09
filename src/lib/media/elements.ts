import { prisma } from '@/lib/prisma'
import { describeImage } from './vision'

/**
 * (Plain module.) Φωτογραφίες Envato Elements (κατεβασμένες με τη συνδρομή και ανεβασμένες στον φάκελο
 * «Envato Elements»): AI περιγραφή → alt + tags + καταλληλότητα, ώστε η αρθρογραφία να τις διαλέγει ΠΡΩΤΕΣ.
 */
export const ELEMENTS_FOLDER = 'Envato Elements'

export async function ensureElementsFolder(): Promise<string> {
  const f = await prisma.mediaFolder.findFirst({ where: { name: ELEMENTS_FOLDER, parentId: null }, select: { id: true } })
  return f?.id ?? (await prisma.mediaFolder.create({ data: { name: ELEMENTS_FOLDER, parentId: null }, select: { id: true } })).id
}

export async function tagElementsAsset(assetId: string, image: Buffer, mimeType: string): Promise<void> {
  const d = await describeImage(image, mimeType)
  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId }, select: { meta: true } })
  await prisma.mediaAsset.update({
    where: { id: assetId },
    data: {
      ...(d ? { alt: d.alt } : {}),
      meta: { ...((asset?.meta ?? {}) as object), source: 'elements', license: 'Envato Elements', ...(d ? { tags: d.tags.join(' '), suitable: d.suitable } : { tags: '', suitable: true }) },
    },
  })
}

/** Για φωτογραφίες που ανέβηκαν πριν: περιγραφή όσων στον φάκελο Elements δεν έχουν tags ακόμα. */
export async function tagPendingElements(limit = 50): Promise<number> {
  const folderId = await ensureElementsFolder()
  const assets = await prisma.mediaAsset.findMany({ where: { folderId, type: 'IMAGE' }, select: { id: true, cdnUrl: true, mimeType: true, meta: true }, take: 500 })
  let n = 0
  for (const a of assets.filter(a => !(a.meta as { tags?: string } | null)?.tags).slice(0, limit)) {
    const res = await fetch(a.cdnUrl, { signal: AbortSignal.timeout(30_000) }).catch(() => null)
    if (!res?.ok) continue
    await tagElementsAsset(a.id, Buffer.from(await res.arrayBuffer()), a.mimeType ?? 'image/webp')
    n++
  }
  return n
}

/** Μοτίβο ονόματος αρχείων Envato Elements: «…-2024-12-02-18-16-56-utc». */
export const ELEMENTS_NAME = /-?\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-utc/i
/** Περιγραφή από το όνομα: «solar-panel-master-engineer-in-a-high-tech-factory-2024-…-utc» → «solar panel master engineer in a high tech factory». */
export const labelFromName = (name: string) => name.replace(/^\d{10,}-[0-9a-f]{6,}-/i, '').replace(ELEMENTS_NAME, '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/\s+\d+$/, '').trim()

export type ElementsCandidate = { url: string; label: string }

/** Φωτογραφίες Elements (φάκελος ή όνομα αρχείου) που ΔΕΝ χρησιμοποιούνται ήδη σε άρθρο και είναι κατάλληλες. */
export async function elementsCandidates(limit = 120): Promise<ElementsCandidate[]> {
  const used = new Set((await prisma.post.findMany({ where: { featuredImage: { not: null } }, select: { featuredImage: true } })).map(p => p.featuredImage))
  const folder = await prisma.mediaFolder.findFirst({ where: { name: ELEMENTS_FOLDER, parentId: null }, select: { id: true } })
  const assets = await prisma.mediaAsset.findMany({ where: { type: 'IMAGE' }, select: { cdnUrl: true, name: true, alt: true, folderId: true, meta: true }, orderBy: { createdAt: 'desc' }, take: 5000 })
  return assets
    .filter(a => !used.has(a.cdnUrl))
    .filter(a => { const m = (a.meta ?? {}) as { source?: string; suitable?: boolean }; return m.suitable !== false && (m.source === 'elements' || a.folderId === folder?.id || ELEMENTS_NAME.test(a.name)) })
    .map(a => ({ url: a.cdnUrl, label: (a.alt && !ELEMENTS_NAME.test(a.alt) ? a.alt : labelFromName(a.name)).slice(0, 110) }))
    .slice(0, limit)
}
