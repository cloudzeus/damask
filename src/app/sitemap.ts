import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { SITE_INDEXABLE, absoluteUrl } from '@/lib/site-url'
import { REGIONS, SECTORS, programsForRegion, programsForSector } from '@/lib/seo-content/hubs'

export const revalidate = 3600

/** sitemap.xml: σελίδες website + ενεργά προγράμματα + δημοσιευμένα άρθρα (με lastModified). Κενό σε staging. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!SITE_INDEXABLE) return []
  const now = new Date()
  const [programs, posts] = await Promise.all([
    prisma.program.findMany({ where: { status: 'ACTIVE', publicSlug: { not: null } }, select: { publicSlug: true, updatedAt: true, imageUrl: true } }),
    prisma.post.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true, publishedAt: true, featuredImage: true } }),
  ])
  // Σελίδες περιφέρειας/κλάδου ΜΟΝΟ όταν έχουν ενεργό πρόγραμμα (οι άδειες είναι noindex).
  const [regions, sectors] = await Promise.all([
    Promise.all(REGIONS.map(async r => ((await programsForRegion(r)).length ? `/espa/${r.slug}` : null))),
    Promise.all(SECTORS.map(async s => ((await programsForSector(s)).length ? `/espa/klados/${s.slug}` : null))),
  ])
  const latestPost = posts.reduce<Date | null>((m, p) => (!m || p.updatedAt > m ? p.updatedAt : m), null)
  const latestProgram = programs.reduce<Date | null>((m, p) => (!m || p.updatedAt > m ? p.updatedAt : m), null)
  return [
    { url: absoluteUrl('/'), lastModified: latestProgram ?? now, changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/programmata'), lastModified: latestProgram ?? now, changeFrequency: 'daily', priority: 0.9 },
    { url: absoluteUrl('/eligibility'), changeFrequency: 'monthly', priority: 0.8 },
    { url: absoluteUrl('/nea'), lastModified: latestPost ?? now, changeFrequency: 'daily', priority: 0.8 },
    { url: absoluteUrl('/ypiresies'), changeFrequency: 'monthly', priority: 0.7 },
    { url: absoluteUrl('/etaireia'), changeFrequency: 'yearly', priority: 0.5 },
    { url: absoluteUrl('/pelates'), changeFrequency: 'monthly', priority: 0.5 },
    { url: absoluteUrl('/epikoinonia'), changeFrequency: 'yearly', priority: 0.6 },
    { url: absoluteUrl('/programmata/nea-2026'), lastModified: latestPost ?? now, changeFrequency: 'weekly', priority: 0.8 },
    { url: absoluteUrl('/prothesmies-espa'), lastModified: latestProgram ?? now, changeFrequency: 'daily', priority: 0.8 },
    { url: absoluteUrl('/espa'), lastModified: latestProgram ?? now, changeFrequency: 'weekly', priority: 0.7 },
    { url: absoluteUrl('/glossari'), changeFrequency: 'monthly', priority: 0.6 },
    { url: absoluteUrl('/syxnes-erotiseis'), changeFrequency: 'monthly', priority: 0.7 },
    { url: absoluteUrl('/elegxos-kad'), changeFrequency: 'weekly', priority: 0.8 },
    { url: absoluteUrl('/pyli-pelaton'), changeFrequency: 'monthly', priority: 0.7 },
    { url: absoluteUrl('/typos'), lastModified: latestPost ?? now, changeFrequency: 'monthly', priority: 0.4 },
    ...[...regions, ...sectors].filter((u): u is string => !!u).map(u => ({ url: absoluteUrl(u), lastModified: latestProgram ?? now, changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...programs.map(p => ({ url: absoluteUrl(`/programmata/${p.publicSlug}`), lastModified: p.updatedAt, changeFrequency: 'weekly' as const, priority: 0.9, ...(p.imageUrl ? { images: [p.imageUrl] } : {}) })),
    ...posts.map(p => ({ url: absoluteUrl(`/nea/${p.slug}`), lastModified: p.updatedAt, changeFrequency: 'monthly' as const, priority: 0.7, ...(p.featuredImage ? { images: [p.featuredImage] } : {}) })),
  ]
}
