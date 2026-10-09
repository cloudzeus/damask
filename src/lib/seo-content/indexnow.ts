import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getSetting, setSetting } from '@/lib/settings'
import { SITE_INDEXABLE, SITE_URL, absoluteUrl } from '@/lib/site-url'

/**
 * (Plain module.) IndexNow: άμεση ειδοποίηση Bing/Yandex/Seznam για νέα ή αλλαγμένα URLs
 * (το Bing τροφοδοτεί ChatGPT search/Copilot → GEO). Μόνο στην παραγωγή (SITE_PUBLIC=1).
 * Το κλειδί προκύπτει σταθερά από το AUTH_SECRET και σερβίρεται στο /indexnow.txt (keyLocation).
 */
export function indexNowKey(): string {
  return createHash('sha256').update(`indexnow:${process.env.AUTH_SECRET ?? 'wwa'}`).digest('hex').slice(0, 32)
}

export async function pingIndexNow(paths: string[]): Promise<boolean> {
  const urlList = [...new Set(paths)].map(absoluteUrl).slice(0, 10_000)
  if (!SITE_INDEXABLE || !urlList.length) return false
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: new URL(SITE_URL).host, key: indexNowKey(), keyLocation: absoluteUrl('/indexnow.txt'), urlList }),
      signal: AbortSignal.timeout(15_000),
    })
    return res.ok || res.status === 202
  } catch {
    return false
  }
}

const LAST = 'seo.indexnow.lastPing'

/** Ό,τι άλλαξε από το προηγούμενο ping (άρθρα, προγράμματα) + οι κόμβοι που εξαρτώνται από αυτά. Καλείται καθημερινά. */
export async function pingChangedSince(): Promise<number> {
  const last = new Date((await getSetting<string>(LAST)) ?? Date.now() - 7 * 86_400_000)
  const [posts, programs] = await Promise.all([
    prisma.post.findMany({ where: { status: 'PUBLISHED', updatedAt: { gt: last } }, select: { slug: true } }),
    prisma.program.findMany({ where: { status: 'ACTIVE', publicSlug: { not: null }, updatedAt: { gt: last } }, select: { publicSlug: true } }),
  ])
  const paths = [
    ...posts.map(p => `/nea/${p.slug}`),
    ...programs.map(p => `/programmata/${p.publicSlug}`),
    ...(posts.length ? ['/nea'] : []),
    ...(programs.length ? ['/programmata', '/prothesmies-espa', '/espa', '/'] : []),
  ]
  if (paths.length && (await pingIndexNow(paths))) await setSetting(LAST, new Date().toISOString())
  return paths.length
}
