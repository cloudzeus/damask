import { prisma } from '@/lib/prisma'
import { SITE_NAME, SITE_URL, absoluteUrl } from '@/lib/site-url'

export const revalidate = 3600

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** RSS 2.0 με τους οδηγούς/νέα (εκτός Τύπου) — για aggregators, Feedly, Google News και AI crawlers. */
export async function GET() {
  const posts = await prisma.post.findMany({
    where: { status: 'PUBLISHED', OR: [{ categoryId: null }, { category: { slug: { not: 'typos' } } }] },
    orderBy: { publishedAt: 'desc' }, take: 50,
    select: { slug: true, publishedAt: true, updatedAt: true, featuredImage: true, translations: { where: { locale: 'el' }, select: { title: true, excerpt: true } } },
  })
  const items = posts.filter(p => p.translations[0]).map(p => {
    const t = p.translations[0]
    const url = absoluteUrl(`/nea/${p.slug}`)
    return `<item><title>${esc(t.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><pubDate>${(p.publishedAt ?? p.updatedAt).toUTCString()}</pubDate>`
      + (t.excerpt ? `<description>${esc(t.excerpt)}</description>` : '')
      + (p.featuredImage ? `<enclosure url="${esc(p.featuredImage)}" type="image/webp" length="0"/>` : '')
      + '</item>'
  }).join('')
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${esc(`${SITE_NAME} — Οδηγοί & νέα ΕΣΠΑ`)}</title><link>${SITE_URL}/nea</link><atom:link href="${absoluteUrl('/rss.xml')}" rel="self" type="application/rss+xml"/><description>Οδηγοί για προγράμματα ΕΣΠΑ και επιδοτήσεις επιχειρήσεων από τη World Wide Associates.</description><language>el</language>${items}</channel></rss>`
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } })
}
