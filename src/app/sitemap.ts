import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'
import { SITE_INDEXABLE, absoluteUrl } from '@/lib/site-url'

export const revalidate = 3600

/** sitemap.xml: σελίδες website + ενεργά προγράμματα + δημοσιευμένα άρθρα (με lastModified). Κενό σε staging. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!SITE_INDEXABLE) return []
  const now = new Date()
  const [programs, posts] = await Promise.all([
    prisma.program.findMany({ where: { status: 'ACTIVE', publicSlug: { not: null } }, select: { publicSlug: true, updatedAt: true } }),
    prisma.post.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true, publishedAt: true } }),
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
    ...programs.map(p => ({ url: absoluteUrl(`/programmata/${p.publicSlug}`), lastModified: p.updatedAt, changeFrequency: 'weekly' as const, priority: 0.9 })),
    ...posts.map(p => ({ url: absoluteUrl(`/nea/${p.slug}`), lastModified: p.updatedAt, changeFrequency: 'monthly' as const, priority: 0.7 })),
  ]
}
