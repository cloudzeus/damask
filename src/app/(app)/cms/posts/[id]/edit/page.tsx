import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { PostEditor, type Option } from '../../post-editor'
import type { PostFormValues } from '../../actions'

const EMPTY_LOCALE = { title: '', excerpt: '', body: '', seoTitle: '', seoDescription: '' }

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('cms.edit')
  const { id } = await params

  const [post, categories, authors] = await Promise.all([
    prisma.post.findUnique({ where: { id }, include: { translations: true } }),
    prisma.postCategory.findMany({
      include: { translations: { where: { locale: 'el' } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.author.findMany({ orderBy: { name: 'asc' } }),
  ])

  if (!post) notFound()

  const elTranslation = post.translations.find(t => t.locale === 'el')
  const enTranslation = post.translations.find(t => t.locale === 'en')

  const initialValues: PostFormValues = {
    slug: post.slug,
    status: post.status,
    categoryId: post.categoryId,
    authorId: post.authorId,
    featuredImage: post.featuredImage,
    el: elTranslation
      ? {
          title: elTranslation.title,
          excerpt: elTranslation.excerpt ?? '',
          body: elTranslation.body,
          seoTitle: elTranslation.seoTitle ?? '',
          seoDescription: elTranslation.seoDescription ?? '',
        }
      : { ...EMPTY_LOCALE },
    en: enTranslation
      ? {
          title: enTranslation.title,
          excerpt: enTranslation.excerpt ?? '',
          body: enTranslation.body,
          seoTitle: enTranslation.seoTitle ?? '',
          seoDescription: enTranslation.seoDescription ?? '',
        }
      : { ...EMPTY_LOCALE },
    enMachineTranslated: enTranslation?.machineTranslated ?? false,
  }

  const categoryOptions: Option[] = categories.map(c => ({ id: c.id, name: c.translations[0]?.name ?? c.slug }))
  const authorOptions: Option[] = authors.map(a => ({ id: a.id, name: a.name }))

  return (
    <PostEditor
      mode="edit"
      postId={post.id}
      initialValues={initialValues}
      categories={categoryOptions}
      authors={authorOptions}
    />
  )
}
