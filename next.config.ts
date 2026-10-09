import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import { legacyRedirects } from './src/lib/seo-content/legacy-redirects'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  output: 'standalone',
  // pdfjs (ανάγνωση PDF προσκλήσεων στον server) φορτώνεται ως εξωτερικό πακέτο — όχι μέσα στο bundle.
  serverExternalPackages: ['pdfjs-dist'],
  // Version skew: μετά από νέο deploy, ανοιχτές σελίδες της παλιάς έκδοσης κάνουν αθόρυβα πλήρη επαναφόρτωση
  // αντί για σφάλμα σε φόρμες (Server Actions). Παράγεται μία φορά στο build (standalone → «παγώνει» στο image).
  deploymentId: process.env.NODE_ENV === 'production' ? (process.env.NEXT_DEPLOYMENT_ID || process.env.SOURCE_COMMIT || `b${Date.now().toString(36)}`) : undefined,
  // Φωτογραφίες του site (Bunny CDN, χωρίς Optimizer): σωστό μέγεθος ανά συσκευή μέσω του /_next/image (WebP/AVIF + cache 30 ημερών).
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'damask-1.b-cdn.net' }],
    // Μόνο WebP (όλοι οι browsers): μία μορφή ανά URL → ασφαλές cache στο Cloudflare χωρίς «Vary: Accept».
    formats: ['image/webp'],
    qualities: [72],
    deviceSizes: [480, 768, 1080, 1440, 1920],
    imageSizes: [128, 256, 384],
    minimumCacheTTL: 2_592_000,
  },
  // 301 από τα URL του παλιού WordPress (wwa-espa.com) — κρατά τις θέσεις στο Google μετά την αντικατάσταση.
  // Headers ασφαλείας (Best Practices / εμπιστοσύνη): HSTS, MIME sniffing, referrer, iframe, δικαιώματα browser.
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), interest-cohort=(), microphone=(self)' },
      ],
    }]
  },
  async redirects() {
    return legacyRedirects()
  },
  experimental: {
    serverActions: {
      // Import Engine (spec §11α): το Βήμα 5 στέλνει ΟΛΕΣ τις mapped γραμμές σε ένα
      // executeImport() call (ο ίδιος server action αποφασίζει sync/pg-boss εσωτερικά —
      // βλ. src/app/(app)/import/actions.ts). Το validateImportChunk στέλνει chunks
      // των 1000 γραμμών που μένουν πολύ κάτω από το default 1MB· αυτό το όριο
      // υπάρχει σαν ασφάλεια για μεγάλα φύλλα (έως το όριο αρχείου 10MB — spec).
      // Καλύπτει επίσης τα portal document uploads (C2d): αρχείο έως ~8MB → base64
      // (~1.37×) ≈ 11MB body, άνετα κάτω από το 12mb όριο.
      bodySizeLimit: '12mb',
    },
    // Το proxy (src/proxy.ts) κάνει buffer το request body· default 10MB → πάνω
    // από αυτό το body κόβεται και το formData() στο /api/media/upload αποτύγχανε
    // με «Μη έγκυρα δεδομένα φόρμας». Συγχρονισμένο με MEDIA_MAX_BYTES (src/lib/media-limits.ts).
    proxyClientMaxBodySize: '105mb',
    // Build: οι δημόσιες σελίδες γίνονται prerender και διαβάζουν την (κοινή) Postgres. Με 17 workers × pool
    // ξεπερνιόταν το max_connections («too many clients») → λίγοι workers, λίγες σελίδες ταυτόχρονα, retries.
    cpus: 2,
    staticGenerationMaxConcurrency: 4,
    staticGenerationMinPagesPerWorker: 50,
    staticGenerationRetryCount: 2,
  },
}

export default withNextIntl(nextConfig)
