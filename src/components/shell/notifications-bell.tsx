'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, MoreVertical, ExternalLink, Check } from 'lucide-react'
import {
  getUnreadNotificationCount,
  getNotifications,
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from '@/lib/notifications/actions'
import type { NotificationRow } from '@/lib/notifications/service'
import { notifTarget } from '@/lib/notifications/targets'
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
  const [menuId, setMenuId] = React.useState<string | null>(null)
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

  const markRead = React.useCallback(async (n: NotificationRow) => {
    if (n.read) return
    setItems(prev => prev.map(r => (r.id === n.id ? { ...r, read: true } : r)))
    setCount(c => Math.max(0, c - 1))
    await markNotificationReadAction(n.id)
  }, [])

  const handleOpen = React.useCallback(async (n: NotificationRow) => {
    setMenuId(null)
    await markRead(n)
    const target = notifTarget(n)
    if (target) { setOpen(false); router.push(target) }
  }, [markRead, router])

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
                {items.map(n => {
                  const target = notifTarget(n)
                  return (
                    <li key={n.id} className="relative">
                      <div
                        className="flex items-start gap-1"
                        style={n.read ? undefined : { borderLeft: '3px solid var(--coral)', background: 'var(--coral-soft)' }}
                      >
                        <button
                          type="button"
                          onClick={() => { void handleOpen(n) }}
                          className="flex min-h-[2.75rem] min-w-0 flex-1 flex-col items-start gap-0.5 py-2.5 pr-1 pl-3.5 text-left transition-colors hover:bg-muted"
                        >
                          <span className="flex w-full items-center gap-2">
                            {!n.read && <span className="size-1.5 shrink-0 rounded-full" style={{ background: 'var(--coral)' }} aria-hidden />}
                            <span className={`min-w-0 flex-1 truncate text-[0.8125rem] ${n.read ? 'font-medium text-foreground' : 'font-bold text-foreground'}`}>{n.title}</span>
                            <span className="shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums">{relativeTime(n.createdAt)}</span>
                          </span>
                          {n.body && <span className="line-clamp-2 text-[0.75rem] text-muted-foreground">{n.body}</span>}
                        </button>
                        <button
                          type="button"
                          aria-label="Ενέργειες"
                          onClick={e => { e.stopPropagation(); setMenuId(id => (id === n.id ? null : n.id)) }}
                          className="mt-1 mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <MoreVertical className="size-4" aria-hidden />
                        </button>
                      </div>

                      {menuId === n.id && (
                        <div className="absolute right-2 z-10 mt-1 min-w-max overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-lg">
                          {target && (
                            <button
                              type="button"
                              onClick={() => { void handleOpen(n) }}
                              className="flex min-h-9 w-full items-center gap-2 rounded-md px-3 text-left text-[0.8125rem] transition-colors hover:bg-muted"
                            >
                              <ExternalLink className="size-3.5" aria-hidden /> Άνοιγμα
                            </button>
                          )}
                          {!n.read && (
                            <button
                              type="button"
                              onClick={() => { setMenuId(null); void markRead(n) }}
                              className="flex min-h-9 w-full items-center gap-2 rounded-md px-3 text-left text-[0.8125rem] transition-colors hover:bg-muted"
                            >
                              <Check className="size-3.5" aria-hidden /> Σήμανση ως αναγνωσμένο
                            </button>
                          )}
                          {!target && n.read && (
                            <span className="block px-3 py-1.5 text-[0.75rem] text-muted-foreground">Καμία ενέργεια</span>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
