import { requirePermission } from '@/lib/rbac-server'
import { assertObjectEnabled } from '@/lib/objects-server'
import { prisma } from '@/lib/prisma'
import { PostEditor, type Option } from '../post-editor'
import type { PostFormValues } from '../actions'

const EMPTY_LOCALE = { title: '', excerpt: '', body: '', seoTitle: '', seoDescription: '' }

export default async function NewPostPage() {
  await requirePermission('cms.edit')
  await assertObjectEnabled('cms-posts')

  const [categories, authors] = await Promise.all([
    prisma.postCategory.findMany({
      include: { translations: { where: { locale: 'el' } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.author.findMany({ orderBy: { name: 'asc' } }),
  ])

  const initialValues: PostFormValues = {
    slug: '',
    status: 'DRAFT',
    categoryId: null,
    authorId: null,
    featuredImage: null,
    el: { ...EMPTY_LOCALE },
    en: { ...EMPTY_LOCALE },
    enMachineTranslated: false,
  }

  const categoryOptions: Option[] = categories.map(c => ({ id: c.id, name: c.translations[0]?.name ?? c.slug }))
  const authorOptions: Option[] = authors.map(a => ({ id: a.id, name: a.name }))

  return (
    <PostEditor
      mode="create"
      initialValues={initialValues}
      categories={categoryOptions}
      authors={authorOptions}
    />
  )
}
