'use client'

import { useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Languages, Save, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { slugify } from '@/lib/slug'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { createLegalPage, updateLegalPage, translateLegalFieldsToEnglish, type LegalPageFormValues } from './actions'

export function LegalEditor({
  mode, pageId, initialValues,
}: {
  mode: 'create' | 'edit'
  pageId?: string
  initialValues: LegalPageFormValues
}) {
  const router = useRouter()
  const [values, setValues] = useState<LegalPageFormValues>(initialValues)
  const [locale, setLocale] = useState<'el' | 'en'>('el')
  const [slugTouched, setSlugTouched] = useState(mode === 'edit')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const [translating, startTranslate] = useTransition()

  function setEl<K extends keyof LegalPageFormValues['el']>(key: K, value: LegalPageFormValues['el'][K]) {
    setValues(v => {
      const el = { ...v.el, [key]: value }
      const slug = key === 'title' && !slugTouched ? slugify(String(value)) : v.slug
      return { ...v, el, slug }
    })
  }

  function setEn<K extends keyof LegalPageFormValues['en']>(key: K, value: LegalPageFormValues['en'][K]) {
    setValues(v => ({ ...v, en: { ...v.en, [key]: value }, enMachineTranslated: false }))
  }

  function handleSlugChange(next: string) {
    setSlugTouched(true)
    setValues(v => ({ ...v, slug: next }))
  }

  function handleTranslate() {
    if (values.el.title.trim() === '' || values.el.body.trim() === '') {
      toast.error('Συμπλήρωσε πρώτα τίτλο και κείμενο (Ελληνικά).')
      return
    }
    startTranslate(async () => {
      const res = await translateLegalFieldsToEnglish(values.el)
      if (res.ok) {
        setValues(v => ({ ...v, en: res.data, enMachineTranslated: true }))
        setLocale('en')
        toast.success('Μεταφράστηκε στα Αγγλικά — έλεγξε το κείμενο πριν αποθηκεύσεις.')
      } else {
        toast.error(res.message)
      }
    })
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = mode === 'create' ? await createLegalPage(values) : await updateLegalPage(pageId!, values)
      if (res.ok) {
        toast.success(res.message)
        setFieldErrors({})
        if (mode === 'create' && res.id) router.push(`/cms/legal/${res.id}/edit`)
      } else {
        toast.error(res.message)
        setFieldErrors(res.fieldErrors ?? {})
      }
    })
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-4 flex items-end gap-3 pt-1.5">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            CMS <span aria-hidden>›</span> <Link href="/cms/legal" className="hover:text-foreground hover:underline">Νομικά</Link>{' '}
            <span aria-hidden>›</span> <b className="text-foreground">{mode === 'create' ? 'Νέα σελίδα' : 'Επεξεργασία σελίδας'}</b>
          </div>
          <h1 className="text-[22px]">{mode === 'create' ? 'Νέα νομική σελίδα' : (values.el.title || 'Επεξεργασία σελίδας')}</h1>
        </div>
        <div className="flex-1" />
        {mode === 'edit' && values.published && (
          <a href={`/legal/${values.slug}`} target="_blank" rel="noopener noreferrer" className="btn-pill btn-glass h-9 px-4 text-[12.5px]">
            <ExternalLink className="size-3.5" strokeWidth={1.8} aria-hidden /> Προβολή
          </a>
        )}
        <Button type="button" variant="outline" onClick={() => router.push('/cms/legal')}>Πίσω</Button>
        <Button type="submit" form="legal-editor-form" disabled={pending}>
          <Save className="size-3.5" strokeWidth={1.8} aria-hidden /> {pending ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </Button>
      </div>

      <form id="legal-editor-form" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
          <div className="glass p-4">
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <button type="button" className={cn('pill', locale === 'el' && 'on')} onClick={() => setLocale('el')}>
                Ελληνικά
              </button>
              <button type="button" className={cn('pill', locale === 'en' && 'on')} onClick={() => setLocale('en')}>
                English {values.en.title.trim() !== '' && <span className="cnt">{values.enMachineTranslated ? 'AI' : '✓'}</span>}
              </button>
              <div className="flex-1" />
              <Button type="button" variant="outline" size="sm" disabled={translating} onClick={handleTranslate}>
                <Languages className="size-3.5" strokeWidth={1.8} aria-hidden />
                {translating ? 'Μετάφραση…' : 'Μετάφραση στα EN με DeepSeek'}
              </Button>
            </div>

            <div hidden={locale !== 'el'}>
              <div className="field">
                <label htmlFor="legal-title-el">Τίτλος (Ελληνικά)*</label>
                <div className="inwrap">
                  <input id="legal-title-el" value={values.el.title} onChange={e => setEl('title', e.target.value)} required style={{ paddingLeft: 16 }} />
                </div>
                {fieldErrors['el.title'] && <div className="error">{fieldErrors['el.title']}</div>}
              </div>
              <div className="field">
                <label htmlFor="legal-body-el">Κείμενο (markdown)*</label>
                <textarea id="legal-body-el" className="cms-textarea cms-textarea--lg" value={values.el.body} onChange={e => setEl('body', e.target.value)} required />
                {fieldErrors['el.body'] && <div className="error">{fieldErrors['el.body']}</div>}
              </div>
            </div>

            <div hidden={locale !== 'en'}>
              {values.enMachineTranslated && (
                <div className="notice" role="status">
                  <Languages className="size-4 shrink-0" aria-hidden />
                  <span>Αυτόματη μετάφραση DeepSeek — έλεγξέ την πριν δημοσιεύσεις.</span>
                </div>
              )}
              <div className="field">
                <label htmlFor="legal-title-en">Title (English)</label>
                <div className="inwrap">
                  <input id="legal-title-en" value={values.en.title} onChange={e => setEn('title', e.target.value)} style={{ paddingLeft: 16 }} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="legal-body-en">Body (markdown)</label>
                <textarea id="legal-body-en" className="cms-textarea cms-textarea--lg" value={values.en.body} onChange={e => setEn('body', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="glass p-4">
              <div className="field mb-0">
                <label htmlFor="legal-published">Δημοσίευση</label>
                <div className="flex h-11 items-center gap-2.5">
                  <Switch
                    id="legal-published"
                    aria-label="Δημοσίευση"
                    checked={values.published}
                    onCheckedChange={checked => setValues(v => ({ ...v, published: checked }))}
                  />
                  <span className="text-[12.5px] text-muted-foreground">
                    {values.published ? 'Ορατή στο κοινό στο /legal/' + (values.slug || '…') : 'Πρόχειρο — μη ορατή στο κοινό'}
                  </span>
                </div>
              </div>
            </div>

            <div className="glass p-4">
              <div className="field mb-0">
                <label htmlFor="legal-slug">Slug</label>
                <div className="inwrap">
                  <input id="legal-slug" value={values.slug} onChange={e => handleSlugChange(e.target.value)} required style={{ paddingLeft: 16 }} />
                </div>
                {fieldErrors.slug ? <div className="error">{fieldErrors.slug}</div> : <div className="help">/legal/{values.slug || '…'}</div>}
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
