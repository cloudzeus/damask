'use client'

import { useMemo, useState } from 'react'
import { Search, Sparkles, CircleDashed, Clock3, CheckCircle2, Archive } from 'lucide-react'
import type { PostStatus } from '@prisma/client'
import { cn } from '@/lib/utils'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
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

  const columns: DataTableColumn<PostRow>[] = [
    {
      id: 'title',
      header: 'Τίτλος',
      width: 300,
      enableHide: false,
      sortValue: p => p.titleEl,
      cell: p => (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold">{p.titleEl}</span>
          {p.aiGenerated && (
            <span className="badge-pill info" title="Δημιουργήθηκε με AI">
              <Sparkles className="size-3" strokeWidth={2.2} aria-hidden />
              AI
            </span>
          )}
          <span className={cn('badge-pill', p.hasEn ? 'ok' : 'muted')} title={p.hasEn ? 'Υπάρχει αγγλική μετάφραση' : 'Δεν υπάρχει αγγλική μετάφραση'}>
            EN {p.hasEn ? '✓' : '—'}
          </span>
        </div>
      ),
    },
    {
      id: 'category',
      header: 'Κατηγορία',
      width: 160,
      sortValue: p => p.categoryName ?? '',
      cell: p => p.categoryName ?? '—',
    },
    {
      id: 'author',
      header: 'Συγγραφέας',
      width: 160,
      sortValue: p => p.authorName ?? '',
      cell: p => p.authorName ?? '—',
    },
    {
      id: 'status',
      header: 'Κατάσταση',
      width: 160,
      sortValue: p => STATUS_META[p.status].label,
      cell: p => {
        const meta = STATUS_META[p.status]
        return (
          <span className={cn('badge-pill', meta.cls)}>
            <meta.icon className="size-3" strokeWidth={2.2} aria-hidden />
            {meta.label}
          </span>
        )
      },
    },
    {
      id: 'updated',
      header: 'Ενημερώθηκε',
      width: 150,
      sortValue: p => p.updatedLabel,
      cell: p => p.updatedLabel,
    },
    ...(canEdit
      ? ([
          {
            id: 'actions',
            header: '⋯',
            headerLabel: 'Ενέργειες',
            align: 'center',
            width: 48,
            enableHide: false,
            enableResize: false,
            cell: p => <PostRowActions post={p} />,
          },
        ] as DataTableColumn<PostRow>[])
      : []),
  ]

  return (
    <DataTable
      tableId="cms-posts"
      columns={columns}
      rows={filtered}
      rowKey={p => p.id}
      emptyMessage="Δεν βρέθηκαν άρθρα."
      footer={<span>{filtered.length} {filtered.length === 1 ? 'άρθρο' : 'άρθρα'}</span>}
      toolbarExtras={
        <label className="search">
          <Search className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Αναζήτηση με τίτλο, κατηγορία ή συγγραφέα…"
            aria-label="Αναζήτηση άρθρων"
          />
        </label>
      }
    />
  )
}
