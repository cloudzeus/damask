import { unstable_cache } from 'next/cache'
import { loadConsentConfig, PUBLIC_CONSENT_CACHE_TAG } from '@/lib/settings'
import type { ConsentModalConfig } from '@/lib/consent'

/**
 * Cached read για το (public) layout (consent banner + gating gtag/GTM/Pixel) —
 * ίδιο idiom με το tracking-settings.ts. revalidate 5 λεπτά + on-demand
 * revalidateTag(PUBLIC_CONSENT_CACHE_TAG) από το saveConsentModalConfig action
 * (src/app/(app)/cms/legal/actions.ts) όταν αποθηκεύονται νέες τιμές.
 */
export const getCachedConsentConfig: () => Promise<ConsentModalConfig> = unstable_cache(
  loadConsentConfig,
  ['public-consent-config'],
  { tags: [PUBLIC_CONSENT_CACHE_TAG], revalidate: 300 },
)
