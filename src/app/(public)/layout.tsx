import type { Metadata } from 'next'
import Script from 'next/script'
import { cookies } from 'next/headers'
import { getCachedPublicTrackingSettings } from './tracking-settings'
import { getCachedConsentConfig } from './consent-settings'
import { SiteFooter } from './site-footer'
import { CONSENT_COOKIE_NAME, parseConsentCookie, shouldShowBanner } from '@/lib/consent'
import { ConsentBanner } from '@/components/consent/consent-banner'

/** Google Search Console site-verification meta tag — Next Metadata API κάνει το σωστό <meta> tag. */
export async function generateMetadata(): Promise<Metadata> {
  const { siteVerification } = await getCachedPublicTrackingSettings()
  return siteVerification ? { verification: { google: siteVerification } } : {}
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [{ gtagId, gtmId, facebookPixelId }, consentConfig, cookieStore] = await Promise.all([
    getCachedPublicTrackingSettings(),
    getCachedConsentConfig(),
    cookies(),
  ])

  // SSR gating: gtag/GTM/Pixel scripts φορτώνουν ΜΟΝΟ αν το consent cookie έχει
  // analytics/marketing == true ΚΑΙ η policyVersion ταιριάζει με την τρέχουσα
  // (αλλιώς είναι σαν να μην υπάρχει συγκατάθεση — shouldShowBanner θα το πιάσει
  // κι αυτό, το banner θα ξαναφανεί). Καμία εξάρτηση σε client JS — το πρώτο
  // server render είναι ήδη σωστό, δεν χρειάζεται useEffect/flash.
  const consentRaw = cookieStore.get(CONSENT_COOKIE_NAME)?.value ?? null
  const parsedConsent = parseConsentCookie(consentRaw)
  const consentIsCurrent = parsedConsent?.policyVersion === consentConfig.policyVersion
  const hasAnalyticsConsent = consentIsCurrent && parsedConsent?.analytics === true
  const hasMarketingConsent = consentIsCurrent && parsedConsent?.marketing === true
  const showBanner = shouldShowBanner(consentRaw, consentConfig)
  const bannerLocale = cookieStore.get('locale')?.value === 'en' ? 'en' : 'el'

  return (
    // app-canvas--deep: αρχικά gradient stops του mockup (22%/52%) — το hero
    // ακουμπά ανοιχτό κείμενο απευθείας στον καμβά και θέλει βαθύτερη σκοτεινή ζώνη.
    <div className="app-canvas app-canvas--deep">
      {/* Google Tag Manager — τα gtagId/gtmId/pixelId είναι format-validated με regex στο
          settings save action (μόνο [A-Za-z0-9-]), οπότε ασφαλή για inline interpolation.
          Gated πίσω από hasAnalyticsConsent (βλ. σχόλιο παραπάνω). */}
      {gtmId && hasAnalyticsConsent && (
        <Script id="gtm-init" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`}
        </Script>
      )}
      {gtmId && hasAnalyticsConsent && (
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
            title="Google Tag Manager"
          />
        </noscript>
      )}

      {/* Google Analytics (gtag.js) — gated πίσω από hasAnalyticsConsent */}
      {gtagId && hasAnalyticsConsent && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gtagId}`} strategy="afterInteractive" />
          <Script id="gtag-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${gtagId}');`}
          </Script>
        </>
      )}

      {/* Facebook Pixel — gated πίσω από hasMarketingConsent */}
      {facebookPixelId && hasMarketingConsent && (
        <Script id="fb-pixel-init" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init', '${facebookPixelId}');fbq('track', 'PageView');`}
        </Script>
      )}

      {children}

      <SiteFooter />

      <ConsentBanner config={consentConfig} initialShow={showBanner} locale={bannerLocale} />
    </div>
  )
}
