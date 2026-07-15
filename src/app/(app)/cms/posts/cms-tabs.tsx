'use client'

import { useState } from 'react'
import { Newspaper, FolderTree, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'posts', label: 'Άρθρα', icon: Newspaper },
  { key: 'categories', label: 'Κατηγορίες', icon: FolderTree },
  { key: 'authors', label: 'Συγγραφείς', icon: Users },
] as const

type TabKey = (typeof TABS)[number]['key']

/** Pill tabs (ίδιο idiom με SettingsTabs) — τα 3 panels είναι server-rendered μία φορά και περνάνε ως children. */
export function CmsPostsTabs({
  posts, categories, authors,
}: {
  posts: React.ReactNode
  categories: React.ReactNode
  authors: React.ReactNode
}) {
  const [active, setActive] = useState<TabKey>('posts')

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap gap-1.5" role="tablist" aria-label="Ενότητες CMS">
        {TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`cms-tab-${tab.key}`}
            aria-selected={active === tab.key}
            aria-controls={`cms-panel-${tab.key}`}
            className={cn('pill', active === tab.key && 'on')}
            onClick={() => setActive(tab.key)}
          >
            <tab.icon className="size-3.5" strokeWidth={1.8} aria-hidden />
            {tab.label}
          </button>
        ))}
      </div>

      <div id="cms-panel-posts" role="tabpanel" aria-labelledby="cms-tab-posts" hidden={active !== 'posts'}>
        {posts}
      </div>
      <div id="cms-panel-categories" role="tabpanel" aria-labelledby="cms-tab-categories" hidden={active !== 'categories'}>
        {categories}
      </div>
      <div id="cms-panel-authors" role="tabpanel" aria-labelledby="cms-tab-authors" hidden={active !== 'authors'}>
        {authors}
      </div>
    </div>
  )
}
