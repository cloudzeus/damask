'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Languages, Save, Eye, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ConsentBanner } from '@/components/consent/consent-banner'
import type { ConsentModalConfig } from '@/lib/consent'
import { saveConsentModalConfig, translateConsentTextDraft, type ConsentModalFormValues } from './actions'

export function ConsentModalTab({ initial }: { initial: ConsentModalConfig }) {
  const [values, setValues] = useState<ConsentModalFormValues>(initial)
  const [locale, setLocale] = useState<'el' | 'en'>('el')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [previewOpen, setPreviewOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [translating, startTranslate] = useTransition()

  function set<K extends keyof ConsentModalFormValues>(key: K, value: ConsentModalFormValues[K]) {
    setValues(v => ({ ...v, [key]: value }))
  }

  function handleTranslate() {
    if (values.titleEl.trim() === '' && values.textEl.trim() === '') {
      toast.error('Συμπλήρωσε πρώτα τίτλο ή κείμενο (Ελληνικά).')
      return
    }
    startTranslate(async () => {
      const res = await translateConsentTextDraft(values.titleEl, values.textEl)
      if (res.ok) {
        setValues(v => ({ ...v, titleEn: res.titleEn || v.titleEn, textEn: res.textEn || v.textEn }))
        setLocale('en')
        toast.success('Μεταφράστηκε στα Αγγλικά — έλεγξε το κείμενο πριν αποθηκεύσεις.')
      } else {
        toast.error(res.message)
      }
    })
  }

  function handleSave() {
    startTransition(async () => {
      const res = await saveConsentModalConfig(values)
      if (res.ok) {
        toast.success(res.message)
        setFieldErrors({})
      } else {
        toast.error(res.message)
        setFieldErrors(res.fieldErrors ?? {})
      }
    })
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
      <div className="glass p-4">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <button type="button" className={cn('pill', locale === 'el' && 'on')} onClick={() => setLocale('el')}>
            Ελληνικά
          </button>
          <button type="button" className={cn('pill', locale === 'en' && 'on')} onClick={() => setLocale('en')}>
            English
          </button>
          <div className="flex-1" />
          <Button type="button" variant="outline" size="sm" disabled={translating} onClick={handleTranslate}>
            <Languages className="size-3.5" strokeWidth={1.8} aria-hidden />
            {translating ? 'Μετάφραση…' : 'Μετάφραση'}
          </Button>
        </div>

        <div hidden={locale !== 'el'}>
          <div className="field">
            <label htmlFor="consent-title-el">Τίτλος banner (Ελληνικά)*</label>
            <div className="inwrap">
              <input id="consent-title-el" value={values.titleEl} onChange={e => set('titleEl', e.target.value)} required style={{ paddingLeft: 16 }} />
            </div>
            {fieldErrors.titleEl && <div className="error">{fieldErrors.titleEl}</div>}
          </div>
          <div className="field">
            <label htmlFor="consent-text-el">Κείμενο banner (Ελληνικά)*</label>
            <textarea id="consent-text-el" className="cms-textarea" rows={4} value={values.textEl} onChange={e => set('textEl', e.target.value)} required />
            {fieldErrors.textEl && <div className="error">{fieldErrors.textEl}</div>}
          </div>
        </div>

        <div hidden={locale !== 'en'}>
          <div className="field">
            <label htmlFor="consent-title-en">Banner title (English)</label>
            <div className="inwrap">
              <input id="consent-title-en" value={values.titleEn} onChange={e => set('titleEn', e.target.value)} style={{ paddingLeft: 16 }} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="consent-text-en">Banner text (English)</label>
            <textarea id="consent-text-en" className="cms-textarea" rows={4} value={values.textEn} onChange={e => set('textEn', e.target.value)} />
          </div>
        </div>

        <div className="dotted-leader mt-4 mb-3 text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
          Κείμενα κουμπιών
        </div>
        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-3">
          <div className="field">
            <label htmlFor="consent-accept-all">Αποδοχή όλων</label>
            <div className="inwrap">
              <input id="consent-accept-all" value={values.acceptAllLabel} onChange={e => set('acceptAllLabel', e.target.value)} required style={{ paddingLeft: 16 }} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="consent-necessary-only">Μόνο απαραίτητα</label>
            <div className="inwrap">
              <input id="consent-necessary-only" value={values.necessaryOnlyLabel} onChange={e => set('necessaryOnlyLabel', e.target.value)} required style={{ paddingLeft: 16 }} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="consent-customize">Προσαρμογή</label>
            <div className="inwrap">
              <input id="consent-customize" value={values.customizeLabel} onChange={e => set('customizeLabel', e.target.value)} required style={{ paddingLeft: 16 }} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="glass p-4">
          <div className="mb-1.5 text-[12px] font-bold">Κατηγορίες</div>
          <div className="flex flex-col gap-2.5">
            <div className="consent-category">
              <div>
                <b>Απαραίτητα</b>
                <small>Πάντα ενεργά — δεν αφαιρούνται.</small>
              </div>
              <Switch checked disabled aria-label="Απαραίτητα (πάντα ενεργά)" />
            </div>
            <div className="consent-category">
              <div>
                <b>Στατιστικά / Analytics</b>
                <small>Διαθέσιμη επιλογή στον επισκέπτη.</small>
              </div>
              <Switch checked={values.analyticsEnabled} onCheckedChange={c => set('analyticsEnabled', c)} aria-label="Στατιστικά διαθέσιμα" />
            </div>
            <div className="consent-category">
              <div>
                <b>Marketing</b>
                <small>Διαθέσιμη επιλογή στον επισκέπτη.</small>
              </div>
              <Switch checked={values.marketingEnabled} onCheckedChange={c => set('marketingEnabled', c)} aria-label="Marketing διαθέσιμο" />
            </div>
          </div>
        </div>

        <div className="glass p-4">
          <div className="field mb-3">
            <label>Θέση banner</label>
            <div className="role-pick" style={{ marginBottom: 0, gridTemplateColumns: '1fr 1fr' }}>
              <button
                type="button"
                className={cn('opt', values.position === 'bar' && 'on')}
                aria-pressed={values.position === 'bar'}
                onClick={() => set('position', 'bar')}
              >
                <b>Κάτω μπάρα</b>
                <small>Λεπτή γραμμή στο κάτω μέρος.</small>
              </button>
              <button
                type="button"
                className={cn('opt', values.position === 'modal' && 'on')}
                aria-pressed={values.position === 'modal'}
                onClick={() => set('position', 'modal')}
              >
                <b>Κεντρικό modal</b>
                <small>Παράθυρο στο κέντρο με σκίαση.</small>
              </button>
            </div>
          </div>

          <div className="field">
            <label htmlFor="consent-policy-version">Έκδοση πολιτικής</label>
            <div className="inwrap">
              <input id="consent-policy-version" value={values.policyVersion} onChange={e => set('policyVersion', e.target.value)} required style={{ paddingLeft: 16 }} />
            </div>
            {fieldErrors.policyVersion ? <div className="error">{fieldErrors.policyVersion}</div> : <div className="help">Αλλαγή → το banner ξαναεμφανίζεται σε όλους.</div>}
          </div>

          <div className="field mb-0">
            <label htmlFor="consent-cookies-slug">Σελίδα πολιτικής cookies (slug)</label>
            <div className="inwrap">
              <input id="consent-cookies-slug" value={values.cookiesPageSlug} onChange={e => set('cookiesPageSlug', e.target.value)} required style={{ paddingLeft: 16 }} />
            </div>
            {fieldErrors.cookiesPageSlug ? <div className="error">{fieldErrors.cookiesPageSlug}</div> : <div className="help">Link μέσα στο banner: /legal/{values.cookiesPageSlug || '…'}</div>}
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => setPreviewOpen(true)}>
            <Eye className="size-3.5" strokeWidth={1.8} aria-hidden /> Προεπισκόπηση
          </Button>
          <Button type="button" className="flex-1" disabled={pending} onClick={handleSave}>
            <Save className="size-3.5" strokeWidth={1.8} aria-hidden /> {pending ? 'Αποθήκευση…' : 'Αποθήκευση'}
          </Button>
        </div>
      </div>

      {previewOpen && (
        <>
          <button
            type="button"
            className="btn-pill btn-navy"
            style={{ position: 'fixed', top: 18, right: 18, zIndex: 61 }}
            onClick={() => setPreviewOpen(false)}
          >
            <X className="size-3.5" strokeWidth={2} aria-hidden /> Κλείσιμο προεπισκόπησης
          </button>
          <ConsentBanner config={values} initialShow locale={locale} preview />
        </>
      )}
    </div>
  )
}
