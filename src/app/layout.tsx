import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import './globals.css'

const inter = Inter({ subsets: ['latin', 'greek'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'DAMASK PIM',
  description: 'Product Information Management — Damask',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
