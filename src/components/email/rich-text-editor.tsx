'use client'

import * as React from 'react'
import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { TextStyle, Color } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Image from '@tiptap/extension-image'
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Link2, RemoveFormatting, Undo2, Redo2,
  AlignLeft, AlignCenter, AlignRight, Quote, Minus, ImagePlus, Baseline, Highlighter, ChevronDown,
  Maximize2, Minimize2, Check, Unlink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { MediaPicker } from '@/components/media/media-picker'
import type { PickedAsset } from '@/components/media/media-types'

/**
 * Πλήρης Tiptap editor για σύνθεση HTML email. Μόνο λειτουργίες που αποδίδονται
 * σωστά σε email clients (inline styles για χρώμα/στοίχιση, εικόνες από το Media
 * Gallery με δημόσιο URL). `immediatelyRender: false` για ασφαλές SSR στο Next.
 * Το περιεχόμενο εκτίθεται μέσω `onChange(html)` στο onUpdate (όχι setState σε effect).
 */

const TEXT_COLORS = [
  { label: 'Προεπιλογή', value: null },
  { label: 'Μαύρο', value: '#0B0F2A' },
  { label: 'Navy', value: '#001B72' },
  { label: 'Μπλε', value: '#2563EB' },
  { label: 'Πράσινο', value: '#117235' },
  { label: 'Κόκκινο', value: '#B3261E' },
  { label: 'Πορτοκαλί', value: '#B45309' },
  { label: 'Μωβ', value: '#7A2FB0' },
  { label: 'Γκρι', value: '#666C80' },
]
const HIGHLIGHTS = [
  { label: 'Χωρίς', value: null },
  { label: 'Κίτρινο', value: '#FEF08A' },
  { label: 'Πράσινο', value: '#BBF7D0' },
  { label: 'Μπλε', value: '#BFDBFE' },
  { label: 'Ροζ', value: '#FBCFE8' },
  { label: 'Πορτοκαλί', value: '#FED7AA' },
]
const BLOCKS = [
  { label: 'Κείμενο', level: 0 },
  { label: 'Επικεφαλίδα 1', level: 1 },
  { label: 'Επικεφαλίδα 2', level: 2 },
  { label: 'Επικεφαλίδα 3', level: 3 },
] as const

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Γράψε το μήνυμά σου…',
  disabled = false,
  className,
}: {
  value?: string
  onChange: (html: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const [expanded, setExpanded] = React.useState(false)
  const [pickerOpen, setPickerOpen] = React.useState(false)

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        },
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ HTMLAttributes: { style: 'max-width:100%;height:auto;border-radius:8px;' } }),
      Placeholder.configure({ placeholder }),
    ],
    content: value ?? '',
    editorProps: {
      attributes: {
        class: 'rte-content px-4 py-3 outline-none',
        'aria-label': 'Κείμενο μηνύματος',
      },
    },
    onUpdate({ editor: ed }) {
      const html = ed.getHTML()
      onChange(html === '<p></p>' ? '' : html)
    },
  })

  function insertImages(assets: PickedAsset[]) {
    if (!editor) return
    for (const a of assets) editor.chain().focus().setImage({ src: a.url, alt: a.name }).run()
  }

  if (!editor) {
    return (
      <div className={cn('rounded-xl border border-border bg-card', className)}>
        <div className="h-11 rounded-t-xl border-b border-border bg-muted/40" />
        <div className="min-h-44 px-4 py-3 text-[length:var(--fs-14)] text-muted-foreground">Φόρτωση επεξεργαστή…</div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rte flex flex-col rounded-xl border border-border bg-card focus-within:border-(--info) focus-within:ring-4 focus-within:ring-(--info-soft)',
        className,
      )}
    >
      <Toolbar editor={editor} disabled={disabled} expanded={expanded} onToggleExpand={() => setExpanded(e => !e)} onImage={() => setPickerOpen(true)} />

      <BubbleMenu editor={editor} className="rte-bubble flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-lg">
        <Tool label="Έντονα" small active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="size-3.5" /></Tool>
        <Tool label="Πλάγια" small active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="size-3.5" /></Tool>
        <Tool label="Υπογράμμιση" small active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline className="size-3.5" /></Tool>
        <Tool label="Επισήμανση" small active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight({ color: '#FEF08A' }).run()}><Highlighter className="size-3.5" /></Tool>
      </BubbleMenu>

      <div className={cn('overflow-y-auto', expanded ? 'min-h-[55vh]' : 'min-h-44 max-h-[50vh]')}>
        <EditorContent editor={editor} />
      </div>

      <Footer editor={editor} />

      <MediaPicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={insertImages} multiple accept={['IMAGE']} />
    </div>
  )
}

function Toolbar({
  editor, disabled, expanded, onToggleExpand, onImage,
}: {
  editor: Editor
  disabled: boolean
  expanded: boolean
  onToggleExpand: () => void
  onImage: () => void
}) {
  // Επαναποδίδεται σε κάθε αλλαγή επιλογής/μορφοποίησης (ενεργά κουμπιά).
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      left: e.isActive({ textAlign: 'left' }),
      center: e.isActive({ textAlign: 'center' }),
      right: e.isActive({ textAlign: 'right' }),
      level: ([1, 2, 3] as const).find(l => e.isActive('heading', { level: l })) ?? 0,
      color: (e.getAttributes('textStyle').color as string | undefined) ?? null,
      highlight: (e.getAttributes('highlight').color as string | undefined) ?? null,
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })
  const c = () => editor.chain().focus()
  const sep = <span className="mx-0.5 h-6 w-px bg-border" aria-hidden />

  return (
    <div role="toolbar" aria-label="Μορφοποίηση κειμένου" className="flex flex-wrap items-center gap-0.5 rounded-t-xl border-b border-border bg-muted/40 p-1.5">
      <Tool label="Αναίρεση (Ctrl+Z)" disabled={disabled || !s.canUndo} onClick={() => c().undo().run()}><Undo2 className="size-4" /></Tool>
      <Tool label="Επανάληψη (Ctrl+Shift+Z)" disabled={disabled || !s.canRedo} onClick={() => c().redo().run()}><Redo2 className="size-4" /></Tool>
      {sep}
      <Popover
        disabled={disabled}
        trigger={
          <span className="inline-flex h-9 min-w-[7.5rem] items-center justify-between gap-1 rounded-lg px-2.5 text-[length:var(--fs-12-5)] font-semibold text-foreground">
            {BLOCKS.find(b => b.level === s.level)?.label} <ChevronDown className="size-3.5 text-muted-foreground" />
          </span>
        }
        label="Στυλ παραγράφου"
      >
        {close => (
          <div className="flex min-w-44 flex-col p-1">
            {BLOCKS.map(b => (
              <button
                key={b.level}
                type="button"
                onClick={() => { (b.level ? c().setHeading({ level: b.level }) : c().setParagraph()).run(); close() }}
                className={cn(
                  'flex items-center justify-between rounded-md px-2.5 py-1.5 text-left hover:bg-muted',
                  b.level === 1 && 'text-[length:var(--fs-18)] font-bold',
                  b.level === 2 && 'text-[length:var(--fs-16)] font-bold',
                  b.level === 3 && 'text-[length:var(--fs-14)] font-bold',
                  b.level === 0 && 'text-[length:var(--fs-13)]',
                )}
              >
                {b.label}
                {s.level === b.level && <Check className="size-3.5 text-primary" />}
              </button>
            ))}
          </div>
        )}
      </Popover>
      {sep}
      <Tool label="Έντονα (Ctrl+B)" active={s.bold} disabled={disabled} onClick={() => c().toggleBold().run()}><Bold className="size-4" /></Tool>
      <Tool label="Πλάγια (Ctrl+I)" active={s.italic} disabled={disabled} onClick={() => c().toggleItalic().run()}><Italic className="size-4" /></Tool>
      <Tool label="Υπογράμμιση (Ctrl+U)" active={s.underline} disabled={disabled} onClick={() => c().toggleUnderline().run()}><Underline className="size-4" /></Tool>
      <Tool label="Διακριτή διαγραφή" active={s.strike} disabled={disabled} onClick={() => c().toggleStrike().run()}><Strikethrough className="size-4" /></Tool>
      <Popover
        disabled={disabled}
        label="Χρώμα κειμένου"
        trigger={
          <span className="relative inline-flex size-9 items-center justify-center">
            <Baseline className="size-4" />
            <span className="absolute bottom-1.5 left-2 h-0.5 w-5 rounded-full" style={{ background: s.color ?? 'currentColor' }} />
          </span>
        }
      >
        {close => <Swatches items={TEXT_COLORS} current={s.color} onPick={v => { (v ? c().setColor(v) : c().unsetColor()).run(); close() }} />}
      </Popover>
      <Popover
        disabled={disabled}
        label="Επισήμανση"
        trigger={
          <span className="relative inline-flex size-9 items-center justify-center">
            <Highlighter className="size-4" />
            <span className="absolute bottom-1.5 left-2 h-0.5 w-5 rounded-full" style={{ background: s.highlight ?? 'transparent' }} />
          </span>
        }
      >
        {close => <Swatches items={HIGHLIGHTS} current={s.highlight} onPick={v => { (v ? c().setHighlight({ color: v }) : c().unsetHighlight()).run(); close() }} />}
      </Popover>
      {sep}
      <Tool label="Στοίχιση αριστερά" active={s.left} disabled={disabled} onClick={() => c().setTextAlign('left').run()}><AlignLeft className="size-4" /></Tool>
      <Tool label="Στοίχιση στο κέντρο" active={s.center} disabled={disabled} onClick={() => c().setTextAlign('center').run()}><AlignCenter className="size-4" /></Tool>
      <Tool label="Στοίχιση δεξιά" active={s.right} disabled={disabled} onClick={() => c().setTextAlign('right').run()}><AlignRight className="size-4" /></Tool>
      {sep}
      <Tool label="Λίστα με κουκκίδες" active={s.bullet} disabled={disabled} onClick={() => c().toggleBulletList().run()}><List className="size-4" /></Tool>
      <Tool label="Αριθμημένη λίστα" active={s.ordered} disabled={disabled} onClick={() => c().toggleOrderedList().run()}><ListOrdered className="size-4" /></Tool>
      <Tool label="Παράθεση" active={s.quote} disabled={disabled} onClick={() => c().toggleBlockquote().run()}><Quote className="size-4" /></Tool>
      <Tool label="Διαχωριστική γραμμή" disabled={disabled} onClick={() => c().setHorizontalRule().run()}><Minus className="size-4" /></Tool>
      {sep}
      <Popover disabled={disabled} label="Σύνδεσμος" active={s.link} trigger={<span className="inline-flex size-9 items-center justify-center"><Link2 className="size-4" /></span>}>
        {close => <LinkForm editor={editor} onDone={close} />}
      </Popover>
      <Tool label="Εικόνα από το Media Gallery" disabled={disabled} onClick={onImage}><ImagePlus className="size-4" /></Tool>
      <Tool label="Καθαρισμός μορφοποίησης" disabled={disabled} onClick={() => c().unsetAllMarks().clearNodes().unsetTextAlign().run()}><RemoveFormatting className="size-4" /></Tool>
      <span className="flex-1" />
      <Tool label={expanded ? 'Σμίκρυνση επεξεργαστή' : 'Μεγέθυνση επεξεργαστή'} onClick={onToggleExpand}>
        {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </Tool>
    </div>
  )
}

function Footer({ editor }: { editor: Editor }) {
  const { words, chars } = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const text = e.getText().trim()
      return { words: text ? text.split(/\s+/).length : 0, chars: text.length }
    },
  })
  return (
    <div className="flex items-center justify-between gap-2 rounded-b-xl border-t border-border bg-muted/30 px-3 py-1.5 text-[length:var(--fs-11)] text-muted-foreground">
      <span>Επίλεξε κείμενο για γρήγορη μορφοποίηση · Ctrl+B / I / U</span>
      <span className="tabular-nums">{words} λέξεις · {chars} χαρακτήρες</span>
    </div>
  )
}

function Swatches({
  items, current, onPick,
}: {
  items: readonly { label: string; value: string | null }[]
  current: string | null
  onPick: (v: string | null) => void
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5 p-2">
      {items.map(it => (
        <button
          key={it.label}
          type="button"
          title={it.label}
          aria-label={it.label}
          onClick={() => onPick(it.value)}
          className={cn(
            'flex size-7 items-center justify-center rounded-md border border-border transition-transform hover:scale-110',
            (current ?? null) === it.value && 'ring-2 ring-primary ring-offset-1',
          )}
          style={{ background: it.value ?? 'transparent' }}
        >
          {!it.value && <span className="block h-px w-5 rotate-45 bg-destructive" />}
        </button>
      ))}
    </div>
  )
}

function LinkForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const [url, setUrl] = React.useState(() => (editor.getAttributes('link').href as string | undefined) ?? '')
  const hasLink = editor.isActive('link')
  function apply(e?: React.FormEvent) {
    e?.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else {
      const href = /^(https?:|mailto:|tel:)/i.test(trimmed) ? trimmed : `https://${trimmed}`
      if (editor.state.selection.empty && !hasLink) {
        editor.chain().focus().insertContent({ type: 'text', text: trimmed, marks: [{ type: 'link', attrs: { href } }] }).run()
      } else {
        editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
      }
    }
    onDone()
  }
  return (
    <div className="flex w-72 flex-col gap-2 p-2.5">
      <label className="text-[length:var(--fs-11-5)] font-bold text-muted-foreground" htmlFor="rte-link-url">Διεύθυνση συνδέσμου</label>
      <input
        id="rte-link-url"
        autoFocus
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') apply(e) }}
        placeholder="https://… ή email@…"
        className="h-9 rounded-lg border border-border bg-card px-2.5 text-[length:var(--fs-13)] outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
      />
      <div className="flex justify-end gap-1.5">
        {hasLink && (
          <button type="button" onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); onDone() }} className="inline-flex h-8 items-center gap-1 rounded-full border border-border px-3 text-[length:var(--fs-12)] font-semibold hover:bg-muted">
            <Unlink className="size-3.5" /> Αφαίρεση
          </button>
        )}
        <button type="button" onClick={() => apply()} className="inline-flex h-8 items-center rounded-full bg-primary px-3.5 text-[length:var(--fs-12)] font-semibold text-primary-foreground">
          Εφαρμογή
        </button>
      </div>
    </div>
  )
}

/** Ελαφρύ popover (χωρίς portal): κλείνει σε click έξω ή Escape. */
function Popover({
  trigger, label, children, disabled, active,
}: {
  trigger: React.ReactNode
  label: string
  children: (close: () => void) => React.ReactNode
  disabled?: boolean
  active?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={e => e.preventDefault()}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'inline-flex min-h-9 items-center justify-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-50',
          active || open ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        {trigger}
      </button>
      {open && (
        <div role="dialog" aria-label={label} className="absolute top-full left-0 z-30 mt-1 rounded-xl border border-border bg-popover shadow-xl">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

function Tool({
  label, active, disabled, onClick, children, small,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
  small?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-40 [&_svg]:stroke-[2]',
        small ? 'size-7' : 'size-9',
        active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
