import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { relativeTime } from '@/lib/relative-time'
import { CmsPostsTabs } from './cms-tabs'
import { PostsTable, type PostRow } from './posts-table'
import { CategoriesTab, type CategoryRow } from './categories-tab'
import { AuthorsTab, type AuthorRow } from './authors-tab'
import { NewPostButton } from './new-post-button'
import { AiGenerateButton } from './ai-generate-dialog'

export default async function CmsPostsPage() {
  const session = await requirePermission('cms.view')
  const canEdit = session.user.permissions.includes('cms.edit')

  const [posts, categories, authors, users] = await Promise.all([
    prisma.post.findMany({
      include: { translations: true, category: { include: { translations: true } }, author: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.postCategory.findMany({
      include: { translations: true, _count: { select: { posts: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.author.findMany({
      include: { _count: { select: { posts: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  const now = new Date()

  const postRows: PostRow[] = posts.map(p => {
    const elTranslation = p.translations.find(t => t.locale === 'el')
    return {
      id: p.id,
      slug: p.slug,
      status: p.status,
      aiGenerated: p.aiGenerated,
      titleEl: elTranslation?.title ?? p.slug,
      hasEn: p.translations.some(t => t.locale === 'en'),
      categoryName: p.category?.translations.find(t => t.locale === 'el')?.name ?? null,
      authorName: p.author?.name ?? null,
      updatedLabel: relativeTime(p.updatedAt, now),
    }
  })

  const categoryRows: CategoryRow[] = categories.map(c => ({
    id: c.id,
    slug: c.slug,
    nameEl: c.translations.find(t => t.locale === 'el')?.name ?? c.slug,
    nameEn: c.translations.find(t => t.locale === 'en')?.name ?? null,
    postCount: c._count.posts,
  }))

  const userLookup = new Map(users.map(u => [u.id, u.name]))
  const authorRows: AuthorRow[] = authors.map(a => ({
    id: a.id,
    name: a.name,
    bio: a.bio,
    avatarUrl: a.avatarUrl,
    userId: a.userId,
    userName: a.userId ? (userLookup.get(a.userId) ?? null) : null,
    postCount: a._count.posts,
  }))

  const categoryOptions = categoryRows.map(c => ({ id: c.id, name: c.nameEl }))
  const userOptions = users.map(u => ({ id: u.id, name: u.name }))

  return (
    <div>
      <div className="mb-4 flex items-end gap-3 pt-1.5">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            CMS <span aria-hidden>›</span> <b className="text-foreground">Νέα</b>
          </div>
          <h1 className="text-[22px]">Νέα</h1>
          <p className="page-head-subtitle mt-0.5 text-[12.5px]">
            Άρθρα, κατηγορίες και συγγραφείς — με αυτόματη δημιουργία και μετάφραση EL→EN μέσω DeepSeek.
          </p>
        </div>
        <div className="flex-1" />
        {canEdit && (
          <>
            <AiGenerateButton categories={categoryOptions} />
            <NewPostButton />
          </>
        )}
      </div>

      <CmsPostsTabs
        posts={<PostsTable posts={postRows} canEdit={canEdit} />}
        categories={<CategoriesTab categories={categoryRows} canEdit={canEdit} />}
        authors={<AuthorsTab authors={authorRows} users={userOptions} canEdit={canEdit} />}
      />
    </div>
  )
}
