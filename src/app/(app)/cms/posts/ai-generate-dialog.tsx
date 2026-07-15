'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Sparkles, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { TONE_OPTIONS, LENGTH_OPTIONS, type ArticleTone, type ArticleLength } from '@/lib/cms-autogen'
import { generateArticleWithAI } from './actions'

type CategoryOption = { id: string; name: string }

const NO_CATEGORY = '__none__'

export function AiGenerateButton({ categories }: { categories: CategoryOption[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="btn-pill btn-glass" onClick={() => setOpen(true)}>
        <Sparkles className="size-3.5" strokeWidth={1.8} aria-hidden /> Δημιουργία με AI
      </button>
      <AiGenerateDialog open={open} onOpenChange={setOpen} categories={categories} />
    </>
  )
}

function AiGenerateDialog({
  open, onOpenChange, categories,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  categories: CategoryOption[]
}) {
  const router = useRouter()
  const [topic, setTopic] = useState('')
  const [categoryId, setCategoryId] = useState<string>(NO_CATEGORY)
  const [tone, setTone] = useState<ArticleTone>('informative')
  const [length, setLength] = useState<ArticleLength>('medium')
  const [pending, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await generateArticleWithAI({
        topic,
        categoryId: categoryId === NO_CATEGORY ? null : categoryId,
        tone,
        length,
      })
      if (res.ok) {
        toast.success(res.message)
        onOpenChange(false)
        setTopic('')
        setCategoryId(NO_CATEGORY)
        if (res.id) router.push(`/cms/posts/${res.id}/edit`)
      } else {
        toast.error(res.message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!pending) onOpenChange(next) }}>
      <DialogContent className="glass sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" strokeWidth={1.8} aria-hidden /> Δημιουργία άρθρου με AI
          </DialogTitle>
          <DialogDescription>
            Το DeepSeek γράφει ένα SEO/GEO-βελτιστοποιημένο άρθρο στα Ελληνικά και το μεταφράζει αυτόματα στα Αγγλικά.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="ai-topic">Θέμα / brief*</label>
            <textarea
              id="ai-topic"
              className="cms-textarea"
              rows={4}
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="π.χ. Πώς να διαλέξετε ύφασμα ταπετσαρίας για καναπέ σε σπίτι με κατοικίδια"
              required
              disabled={pending}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-3">
            <div className="field">
              <label htmlFor="ai-category">Κατηγορία</label>
              <Select value={categoryId} onValueChange={v => setCategoryId(v as string)} disabled={pending}>
                <SelectTrigger id="ai-category" aria-label="Κατηγορία" className="h-11 w-full rounded-full border-border bg-card px-4">
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
              <label htmlFor="ai-tone">Ύφος</label>
              <Select value={tone} onValueChange={v => setTone(v as ArticleTone)} disabled={pending}>
                <SelectTrigger id="ai-tone" aria-label="Ύφος" className="h-11 w-full rounded-full border-border bg-card px-4">
                  <SelectValue>{(v: string) => TONE_OPTIONS.find(o => o.value === v)?.label ?? v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="field">
              <label htmlFor="ai-length">Μήκος</label>
              <Select value={length} onValueChange={v => setLength(v as ArticleLength)} disabled={pending}>
                <SelectTrigger id="ai-length" aria-label="Μήκος" className="h-11 w-full rounded-full border-border bg-card px-4">
                  <SelectValue>{(v: string) => LENGTH_OPTIONS.find(o => o.value === v)?.label ?? v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LENGTH_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {pending && (
            <div className="notice" role="status">
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
              <span>Δημιουργία &amp; μετάφραση… ~30-60s. Μην κλείσεις αυτό το παράθυρο.</span>
            </div>
          )}

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <DialogClose render={<Button type="button" variant="outline" disabled={pending}>Άκυρο</Button>} />
            <Button type="submit" disabled={pending || topic.trim().length < 3}>
              {pending ? 'Δημιουργία…' : (<><Sparkles className="size-3.5" strokeWidth={1.8} aria-hidden /> Δημιουργία</>)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
