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
  /** Ημερομηνία τελευταίας ενημέρωσης (SEO: dateModified + «Ενημερώθηκε»). */
  updated: string
  updatedIso: string
  authorBio: string | null
  authorAvatar: string | null
  body: string
  otherImages: string[]
  seoTitle: string | null
  seoDescription: string | null
}

function el(translations: { locale: string; title: string; excerpt: string | null; body: string; seoTitle: string | null; seoDescription: string | null }[]) {
  return translations.find(t => t.locale === 'el') ?? translations[0] ?? null
}

/** Κατηγορία δελτίων/εμφανίσεων Τύπου — εκτός «Νέα» (που κρατά μόνο οδηγούς), στη σελίδα /typos. */
export const PRESS_CATEGORY_SLUG = 'typos'

export async function listPublishedPosts(limit = 30, opts: { press?: boolean } = {}): Promise<PublicPostCard[]> {
  const rows = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      ...(opts.press === true ? { category: { slug: PRESS_CATEGORY_SLUG } } : opts.press === false ? { OR: [{ categoryId: null }, { category: { slug: { not: PRESS_CATEGORY_SLUG } } }] } : {}),
    },
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
      author: { select: { name: true, bio: true, avatarUrl: true } },
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
    updated: dateFmt.format(p.updatedAt > when ? p.updatedAt : when),
    updatedIso: (p.updatedAt > when ? p.updatedAt : when).toISOString(),
    authorBio: p.author?.bio ?? null,
    authorAvatar: p.author?.avatarUrl ?? null,
    body: t.body,
    otherImages: asStringArray(p.otherImages),
    seoTitle: t.seoTitle,
    seoDescription: t.seoDescription,
  }
}
