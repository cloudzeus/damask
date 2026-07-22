import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/rbac-server'
import { assertObjectEnabled } from '@/lib/objects-server'
import { prisma } from '@/lib/prisma'
import { LegalEditor } from '../../legal-editor'
import type { LegalPageFormValues } from '../../actions'

const EMPTY_LOCALE = { title: '', body: '' }

export default async function EditLegalPagePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('cms.edit')
  await assertObjectEnabled('cms-legal')
  const { id } = await params

  const page = await prisma.legalPage.findUnique({ where: { id }, include: { translations: true } })
  if (!page) notFound()

  const elTranslation = page.translations.find(t => t.locale === 'el')
  const enTranslation = page.translations.find(t => t.locale === 'en')

  const initialValues: LegalPageFormValues = {
    slug: page.slug,
    published: page.published,
    el: elTranslation ? { title: elTranslation.title, body: elTranslation.body } : { ...EMPTY_LOCALE },
    en: enTranslation ? { title: enTranslation.title, body: enTranslation.body } : { ...EMPTY_LOCALE },
    enMachineTranslated: enTranslation?.machineTranslated ?? false,
  }

  return <LegalEditor mode="edit" pageId={page.id} initialValues={initialValues} />
}
