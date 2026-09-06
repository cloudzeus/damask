'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Mail, ChevronDown, ChevronRight, ArrowDownLeft, ArrowUpRight, Paperclip, Reply, Inbox, LoaderCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ComposeEmailDialog } from '@/components/email/compose-email-dialog'
import {
  listThreadsForTrdr, listThreadsForProgram, listThreadsForApplication, listThreadMessages,
  type ThreadRow, type MessageRow,
} from '@/lib/email/actions'
import { relativeTime } from '@/lib/relative-time'
import { cn } from '@/lib/utils'

/**
 * Ιστορικό email συσχετισμένο με πελάτη/πρόγραμμα/έργο. Λίστα-ακορντεόν με τα
 * νήματα· το άνοιγμα ενός νήματος φορτώνει lazy τα μηνύματα και αποδίδει το
 * bodyHtml ΜΕΣΑ σε sandboxed iframe (ασφαλής προβολή δικού μας HTML email).
 * «Νέο email» / «Reply» ανοίγουν τον composer με την ίδια συσχέτιση.
 */
export function EmailHistory({
  trdrId, programId, applicationId, defaultTo, defaultSubject, canSend = false,
}: {
  trdrId?: string
  programId?: string
  applicationId?: string
  defaultTo?: string
  defaultSubject?: string
  canSend?: boolean
}) {
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [compose, setCompose] = useState<{ open: boolean; threadId?: string; subject?: string }>({ open: false })

  // Καθαρή ανάκτηση νημάτων — δεν αγγίζει state, ώστε να καλείται και μέσα σε
  // effect (μετά από await, όχι synchronously) και από event handlers.
  const fetchThreads = useCallback(async (): Promise<ThreadRow[]> => {
    if (applicationId) return listThreadsForApplication(applicationId)
    if (programId) return listThreadsForProgram(programId)
    if (trdrId) return listThreadsForTrdr(trdrId)
    return []
  }, [trdrId, programId, applicationId])

  // Manual reload — καλείται ΜΟΝΟ από event handlers (onSent/reply), όπου το
  // synchronous setState επιτρέπεται (react-hooks/set-state-in-effect).
  const reload = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setThreads(await fetchThreads())
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [fetchThreads])

  // Αρχική φόρτωση — τα setState μπαίνουν ΜΕΤΑ το await (όχι synchronously στο
  // σώμα του effect).
  useEffect(() => {
    let cancelled = false
    fetchThreads()
      .then(rows => { if (!cancelled) setThreads(rows) })
      .catch(() => { if (!cancelled) setError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [fetchThreads])

  return (
    <div className="glass flex flex-col gap-3 rounded-[22px] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[0.9375rem] font-bold">
          <Mail className="size-4 text-muted-foreground" aria-hidden /> Επικοινωνία
        </h3>
        {canSend && (
          <Button type="button" onClick={() => setCompose({ open: true })}>
            <Mail className="size-4" aria-hidden /> Νέο email
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Αδυναμία φόρτωσης του ιστορικού.
        </div>
      ) : threads.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center">
          <Inbox className="size-7 text-muted-foreground" strokeWidth={1.5} aria-hidden />
          <p className="text-sm font-medium">Δεν υπάρχει επικοινωνία ακόμα.</p>
          {canSend && <p className="text-xs text-muted-foreground">Πάτησε «Νέο email» για να ξεκινήσεις.</p>}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {threads.map(thread => (
            <ThreadItem
              key={thread.id}
              thread={thread}
              canSend={canSend}
              onReply={() => setCompose({ open: true, threadId: thread.id, subject: thread.subject })}
            />
          ))}
        </ul>
      )}

      <ComposeEmailDialog
        trdrId={trdrId}
        programId={programId}
        applicationId={applicationId}
        defaultTo={defaultTo}
        defaultSubject={compose.threadId ? compose.subject : defaultSubject}
        threadId={compose.threadId}
        open={compose.open}
        onOpenChange={open => setCompose(c => ({ ...c, open }))}
        onSent={() => { void reload() }}
        showTrigger={false}
      />
    </div>
  )
}

function ThreadItem({
  thread, canSend, onReply,
}: {
  thread: ThreadRow
  canSend: boolean
  onReply: () => void
}) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<MessageRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && messages === null && !loading) {
      setLoading(true)
      try {
        setMessages(await listThreadMessages(thread.id))
      } catch {
        setMessages([])
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <li className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex min-h-11 w-full items-start gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <span className="mt-0.5 text-muted-foreground">
          {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold">{thread.subject}</span>
            <StatusBadge status={thread.status} />
          </span>
          {thread.lastSnippet && <span className="truncate text-xs text-muted-foreground">{thread.lastSnippet}</span>}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 text-right">
          <span className="text-[0.6875rem] whitespace-nowrap text-muted-foreground">{relativeTime(thread.lastMessageAt)}</span>
          <span className="badge-pill muted">{thread.messageCount} {thread.messageCount === 1 ? 'μήνυμα' : 'μηνύματα'}</span>
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border bg-muted/20 p-3.5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση μηνυμάτων…
            </div>
          ) : messages && messages.length > 0 ? (
            messages.map(m => <MessageCard key={m.id} message={m} />)
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">Δεν υπάρχουν μηνύματα.</p>
          )}
          {canSend && (
            <Button type="button" variant="outline" size="sm" className="min-h-11 self-start" onClick={onReply}>
              <Reply className="size-4" aria-hidden /> Απάντηση
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

function MessageCard({ message }: { message: MessageRow }) {
  const inbound = message.direction === 'INBOUND'
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className={cn('badge-pill', inbound ? 'info' : 'ok')}>
          {inbound ? <ArrowDownLeft className="size-3" aria-hidden /> : <ArrowUpRight className="size-3" aria-hidden />}
          {inbound ? 'Εισερχόμενο' : 'Εξερχόμενο'}
        </span>
        <span className="text-[0.6875rem] text-muted-foreground">{relativeTime(message.createdAt)}</span>
      </div>
      <div className="mb-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
        <span><b className="font-semibold text-foreground">Από:</b> {message.fromEmail}</span>
        {message.toEmails.length > 0 && <span><b className="font-semibold text-foreground">Προς:</b> {message.toEmails.join(', ')}</span>}
      </div>

      {message.bodyHtml ? (
        <iframe
          sandbox=""
          srcDoc={message.bodyHtml}
          title={`Μήνυμα: ${message.subject}`}
          className="w-full rounded-lg border border-border bg-white"
          style={{ height: 340, maxHeight: '60vh' }}
        />
      ) : (
        <p className="text-sm whitespace-pre-wrap">{message.snippet}</p>
      )}

      {message.attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {message.attachments.map((att, i) => (
            <a
              key={i}
              href={att.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 text-xs font-semibold transition-colors hover:bg-muted"
            >
              <Paperclip className="size-3.5" aria-hidden />
              <span className="max-w-48 truncate">{att.name}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase()
  if (s === 'FAILED' || s === 'ERROR') {
    return <span className="badge-pill" style={{ color: 'var(--coral)', background: 'var(--coral-soft)' }}>Απέτυχε</span>
  }
  if (s === 'OPEN' || s === 'ACTIVE') return <span className="badge-pill info">Ανοιχτό</span>
  if (s === 'CLOSED') return <span className="badge-pill muted">Κλειστό</span>
  return <span className="badge-pill muted">{status}</span>
}
