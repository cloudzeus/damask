import type { Metadata } from 'next'
import { Roboto, Roboto_Condensed } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

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
  title: 'World Wide Associates',
  description: 'CRM Διαχείρισης Ευρωπαϊκών Προγραμμάτων',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el" suppressHydrationWarning>
      <body className={`${roboto.variable} ${robotoCondensed.variable} font-sans antialiased`}>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <Toaster />
      </body>
    </html>
  )
}
