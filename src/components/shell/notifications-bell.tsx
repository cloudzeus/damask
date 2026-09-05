'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck } from 'lucide-react'
import {
  getUnreadNotificationCount,
  getNotifications,
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from '@/lib/notifications/actions'
import type { NotificationRow } from '@/lib/notifications/service'
import { relativeTime } from '@/lib/relative-time'

/**
 * Καμπάνα ειδοποιήσεων στο topbar: badge μη-αναγνωσμένων (poll ανά 60s) + dropdown
 * feed. Client component — το topbar είναι server. Οι server actions διαβάζουν το
 * session, οπότε δεν περνάμε userId. Προσοχή στο react-hooks/set-state-in-effect:
 * ΠΟΤΕ setState σύγχρονα στο σώμα ενός effect — πάντα μέσα σε nested function.
 */
export function NotificationsBell() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [count, setCount] = React.useState(0)
  const [items, setItems] = React.useState<NotificationRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)

  // Poll πλήθους μη-αναγνωσμένων (mount + κάθε 60s). setState μέσα σε nested async.
  React.useEffect(() => {
    let active = true
    const refresh = async () => {
      const n = await getUnreadNotificationCount()
      if (active) setCount(n)
    }
    void refresh()
    const id = setInterval(() => { void refresh() }, 60_000)
    return () => { active = false; clearInterval(id) }
  }, [])

  // await-first: κανένα setState δεν τρέχει σύγχρονα (react-hooks/set-state-in-effect).
  const loadList = React.useCallback(async () => {
    try {
      const rows = await getNotifications(20)
      setItems(rows)
      setCount(rows.filter(r => !r.read).length)
    } finally {
      setLoading(false)
    }
  }, [])

  // Άνοιγμα → φόρτωσε τη λίστα (το loading flag μπαίνει στον click handler).
  React.useEffect(() => {
    if (!open) return
    void loadList()
  }, [open, loadList])

  // Click-outside + Escape κλείνουν το panel.
  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const handleItemClick = React.useCallback(async (n: NotificationRow) => {
    setItems(prev => prev.map(r => (r.id === n.id ? { ...r, read: true } : r)))
    setCount(c => (n.read ? c : Math.max(0, c - 1)))
    await markNotificationReadAction(n.id)
    if (n.type === 'PUBLIC_LEAD') {
      setOpen(false)
      router.push('/newsletter')
    }
  }, [router])

  const handleMarkAll = React.useCallback(async () => {
    setItems(prev => prev.map(r => ({ ...r, read: true })))
    setCount(0)
    await markAllNotificationsReadAction()
  }, [])

  const badgeLabel = count > 9 ? '9+' : String(count)

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className="icon-pill"
        aria-label={count > 0 ? `Ειδοποιήσεις (${count} μη αναγνωσμένες)` : 'Ειδοποιήσεις'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) setLoading(true)
          setOpen(o => !o)
        }}
      >
        <Bell className="size-4" strokeWidth={1.8} />
        {count > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex min-w-[1.05rem] items-center justify-center rounded-full px-1 text-[0.625rem] leading-none font-extrabold tabular-nums"
            style={{ height: '1.05rem', background: 'var(--coral)', color: '#fff', border: '1.5px solid var(--card)' }}
            aria-hidden
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Ειδοποιήσεις"
          className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-[0.875rem] border border-border bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
            <span className="text-[0.8125rem] font-bold text-foreground">Ειδοποιήσεις</span>
            <button
              type="button"
              onClick={() => { void handleMarkAll() }}
              disabled={count === 0}
              className="inline-flex min-h-[2rem] items-center gap-1 rounded-full px-2 text-[0.6875rem] font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCheck className="size-3.5" strokeWidth={1.8} />
              Σήμανση όλων ως αναγνωσμένα
            </button>
          </div>

          <div className="max-h-[min(28rem,70vh)] overflow-y-auto overscroll-contain">
            {loading && items.length === 0 ? (
              <div className="px-3.5 py-6 text-center text-[0.75rem] text-muted-foreground">
                Φόρτωση…
              </div>
            ) : items.length === 0 ? (
              <div className="px-3.5 py-8 text-center text-[0.75rem] text-muted-foreground">
                Καμία ειδοποίηση
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {items.map(n => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => { void handleItemClick(n) }}
                      className="flex w-full min-h-[2.75rem] flex-col items-start gap-0.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted"
                      style={
                        n.read
                          ? undefined
                          : { borderLeft: '3px solid var(--coral)', background: 'var(--coral-soft)' }
                      }
                    >
                      <span className="flex w-full items-center gap-2">
                        {!n.read && (
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ background: 'var(--coral)' }}
                            aria-hidden
                          />
                        )}
                        <span className={`min-w-0 flex-1 truncate text-[0.8125rem] ${n.read ? 'font-medium text-foreground' : 'font-bold text-foreground'}`}>
                          {n.title}
                        </span>
                        <span className="shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums">
                          {relativeTime(n.createdAt)}
                        </span>
                      </span>
                      {n.body && (
                        <span className="line-clamp-2 text-[0.75rem] text-muted-foreground">
                          {n.body}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
