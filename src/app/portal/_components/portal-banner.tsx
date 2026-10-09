/* eslint-disable @next/next/no-img-element -- φωτογραφία από το CDN */
import type { ReactNode } from 'react'
import { LuInfo } from 'react-icons/lu'
import { wwaPhoto, type WwaPhoto } from '../../(public)/_wwa/assets'
import { AskThanosButton } from './ask-thanos'

/** Banner σελίδας του portal (ίδιο ύφος με το sub-banner του site) + σημείωση προεπισκόπησης. */
export function PortalBanner({ eyebrow, title, lead, photo = 'consulting', thanos = false, children }: {
  eyebrow?: string | null; title: string; lead?: ReactNode; photo?: WwaPhoto; thanos?: boolean; children?: ReactNode
}) {
  return (
    <section className="p-banner">
      <img src={wwaPhoto(photo)} alt="" />
      <div className="p-wrap">
        {eyebrow && <div className="p-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
        {thanos && (
          <div className="p-banner-actions">
            <AskThanosButton className="p-btn p-btn-cyan" label="Ρωτήστε τον Thanos" />
            <span>Ο ψηφιακός βοηθός σας — απαντά με κείμενο ή φωνή για τα έργα σας, τις δαπάνες και τα δικαιολογητικά.</span>
          </div>
        )}
        {children}
      </div>
      <span className="p-rule" aria-hidden />
    </section>
  )
}

export function PreviewNote({ name }: { name: string }) {
  return (
    <div className="p-alert info" role="status"><LuInfo aria-hidden /><span><b>Προεπισκόπηση:</b> έτσι βλέπει το portal η επαφή <b>{name}</b>. Οι αλλαγές είναι απενεργοποιημένες και ο Thanos απαντά με τα δικά σας δικαιώματα.</span></div>
  )
}

export const withPreview = (href: string, preview?: string) => (preview ? `${href}${href.includes('?') ? '&' : '?'}preview=${encodeURIComponent(preview)}` : href)
