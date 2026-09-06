import { prisma } from '@/lib/prisma'

/**
 * Read-only loaders για τις ΔΗΜΟΣΙΕΣ σελίδες Νέων (/nea). Διαβάζουν ΜΟΝΟ
 * PUBLISHED Post με ελληνική μετάφραση. Το admin CMS είναι στο /cms/posts.
 */

const dateFmt = new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const asStringArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export type PublicPostCard = {
  slug: string
  title: string
  excerpt: string
  image: string | null
  date: string
  dateIso: string
  category: string | null
  author: string | null
}

export type PublicPostDetail = PublicPostCard & {
  body: string
  otherImages: string[]
  seoTitle: string | null
  seoDescription: string | null
}

function el(translations: { locale: string; title: string; excerpt: string | null; body: string; seoTitle: string | null; seoDescription: string | null }[]) {
  return translations.find(t => t.locale === 'el') ?? translations[0] ?? null
}

export async function listPublishedPosts(limit = 30): Promise<PublicPostCard[]> {
  const rows = await prisma.post.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    include: {
      author: { select: { name: true } },
      category: { include: { translations: true } },
      translations: true,
    },
  })
  const out: PublicPostCard[] = []
  for (const p of rows) {
    const t = el(p.translations)
    if (!t) continue
    const when = p.publishedAt ?? p.createdAt
    out.push({
      slug: p.slug,
      title: t.title,
      excerpt: t.excerpt ?? '',
      image: p.featuredImage,
      date: dateFmt.format(when),
      dateIso: when.toISOString(),
      category: p.category?.translations.find(c => c.locale === 'el')?.name ?? null,
      author: p.author?.name ?? null,
    })
  }
  return out
}

export async function getPublishedPostBySlug(slug: string): Promise<PublicPostDetail | null> {
  const p = await prisma.post.findUnique({
    where: { slug },
    include: {
      author: { select: { name: true } },
      category: { include: { translations: true } },
      translations: true,
    },
  })
  if (!p || p.status !== 'PUBLISHED') return null
  const t = el(p.translations)
  if (!t) return null
  const when = p.publishedAt ?? p.createdAt
  return {
    slug: p.slug,
    title: t.title,
    excerpt: t.excerpt ?? '',
    image: p.featuredImage,
    date: dateFmt.format(when),
    dateIso: when.toISOString(),
    category: p.category?.translations.find(c => c.locale === 'el')?.name ?? null,
    author: p.author?.name ?? null,
    body: t.body,
    otherImages: asStringArray(p.otherImages),
    seoTitle: t.seoTitle,
    seoDescription: t.seoDescription,
  }
}
