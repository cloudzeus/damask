'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Type, AlignLeft, Tags as TagsIcon, Globe, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TextField, SelectField } from './fields'
import { MediaPicker } from '@/components/media/media-picker'
import { saveSeoDefaults, type SeoDefaultsValues, type OgImageValue } from './actions'

const ROBOTS_OPTIONS = [
  { value: 'index,follow', label: 'index, follow (προεπιλογή)' },
  { value: 'noindex,follow', label: 'noindex, follow' },
  { value: 'index,nofollow', label: 'index, nofollow' },
  { value: 'noindex,nofollow', label: 'noindex, nofollow' },
]
const LOCALE_OPTIONS = [
  { value: 'el', label: 'Ελληνικά' },
  { value: 'en', label: 'English' },
]

function OgImageField({ value, onChange }: { value: OgImageValue; onChange: (v: OgImageValue) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="field">
      <label>Προεπιλεγμένη εικόνα OG</label>
      <div className="flex items-center gap-2.5">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[10px]" style={{ background: 'var(--muted)' }}>
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.url} alt="Προεπισκόπηση OG εικόνας" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-5 text-muted-foreground" strokeWidth={1.6} aria-hidden />
          )}
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            {value ? 'Αλλαγή εικόνας' : 'Επιλογή εικόνας'}
          </Button>
          {value && (
            <button type="button" onClick={() => onChange(null)} className="text-[11px] text-muted-foreground hover:text-destructive">
              Αφαίρεση
            </button>
          )}
        </div>
      </div>
      <MediaPicker
        open={open}
        onOpenChange={setOpen}
        multiple={false}
        accept={['IMAGE']}
        onSelect={assets => {
          const asset = assets[0]
          if (asset) onChange({ assetId: asset.id, url: asset.url })
        }}
      />
    </div>
  )
}

export function SeoForm({ initial }: { initial: SeoDefaultsValues }) {
  const [values, setValues] = useState<SeoDefaultsValues>(initial)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, startSave] = useTransition()

  function set<K extends keyof SeoDefaultsValues>(key: K, value: SeoDefaultsValues[K]) {
    setValues(prev => ({ ...prev, [key]: value }))
    setFieldErrors(errors => {
      if (!(key in errors)) return errors
      const next = { ...errors }
      delete next[key]
      return next
    })
  }

  function handleSave() {
    startSave(async () => {
      const res = await saveSeoDefaults(values)
      if (!res.ok) {
        toast.error(res.message)
        setFieldErrors(res.fieldErrors ?? {})
        return
      }
      toast.success(res.message)
      setFieldErrors({})
    })
  }

  return (
    <div className="glass p-4">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-bold">SEO &amp; Analytics προεπιλογές</h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">Θα καταναλωθούν από το δημόσιο site/CMS αργότερα.</p>
        </div>
        <Button type="button" onClick={handleSave} disabled={saving} className="shrink-0">
          {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <TextField id="seo-title-el" label="Meta title (Ελληνικά)" icon={Type} value={values.metaTitleEl} onChange={v => set('metaTitleEl', v)} error={fieldErrors.metaTitleEl} />
        <TextField id="seo-title-en" label="Meta title (English)" icon={Type} value={values.metaTitleEn} onChange={v => set('metaTitleEn', v)} error={fieldErrors.metaTitleEn} />
        <TextField id="seo-desc-el" label="Meta description (Ελληνικά)" icon={AlignLeft} value={values.metaDescriptionEl} onChange={v => set('metaDescriptionEl', v)} error={fieldErrors.metaDescriptionEl} />
        <TextField id="seo-desc-en" label="Meta description (English)" icon={AlignLeft} value={values.metaDescriptionEn} onChange={v => set('metaDescriptionEn', v)} error={fieldErrors.metaDescriptionEn} />
        <TextField id="seo-keywords" label="Keywords" icon={TagsIcon} value={values.keywords} onChange={v => set('keywords', v)} error={fieldErrors.keywords} placeholder="υφάσματα, έπιπλα, ξενοδοχεία" />
        <SelectField id="seo-robots" label="Robots (προεπιλογή)" value={values.robotsDefault} onChange={v => set('robotsDefault', v)} options={ROBOTS_OPTIONS} />
        <SelectField id="seo-locale" label="Προεπιλεγμένη γλώσσα" value={values.defaultLocale} onChange={v => set('defaultLocale', v)} options={LOCALE_OPTIONS} />
        <div className="sm:col-span-2">
          <OgImageField value={values.ogImage} onChange={v => set('ogImage', v)} />
        </div>

        <div className="dotted-leader col-span-full mt-1 mb-1.5 text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
          Κοινωνικά δίκτυα
        </div>
        <TextField id="seo-fb" label="Facebook" icon={Globe} value={values.socialFacebook} onChange={v => set('socialFacebook', v)} error={fieldErrors.socialFacebook} placeholder="https://facebook.com/…" />
        <TextField id="seo-ig" label="Instagram" icon={Globe} value={values.socialInstagram} onChange={v => set('socialInstagram', v)} error={fieldErrors.socialInstagram} placeholder="https://instagram.com/…" />
        <TextField id="seo-li" label="LinkedIn" icon={Globe} value={values.socialLinkedin} onChange={v => set('socialLinkedin', v)} error={fieldErrors.socialLinkedin} placeholder="https://linkedin.com/company/…" />
        <TextField id="seo-yt" label="YouTube" icon={Globe} value={values.socialYoutube} onChange={v => set('socialYoutube', v)} error={fieldErrors.socialYoutube} placeholder="https://youtube.com/…" />
      </div>

      <div className="mt-2 flex justify-end">
        <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Button>
      </div>
    </div>
  )
}
