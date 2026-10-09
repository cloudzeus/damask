import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import { legacyRedirects } from './src/lib/seo-content/legacy-redirects'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  output: 'standalone',
  // 301 από τα URL του παλιού WordPress (wwa-espa.com) — κρατά τις θέσεις στο Google μετά την αντικατάσταση.
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
  },
}

export default withNextIntl(nextConfig)
