/* eslint-disable @next/next/no-img-element -- λογότυπο/φωτογραφία από το CDN */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LuInfo, LuLogOut } from 'react-icons/lu'
import { auth, signOut } from '@/auth'
import { getContactPortalDashboard } from '@/lib/pm/portal-contact'
import { PortalPrograms } from './_components/portal-programs'
import { AskThanosButton } from './_components/ask-thanos'
import { ThanosWidget } from '@/components/thanos/thanos-widget'
import { wwaLogoDark, wwaPhoto } from '../(public)/_wwa/assets'
import './portal.css'

export const metadata = { title: 'Τα έργα μου — World Wide Associates', robots: { index: false, follow: false } }

/** Portal πελάτη — ίδια αισθητική με το δημόσιο site (portal.css, scoped .wwa-portal). */
export default async function PortalPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  // ?preview=<contactId>: χρήστης της εφαρμογής βλέπει το portal όπως η επαφή (μόνο ανάγνωση).
  const { preview } = await searchParams
  const dash = await getContactPortalDashboard(preview || undefined)
  const firstName = dash.ok ? dash.contactName.split(' ')[0] : session.user.name?.split(' ')[0]

  return (
    <div className="wwa-portal" lang="el">
      <header className="p-top">
        <div className="p-wrap">
          <Link href="/" aria-label="World Wide Associates — αρχική"><img src={wwaLogoDark} alt="World Wide Associates" /></Link>
          <span className="p-user">{session.user.name}</span>
          {dash.ok && <AskThanosButton className="p-btn p-thanos-top" label="Thanos" />}
          <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }} className="p-signout">
            <button type="submit" className="p-btn p-btn-outline"><LuLogOut aria-hidden /> Αποσύνδεση</button>
          </form>
        </div>
      </header>

      <section className="p-banner">
        <img src={wwaPhoto('consulting')} alt="" />
        <div className="p-wrap">
          <div className="p-eyebrow">{dash.ok ? dash.companyName : 'World Wide Associates'}</div>
          <h1>Καλώς ήρθατε{firstName ? `, ${firstName}` : ''}</h1>
          <p>Εδώ βλέπετε πού βρίσκεται κάθε έργο σας, τι χρειαζόμαστε από εσάς και τι ακολουθεί.</p>
          {dash.ok && (
            <div className="p-banner-actions">
              <AskThanosButton className="p-btn p-btn-cyan" label="Ρωτήστε τον Thanos" />
              <span>Ο ψηφιακός βοηθός σας — απαντά με κείμενο ή φωνή για τα έργα σας, τις δαπάνες και τα δικαιολογητικά.</span>
            </div>
          )}
        </div>
        <span className="p-rule" aria-hidden />
      </section>

      <main>
        <div className="p-wrap p-stack">
          {dash.ok && dash.preview && (
            <div className="p-alert info" role="status"><LuInfo aria-hidden /><span><b>Προεπισκόπηση:</b> έτσι βλέπει το portal η επαφή <b>{dash.contactName}</b>. Το ανέβασμα είναι απενεργοποιημένο και ο Thanos απαντά εδώ με τα δικά σας δικαιώματα (όχι του πελάτη).</span></div>
          )}
          {!dash.ok ? (
            <div className="p-empty">
              <p>{preview ? 'Η επαφή δεν βρέθηκε ή δεν έχετε δικαίωμα προβολής.' : 'Δεν υπάρχουν διαθέσιμα έργα για τον λογαριασμό σας αυτή τη στιγμή. Επικοινωνήστε με τον σύμβουλό σας στο 210 721 8758.'}</p>
            </div>
          ) : (
            <PortalPrograms applications={dash.applications} preview={dash.preview} />
          )}
        </div>
      </main>

      <footer className="p-foot">
        <div className="p-wrap">
          <span>World Wide Associates Ε.Ε. · Αλεξανδρουπόλεως 25, Αθήνα 115 27</span>
          <span><a href="tel:+302107218758">210 721 8758</a> · <a href="mailto:info@wwa-espa.com">info@wwa-espa.com</a></span>
        </div>
      </footer>

      {dash.ok && <ThanosWidget firstName={dash.preview ? session.user.name?.split(' ')[0] : firstName} />}
    </div>
  )
}
