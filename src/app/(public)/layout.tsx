import type { Metadata } from 'next'
import { getCachedPublicTrackingSettings } from './tracking-settings'
import { getCachedConsentConfig } from './consent-settings'
import { SiteHeader } from './_components/site-header'
import { WwaFooter } from './_components/wwa-footer'
import { WwaMotion } from './_components/wwa-motion'
import { EligibilityModal } from './_components/eligibility-modal'
import { ConsentGate } from './_components/consent-gate'
import { JsonLd, organizationJsonLd } from './_components/json-ld'

// WWA public design system — φορτώνεται ΜΟΝΟ στο (public) bundle, οπότε δεν
// επηρεάζει το (app)/admin/login/portal (που κρατούν το root globals.css).
import './_wwa/tokens.css'
import './_wwa/components.css'
import './_wwa/site.css'

/** Google Search Console site-verification meta tag — Next Metadata API κάνει το σωστό <meta> tag. */
export async function generateMetadata(): Promise<Metadata> {
  const { siteVerification } = await getCachedPublicTrackingSettings()
  return siteVerification ? { verification: { google: siteVerification } } : {}
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // ΧΩΡΙΣ cookies(): η συγκατάθεση αποφασίζεται στον browser (ConsentGate) ώστε οι σελίδες να είναι cacheable.
  const [{ gtagId, gtmId, facebookPixelId }, consentConfig] = await Promise.all([getCachedPublicTrackingSettings(), getCachedConsentConfig()])
  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      <SiteHeader />
      <main>{children}</main>
      <WwaFooter />
      <WwaMotion />
      <EligibilityModal />
      <ConsentGate config={consentConfig} tracking={{ gtagId, gtmId, facebookPixelId }} />
    </>
  )
}
