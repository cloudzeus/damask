'use client'

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Italic, List, ListOrdered, Link2, RemoveFormatting } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Μικρό Tiptap wrapper για σύνθεση HTML email (StarterKit + Link + Placeholder).
 * Το StarterKit v3 περιλαμβάνει ήδη το Link (ρυθμίζεται μέσω της `link` επιλογής)
 * — προσθέτουμε ξεχωριστά μόνο το Placeholder ώστε να μη διπλασιαστεί κάποιο
 * extension. `immediatelyRender: false` για ασφαλές SSR στο Next (αλλιώς hydration
 * mismatch). Το περιεχόμενο εκτίθεται μέσω `onChange(html)` στο onUpdate handler
 * (όχι setState μέσα σε effect — react-hooks/set-state-in-effect clean).
 */
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
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value ?? '',
    editorProps: {
      attributes: {
        class: 'rte-content min-h-40 rounded-b-xl px-3.5 py-3 text-sm leading-relaxed outline-none',
      },
    },
    onUpdate({ editor: ed }) {
      const html = ed.getHTML()
      onChange(html === '<p></p>' ? '' : html)
    },
  })

  if (!editor) {
    return (
      <div className={cn('rounded-xl border border-border bg-card', className)}>
        <div className="h-11 rounded-t-xl border-b border-border bg-muted/40" />
        <div className="min-h-40 px-3.5 py-3 text-sm text-muted-foreground">Φόρτωση επεξεργαστή…</div>
      </div>
    )
  }

  return (
    <div className={cn('rounded-xl border border-border bg-card focus-within:border-(--info) focus-within:ring-4 focus-within:ring-(--info-soft)', className)}>
      <div role="toolbar" aria-label="Μορφοποίηση κειμένου" className="flex flex-wrap items-center gap-1 rounded-t-xl border-b border-border bg-muted/40 p-1.5">
        <ToolButton label="Έντονα" active={editor.isActive('bold')} disabled={disabled} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="size-4" strokeWidth={2} aria-hidden />
        </ToolButton>
        <ToolButton label="Πλάγια" active={editor.isActive('italic')} disabled={disabled} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="size-4" strokeWidth={2} aria-hidden />
        </ToolButton>
        <span className="mx-0.5 h-6 w-px bg-border" aria-hidden />
        <ToolButton label="Λίστα με κουκκίδες" active={editor.isActive('bulletList')} disabled={disabled} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="size-4" strokeWidth={2} aria-hidden />
        </ToolButton>
        <ToolButton label="Αριθμημένη λίστα" active={editor.isActive('orderedList')} disabled={disabled} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="size-4" strokeWidth={2} aria-hidden />
        </ToolButton>
        <span className="mx-0.5 h-6 w-px bg-border" aria-hidden />
        <ToolButton label="Σύνδεσμος" active={editor.isActive('link')} disabled={disabled} onClick={() => toggleLink(editor)}>
          <Link2 className="size-4" strokeWidth={2} aria-hidden />
        </ToolButton>
        <ToolButton label="Καθαρισμός μορφοποίησης" disabled={disabled} onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
          <RemoveFormatting className="size-4" strokeWidth={2} aria-hidden />
        </ToolButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

function toggleLink(editor: Editor) {
  if (editor.isActive('link')) {
    editor.chain().focus().unsetLink().run()
    return
  }
  const prev = (editor.getAttributes('link').href as string | undefined) ?? ''
  const url = window.prompt('Διεύθυνση συνδέσμου (URL):', prev)
  if (url === null) return
  const trimmed = url.trim()
  if (!trimmed) {
    editor.chain().focus().unsetLink().run()
    return
  }
  editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run()
}

function ToolButton({
  label, active, disabled, onClick, children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
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
        'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-50',
        active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
