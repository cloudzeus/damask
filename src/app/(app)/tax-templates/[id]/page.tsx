import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { TemplateEditor, type TemplateMeta } from '@/components/tax/template-editor'
import type { TemplateField } from '@/lib/tax/template'
import { PageHeader } from '@/components/ui/page-header'

/**
 * Workbench εντύπου (Task 13): ανέβασμα δείγματος, σχεδίαση περιοχών πάνω στις
 * σελίδες του (RegionEditor — Task 12) και ορισμός/δοκιμή πεδίων (FieldList).
 * `fields` σερβίρεται ήδη ταξινομημένο ώστε ο editor να μην χρειάζεται δικό
 * του sort πριν τα δείξει/τα ξαναστείλει στο saveFields.
 */
export default async function TaxTemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('taxform.manage')
  const { id } = await params

  const template = await prisma.taxFormTemplate.findUnique({
    where: { id },
    include: { fields: { orderBy: { order: 'asc' } } },
  })
  if (!template) notFound()

  const meta: TemplateMeta = {
    id: template.id,
    code: template.code,
    name: template.name,
    year: template.year,
    description: template.description,
    status: template.status,
    sampleStorageKey: template.sampleStorageKey,
    samplePageCount: template.samplePageCount,
    documentTypeId: template.documentTypeId,
  }

  const fields: TemplateField[] = template.fields.map(f => ({
    id: f.id,
    fieldKey: f.fieldKey,
    label: f.label,
    section: f.section,
    valueType: f.valueType,
    kind: f.kind,
    config: f.config as unknown as TemplateField['config'],
    regionHint: f.regionHint as unknown as TemplateField['regionHint'],
    aiHint: f.aiHint,
    required: f.required,
    order: f.order,
  }))

  return (
    <div>
      <PageHeader
        breadcrumb={
          <>
            <Link href="/tax-templates" className="hover:text-foreground hover:underline">Οδηγοί Εντύπων</Link>{' '}
            <span aria-hidden>›</span>
          </>
        }
        title={template.name}
        subtitle={
          <>
            Κωδικός <span className="font-mono">{template.code}</span>
            {template.year != null ? ` · ${template.year}` : ''} — χαρτογράφησε περιοχές πάνω στο δείγμα και
            δοκίμασε κάθε πεδίο πριν το μαρκάρεις «Έτοιμο».
          </>
        }
      />

      <TemplateEditor template={meta} fields={fields} />
    </div>
  )
}
