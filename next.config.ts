import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  output: 'standalone',
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
  },
}

export default withNextIntl(nextConfig)
