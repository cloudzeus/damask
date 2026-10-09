/* eslint-disable @next/next/no-img-element -- λογότυπο από το CDN */
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LuLogOut } from 'react-icons/lu'
import { auth, signOut } from '@/auth'
import { ThanosWidget } from '@/components/thanos/thanos-widget'
import { wwaLogoDark } from '../../(public)/_wwa/assets'
import { AskThanosButton } from '../_components/ask-thanos'
import { PortalNav } from '../_components/portal-nav'
import '../portal.css'

export const metadata = { title: 'Portal — World Wide Associates', robots: { index: false, follow: false } }

/** Κέλυφος του portal πελάτη: κεφαλίδα + μενού + footer + Thanos (ίδια αισθητική με το δημόσιο site). */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return (
    <div className="wwa-portal" lang="el">
      <header className="p-top">
        <div className="p-wrap">
          <Link href="/portal" aria-label="Portal — επισκόπηση"><img src={wwaLogoDark} alt="World Wide Associates" /></Link>
          <span className="p-user">{session.user.name}</span>
          <AskThanosButton className="p-btn p-thanos-top" label="Thanos" />
          <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }} className="p-signout">
            <button type="submit" className="p-btn p-btn-outline"><LuLogOut aria-hidden /> <span className="p-hide-sm">Αποσύνδεση</span></button>
          </form>
        </div>
        <Suspense fallback={null}><PortalNav /></Suspense>
      </header>
      {children}
      <footer className="p-foot">
        <div className="p-wrap">
          <span>World Wide Associates Ε.Ε. · Αλεξανδρουπόλεως 25, Αθήνα 115 27</span>
          <span><a href="tel:+302107218758">210 721 8758</a> · <a href="mailto:info@wwa-espa.com">info@wwa-espa.com</a></span>
        </div>
      </footer>
      <ThanosWidget firstName={session.user.name?.split(' ')[0]} />
    </div>
  )
}
