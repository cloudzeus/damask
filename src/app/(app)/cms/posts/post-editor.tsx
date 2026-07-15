'use client'

import { useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Languages, ImageIcon, Save } from 'lucide-react'
import type { PostStatus } from '@prisma/client'
import { cn } from '@/lib/utils'
import { slugify } from '@/lib/slug'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { MediaPicker } from '@/components/media/media-picker'
import { createPost, updatePost, translateFieldsToEnglish, type PostFormValues, type LocaleContentValues } from './actions'

const NO_CATEGORY = '__none__'
const NO_AUTHOR = '__none__'

const STATUS_OPTIONS: { value: PostStatus; label: string }[] = [
  { value: 'DRAFT', label: 'Πρόχειρο' },
  { value: 'REVIEW', label: 'Σε έλεγχο' },
  { value: 'PUBLISHED', label: 'Δημοσιευμένο' },
  { value: 'ARCHIVED', label: 'Αρχειοθετημένο' },
]

export type Option = { id: string; name: string }

export function PostEditor({
  mode, postId, initialValues, categories, authors,
}: {
  mode: 'create' | 'edit'
  postId?: string
  initialValues: PostFormValues
  categories: Option[]
  authors: Option[]
}) {
  const router = useRouter()
  const [values, setValues] = useState<PostFormValues>(initialValues)
  const [locale, setLocale] = useState<'el' | 'en'>('el')
  const [slugTouched, setSlugTouched] = useState(mode === 'edit')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [translating, startTranslate] = useTransition()

  function setEl<K extends keyof LocaleContentValues>(key: K, value: LocaleContentValues[K]) {
    setValues(v => {
      const el = { ...v.el, [key]: value }
      const slug = key === 'title' && !slugTouched ? slugify(String(value)) : v.slug
      return { ...v, el, slug }
    })
  }

  function setEn<K extends keyof LocaleContentValues>(key: K, value: LocaleContentValues[K]) {
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
      const res = await translateFieldsToEnglish(values.el)
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
      const res = mode === 'create' ? await createPost(values) : await updatePost(postId!, values)
      if (res.ok) {
        toast.success(res.message)
        setFieldErrors({})
        if (mode === 'create' && res.id) router.push(`/cms/posts/${res.id}/edit`)
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
            CMS <span aria-hidden>›</span> <Link href="/cms/posts" className="hover:text-foreground hover:underline">Νέα</Link>{' '}
            <span aria-hidden>›</span> <b className="text-foreground">{mode === 'create' ? 'Νέο άρθρο' : 'Επεξεργασία άρθρου'}</b>
          </div>
          <h1 className="text-[22px]">{mode === 'create' ? 'Νέο άρθρο' : (values.el.title || 'Επεξεργασία άρθρου')}</h1>
        </div>
        <div className="flex-1" />
        <Button type="button" variant="outline" onClick={() => router.push('/cms/posts')}>Πίσω</Button>
        <Button type="submit" form="post-editor-form" disabled={pending}>
          <Save className="size-3.5" strokeWidth={1.8} aria-hidden /> {pending ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </Button>
      </div>

      <form id="post-editor-form" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
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
                <label htmlFor="post-title-el">Τίτλος (Ελληνικά)*</label>
                <div className="inwrap">
                  <input id="post-title-el" value={values.el.title} onChange={e => setEl('title', e.target.value)} required style={{ paddingLeft: 16 }} />
                </div>
                {fieldErrors['el.title'] && <div className="error">{fieldErrors['el.title']}</div>}
              </div>
              <div className="field">
                <label htmlFor="post-excerpt-el">Περίληψη</label>
                <textarea id="post-excerpt-el" className="cms-textarea" rows={2} value={values.el.excerpt} onChange={e => setEl('excerpt', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="post-body-el">Κείμενο (markdown)*</label>
                <textarea id="post-body-el" className="cms-textarea cms-textarea--lg" value={values.el.body} onChange={e => setEl('body', e.target.value)} required />
                {fieldErrors['el.body'] && <div className="error">{fieldErrors['el.body']}</div>}
              </div>
              <div className="field">
                <label htmlFor="post-seo-title-el">SEO title</label>
                <div className="inwrap">
                  <input id="post-seo-title-el" value={values.el.seoTitle} onChange={e => setEl('seoTitle', e.target.value)} maxLength={70} style={{ paddingLeft: 16 }} />
                </div>
                <div className="help">{values.el.seoTitle.length}/70 χαρακτήρες</div>
              </div>
              <div className="field">
                <label htmlFor="post-seo-desc-el">SEO description</label>
                <textarea id="post-seo-desc-el" className="cms-textarea" rows={2} value={values.el.seoDescription} onChange={e => setEl('seoDescription', e.target.value)} maxLength={200} />
                <div className="help">{values.el.seoDescription.length}/200 χαρακτήρες</div>
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
                <label htmlFor="post-title-en">Title (English)</label>
                <div className="inwrap">
                  <input id="post-title-en" value={values.en.title} onChange={e => setEn('title', e.target.value)} style={{ paddingLeft: 16 }} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="post-excerpt-en">Excerpt</label>
                <textarea id="post-excerpt-en" className="cms-textarea" rows={2} value={values.en.excerpt} onChange={e => setEn('excerpt', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="post-body-en">Body (markdown)</label>
                <textarea id="post-body-en" className="cms-textarea cms-textarea--lg" value={values.en.body} onChange={e => setEn('body', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="post-seo-title-en">SEO title</label>
                <div className="inwrap">
                  <input id="post-seo-title-en" value={values.en.seoTitle} onChange={e => setEn('seoTitle', e.target.value)} maxLength={70} style={{ paddingLeft: 16 }} />
                </div>
                <div className="help">{values.en.seoTitle.length}/70 characters</div>
              </div>
              <div className="field">
                <label htmlFor="post-seo-desc-en">SEO description</label>
                <textarea id="post-seo-desc-en" className="cms-textarea" rows={2} value={values.en.seoDescription} onChange={e => setEn('seoDescription', e.target.value)} maxLength={200} />
                <div className="help">{values.en.seoDescription.length}/200 characters</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="glass p-4">
              <div className="field">
                <label htmlFor="post-status">Κατάσταση</label>
                <Select value={values.status} onValueChange={v => setValues(val => ({ ...val, status: v as PostStatus }))}>
                  <SelectTrigger id="post-status" aria-label="Κατάσταση" className="h-11 w-full rounded-full border-border bg-card px-4">
                    <SelectValue>{(v: string) => STATUS_OPTIONS.find(o => o.value === v)?.label ?? v}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="field">
                <label htmlFor="post-category">Κατηγορία</label>
                <Select
                  value={values.categoryId ?? NO_CATEGORY}
                  onValueChange={v => setValues(val => ({ ...val, categoryId: v === NO_CATEGORY ? null : (v as string) }))}
                >
                  <SelectTrigger id="post-category" aria-label="Κατηγορία" className="h-11 w-full rounded-full border-border bg-card px-4">
                    <SelectValue>
                      {(v: string) => (v === NO_CATEGORY ? 'Χωρίς κατηγορία' : (categories.find(c => c.id === v)?.name ?? 'Χωρίς κατηγορία'))}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CATEGORY}>Χωρίς κατηγορία</SelectItem>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="field">
                <label htmlFor="post-author">Συγγραφέας</label>
                <Select
                  value={values.authorId ?? NO_AUTHOR}
                  onValueChange={v => setValues(val => ({ ...val, authorId: v === NO_AUTHOR ? null : (v as string) }))}
                >
                  <SelectTrigger id="post-author" aria-label="Συγγραφέας" className="h-11 w-full rounded-full border-border bg-card px-4">
                    <SelectValue>
                      {(v: string) => (v === NO_AUTHOR ? 'Χωρίς συγγραφέα' : (authors.find(a => a.id === v)?.name ?? 'Χωρίς συγγραφέα'))}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_AUTHOR}>Χωρίς συγγραφέα</SelectItem>
                    {authors.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="field">
                <label htmlFor="post-slug">Slug</label>
                <div className="inwrap">
                  <input id="post-slug" value={values.slug} onChange={e => handleSlugChange(e.target.value)} required style={{ paddingLeft: 16 }} />
                </div>
                {fieldErrors.slug ? <div className="error">{fieldErrors.slug}</div> : <div className="help">/nea/{values.slug || '…'}</div>}
              </div>
            </div>

            <div className="glass p-4">
              <label className="mb-1.5 block text-[12px] font-bold">Εικόνα εξωφύλλου</label>
              <div className="flex items-center gap-2.5">
                <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[10px]" style={{ background: 'var(--muted)' }}>
                  {values.featuredImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={values.featuredImage} alt="" className="size-full object-cover" />
                  ) : (
                    <ImageIcon className="size-5 text-muted-foreground" strokeWidth={1.6} aria-hidden />
                  )}
                </div>
                <div className="flex flex-col items-start gap-1.5">
                  <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                    {values.featuredImage ? 'Αλλαγή εικόνας' : 'Επιλογή εικόνας'}
                  </Button>
                  {values.featuredImage && (
                    <button
                      type="button"
                      onClick={() => setValues(v => ({ ...v, featuredImage: null }))}
                      className="text-[11px] text-muted-foreground hover:text-destructive"
                    >
                      Αφαίρεση
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        multiple={false}
        accept={['IMAGE']}
        onSelect={assets => {
          const asset = assets[0]
          if (asset) setValues(v => ({ ...v, featuredImage: asset.url }))
        }}
      />
    </div>
  )
}
