import { getSetting } from '@/lib/settings'
import { SeoForm } from './seo-form'
import type { SeoDefaultsValues } from './actions'

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

const ROBOTS_VALUES = new Set(['index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow'])
const LOCALE_VALUES = new Set(['el', 'en'])

export async function SeoTab() {
  const seo = (await getSetting<Record<string, unknown>>('seo.defaults')) ?? {}

  const ogImage = seo.ogImage as { assetId?: unknown; url?: unknown } | null | undefined
  const robotsDefault = str(seo.robotsDefault, 'index,follow')
  const defaultLocale = str(seo.defaultLocale, 'el')

  const initial: SeoDefaultsValues = {
    metaTitleEl: str(seo.metaTitleEl),
    metaTitleEn: str(seo.metaTitleEn),
    metaDescriptionEl: str(seo.metaDescriptionEl),
    metaDescriptionEn: str(seo.metaDescriptionEn),
    ogImage: ogImage && typeof ogImage.assetId === 'string' && typeof ogImage.url === 'string'
      ? { assetId: ogImage.assetId, url: ogImage.url }
      : null,
    keywords: str(seo.keywords),
    robotsDefault: ROBOTS_VALUES.has(robotsDefault) ? robotsDefault : 'index,follow',
    socialFacebook: str(seo.socialFacebook),
    socialInstagram: str(seo.socialInstagram),
    socialLinkedin: str(seo.socialLinkedin),
    socialYoutube: str(seo.socialYoutube),
    defaultLocale: LOCALE_VALUES.has(defaultLocale) ? defaultLocale : 'el',
  }

  return <SeoForm initial={initial} />
}
