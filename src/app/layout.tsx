import type { Metadata } from 'next'
import { Roboto, Roboto_Condensed } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'
import { SITE_URL, SITE_NAME, SITE_INDEXABLE } from '@/lib/site-url'

// Roboto (κείμενο) + Roboto Condensed (τίτλοι/headers) — variable fonts, όλα τα
// weights (100–900), με υποστήριξη ελληνικών.
const roboto = Roboto({
  subsets: ['latin', 'greek'],
  variable: '--font-sans',
  display: 'swap',
})
const robotoCondensed = Roboto_Condensed({
  subsets: ['latin', 'greek'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata: Metadata = {
  // Βάση για canonical/OG (παραγωγή: wwa-espa.com). Σε staging (χωρίς SITE_PUBLIC=1) όλα είναι noindex.
  metadataBase: new URL(SITE_URL),
  title: 'World Wide Associates — Σύμβουλοι ΕΣΠΑ & Επιδοτήσεων',
  description: 'Σύμβουλοι ΕΣΠΑ και ευρωπαϊκών προγραμμάτων: δωρεάν έλεγχος επιλεξιμότητας, υποβολή, υλοποίηση και αποπληρωμή επιδοτήσεων για επιχειρήσεις.',
  applicationName: SITE_NAME,
  alternates: { types: { 'application/rss+xml': [{ url: '/rss.xml', title: 'World Wide Associates — Οδηγοί & νέα ΕΣΠΑ' }] } },
  openGraph: { siteName: SITE_NAME, locale: 'el_GR', type: 'website' },
  twitter: { card: 'summary_large_image' },
  ...(SITE_INDEXABLE ? {} : { robots: { index: false, follow: false } }),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el" suppressHydrationWarning>
      <body className={`${roboto.variable} ${robotoCondensed.variable} font-sans antialiased`}>
        {/* Χωρίς NextIntlClientProvider: δεν χρησιμοποιείται από κανένα component και διάβαζε cookies() σε κάθε σελίδα (όλο το site dynamic). */}
        {children}
        <Toaster />
      </body>
    </html>
  )
}
