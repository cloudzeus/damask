'use client'

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { ConsentBanner } from '@/components/consent/consent-banner'
import type { ConsentModalConfig } from '@/lib/consent'

type Consent = { analytics: boolean; marketing: boolean; policyVersion: string } | null
type Tracking = { gtagId?: string | null; gtmId?: string | null; facebookPixelId?: string | null }

/**
 * Consent banner + gtag/GTM/Pixel ΜΕ ΑΠΟΦΑΣΗ ΣΤΟΝ BROWSER: το layout δεν διαβάζει cookies, άρα οι δημόσιες
 * σελίδες σερβίρονται στατικές/cached (γρήγορο TTFB/LCP). Τα scripts φορτώνουν μόνο μετά από συγκατάθεση
 * με την τρέχουσα policyVersion — ίδιοι κανόνες με το παλιό SSR gating.
 */
export function ConsentGate({ config, tracking }: { config: ConsentModalConfig; tracking: Tracking }) {
  const [state, setState] = useState<{ loaded: boolean; consent: Consent }>({ loaded: false, consent: null })

  useEffect(() => {
    let alive = true
    fetch('/api/consent', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((c: Consent) => { if (alive) setState({ loaded: true, consent: c }) })
    return () => { alive = false }
  }, [])

  if (!state.loaded) return null
  const current = state.consent?.policyVersion === config.policyVersion ? state.consent : null
  const analytics = current?.analytics === true
  const marketing = current?.marketing === true
  const locale: 'el' | 'en' = typeof document !== 'undefined' && /(?:^|;\s*)locale=en/.test(document.cookie) ? 'en' : 'el'
  const { gtagId, gtmId, facebookPixelId } = tracking
  // Google Consent Mode v2 (basic): οι ετικέτες φορτώνουν ΜΟΝΟ μετά τη συγκατάθεση και δηλώνουν ρητά
  // τι επιτράπηκε — default «denied» για όλα, μετά update με τις επιλογές του επισκέπτη (απαίτηση Google για ΕΟΧ).
  const g = (v: boolean) => (v ? 'granted' : 'denied')
  const consentJs = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}`
    + `gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',functionality_storage:'granted',security_storage:'granted',wait_for_update:500});`
    + `gtag('consent','update',{analytics_storage:'${g(analytics)}',ad_storage:'${g(marketing)}',ad_user_data:'${g(marketing)}',ad_personalization:'${g(marketing)}'});`

  return (
    <>
      {gtmId && analytics && (
        <Script id="gtm-init" strategy="afterInteractive">
          {`${consentJs}(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`}
        </Script>
      )}
      {gtagId && analytics && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gtagId}`} strategy="afterInteractive" />
          <Script id="gtag-init" strategy="afterInteractive">
            {`${consentJs}gtag('js', new Date());gtag('config', '${gtagId}');`}
          </Script>
        </>
      )}
      {facebookPixelId && marketing && (
        <Script id="fb-pixel-init" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init', '${facebookPixelId}');fbq('track', 'PageView');`}
        </Script>
      )}
      <ConsentBanner config={config} initialShow={!current} locale={locale}
        onSaved={c => setState({ loaded: true, consent: { ...c, policyVersion: config.policyVersion } })} />
    </>
  )
}
