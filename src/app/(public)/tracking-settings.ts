import { unstable_cache } from 'next/cache'
import { loadPublicTrackingSettings, PUBLIC_TRACKING_CACHE_TAG, type PublicTrackingSettings } from '@/lib/settings'

/**
 * Cached read για το (public) layout — evita ένα DB roundtrip σε ΚΑΘΕ δημόσια
 * σελίδα. revalidate 5 λεπτά + on-demand revalidateTag(PUBLIC_TRACKING_CACHE_TAG)
 * από τα saveGoogleTagsSettings/saveFacebookSettings/saveCompanyProfile actions
 * (src/app/(app)/settings/actions.ts) όταν αποθηκεύονται νέες τιμές.
 */
export const getCachedPublicTrackingSettings: () => Promise<PublicTrackingSettings> = unstable_cache(
  loadPublicTrackingSettings,
  ['public-tracking-settings'],
  { tags: [PUBLIC_TRACKING_CACHE_TAG], revalidate: 300 },
)
