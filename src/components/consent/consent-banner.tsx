'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import type { ConsentModalConfig } from '@/lib/consent'

type Category = {
  key: 'necessary' | 'analytics' | 'marketing'
  label: string
  desc: string
  checked: boolean
  locked: boolean
  onChange?: (checked: boolean) => void
}

/**
 * Cookie consent banner — χρησιμοποιείται ΚΑΙ live στο (public) layout ΚΑΙ ως
 * ζωντανή προεπισκόπηση στο tab «Consent Modal» (/cms/legal, prop preview=true:
 * τα κουμπιά δείχνουν toast αντί να καλούν το πραγματικό /api/consent).
 */
export function ConsentBanner({
  config, initialShow, locale, preview = false,
}: {
  config: ConsentModalConfig
  initialShow: boolean
  locale: 'el' | 'en'
  preview?: boolean
}) {
  const router = useRouter()
  const [show, setShow] = useState(initialShow)
  const [expanded, setExpanded] = useState(false)
  const [analytics, setAnalytics] = useState(config.analyticsEnabled)
  const [marketing, setMarketing] = useState(config.marketingEnabled)
  const [submitting, setSubmitting] = useState(false)

  if (!show) return null

  const title = locale === 'en' && config.titleEn.trim() !== '' ? config.titleEn : config.titleEl
  const text = locale === 'en' && config.textEn.trim() !== '' ? config.textEn : config.textEl
  const cookiesHref = `/legal/${config.cookiesPageSlug}`

  const categories: Category[] = [
    { key: 'necessary', label: 'Απαραίτητα', desc: 'Πάντα ενεργά — απαιτούνται για τη λειτουργία του ιστότοπου.', checked: true, locked: true },
    ...(config.analyticsEnabled
      ? [{ key: 'analytics' as const, label: 'Στατιστικά', desc: 'Μας βοηθούν να καταλάβουμε πώς χρησιμοποιείται ο ιστότοπος.', checked: analytics, locked: false, onChange: setAnalytics }]
      : []),
    ...(config.marketingEnabled
      ? [{ key: 'marketing' as const, label: 'Marketing', desc: 'Εξατομικευμένη διαφήμιση σε τρίτες πλατφόρμες.', checked: marketing, locked: false, onChange: setMarketing }]
      : []),
  ]

  async function submit(choices: { analytics: boolean; marketing: boolean }) {
    if (preview) {
      toast.info('Προεπισκόπηση — δεν καταγράφεται πραγματική συγκατάθεση.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(choices),
      })
      if (res.ok) {
        setShow(false)
        router.refresh()
      } else {
        toast.error('Η καταγραφή της συγκατάθεσης απέτυχε — δοκίμασε ξανά.')
      }
    } catch {
      toast.error('Η καταγραφή της συγκατάθεσης απέτυχε — δοκίμασε ξανά.')
    } finally {
      setSubmitting(false)
    }
  }

  const body = (
    <div
      className={cn('glass', config.position === 'bar' ? 'consent-bar' : 'consent-modal', 'stagger')}
      role={config.position === 'modal' ? 'dialog' : 'region'}
      aria-modal={config.position === 'modal' ? true : undefined}
      aria-label={title}
    >
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[220px] flex-1">
          <h2 className="mb-1 text-[14.5px] font-bold">{title}</h2>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            {text}{' '}
            <Link href={cookiesHref} className="font-semibold underline" target="_blank" rel="noopener noreferrer">
              {locale === 'en' ? 'Cookie Policy' : 'Πολιτική Cookies'}
            </Link>
          </p>

          {expanded && (
            <div className="consent-categories">
              {categories.map(cat => (
                <div key={cat.key} className="consent-category">
                  <div>
                    <b>{cat.label}</b>
                    <small>{cat.desc}</small>
                  </div>
                  <Switch
                    checked={cat.checked}
                    disabled={cat.locked}
                    onCheckedChange={cat.onChange}
                    aria-label={cat.label}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="consent-actions">
          {expanded ? (
            <button
              type="button"
              className="btn-pill btn-navy"
              disabled={submitting}
              onClick={() => submit({ analytics, marketing })}
            >
              {submitting ? 'Αποθήκευση…' : 'Αποθήκευση επιλογών'}
            </button>
          ) : (
            <>
              <button type="button" className="btn-pill btn-glass" onClick={() => setExpanded(true)}>
                {config.customizeLabel}
              </button>
              <button
                type="button"
                className="btn-pill btn-glass"
                disabled={submitting}
                onClick={() => submit({ analytics: false, marketing: false })}
              >
                {config.necessaryOnlyLabel}
              </button>
              <button
                type="button"
                className="btn-pill btn-navy"
                disabled={submitting}
                onClick={() => submit({ analytics: config.analyticsEnabled, marketing: config.marketingEnabled })}
              >
                {config.acceptAllLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )

  if (config.position === 'modal') {
    return <div className="consent-modal-backdrop">{body}</div>
  }
  return body
}
