import type { Metadata } from 'next'
import { Manrope, Comfortaa } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin', 'greek'],
  variable: '--font-sans',
  weight: ['200', '300', '400', '500', '600', '700', '800'],
})
const comfortaa = Comfortaa({
  subsets: ['latin', 'greek'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'DAMASK PIM',
  description: 'Product Information Management — Damask',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el" suppressHydrationWarning>
      <body className={`${manrope.variable} ${comfortaa.variable} font-sans antialiased`}>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <Toaster />
      </body>
    </html>
  )
}
