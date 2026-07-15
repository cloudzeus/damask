'use client'

import { useMemo, useState } from 'react'
import { Search, Sparkles, CircleDashed, Clock3, CheckCircle2, Archive } from 'lucide-react'
import type { PostStatus } from '@prisma/client'
import { cn } from '@/lib/utils'
import { PostRowActions } from './post-row-actions'

export type PostRow = {
  id: string
  slug: string
  status: PostStatus
  aiGenerated: boolean
  titleEl: string
  hasEn: boolean
  categoryName: string | null
  authorName: string | null
  updatedLabel: string
}

const STATUS_META: Record<PostStatus, { label: string; cls: 'ok' | 'info' | 'muted'; icon: typeof CircleDashed }> = {
  DRAFT: { label: 'Πρόχειρο', cls: 'muted', icon: CircleDashed },
  REVIEW: { label: 'Σε έλεγχο', cls: 'info', icon: Clock3 },
  PUBLISHED: { label: 'Δημοσιευμένο', cls: 'ok', icon: CheckCircle2 },
  ARCHIVED: { label: 'Αρχειοθετημένο', cls: 'muted', icon: Archive },
}

export function PostsTable({ posts, canEdit }: { posts: PostRow[]; canEdit: boolean }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return posts
    return posts.filter(p =>
      p.titleEl.toLowerCase().includes(q)
      || (p.categoryName ?? '').toLowerCase().includes(q)
      || (p.authorName ?? '').toLowerCase().includes(q),
    )
  }, [posts, query])

  const colCount = canEdit ? 6 : 5

  return (
    <div className="glass table-card stagger">
      <div className="table-toolbar">
        <label className="search">
          <Search className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Αναζήτηση με τίτλο, κατηγορία ή συγγραφέα…"
            aria-label="Αναζήτηση άρθρων"
          />
        </label>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Τίτλος</th>
              <th>Κατηγορία</th>
              <th>Συγγραφέας</th>
              <th>Κατάσταση</th>
              <th>Ενημερώθηκε</th>
              {canEdit && <th className="ctr" style={{ width: 40 }}>⋯</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(post => {
              const meta = STATUS_META[post.status]
              return (
                <tr key={post.id} className="dotted-row-bottom">
                  <td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold">{post.titleEl}</span>
                      {post.aiGenerated && (
                        <span className="badge-pill info" title="Δημιουργήθηκε με AI">
                          <Sparkles className="size-3" strokeWidth={2.2} aria-hidden />
                          AI
                        </span>
                      )}
                      <span className={cn('badge-pill', post.hasEn ? 'ok' : 'muted')} title={post.hasEn ? 'Υπάρχει αγγλική μετάφραση' : 'Δεν υπάρχει αγγλική μετάφραση'}>
                        EN {post.hasEn ? '✓' : '—'}
                      </span>
                    </div>
                  </td>
                  <td>{post.categoryName ?? '—'}</td>
                  <td>{post.authorName ?? '—'}</td>
                  <td>
                    <span className={cn('badge-pill', meta.cls)}>
                      <meta.icon className="size-3" strokeWidth={2.2} aria-hidden />
                      {meta.label}
                    </span>
                  </td>
                  <td>{post.updatedLabel}</td>
                  {canEdit && (
                    <td className="ctr">
                      <PostRowActions post={post} />
                    </td>
                  )}
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={colCount} className="py-8 text-center text-muted-foreground">
                  Δεν βρέθηκαν άρθρα.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-foot dotted-row-top">
        <span>{filtered.length} {filtered.length === 1 ? 'άρθρο' : 'άρθρα'}</span>
      </div>
    </div>
  )
}
