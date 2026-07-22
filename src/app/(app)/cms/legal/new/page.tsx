import { requirePermission } from '@/lib/rbac-server'
import { assertObjectEnabled } from '@/lib/objects-server'
import { LegalEditor } from '../legal-editor'
import type { LegalPageFormValues } from '../actions'

const EMPTY_LOCALE = { title: '', body: '' }

export default async function NewLegalPagePage() {
  await requirePermission('cms.edit')
  await assertObjectEnabled('cms-legal')

  const initialValues: LegalPageFormValues = {
    slug: '',
    published: false,
    el: { ...EMPTY_LOCALE },
    en: { ...EMPTY_LOCALE },
    enMachineTranslated: false,
  }

  return <LegalEditor mode="create" initialValues={initialValues} />
}
